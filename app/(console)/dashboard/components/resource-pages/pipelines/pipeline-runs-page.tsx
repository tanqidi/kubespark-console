"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconEye, IconFileText, IconPlayerPlay, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse as parseYaml, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
	createPipelineRun,
	deletePipelineRun,
	fetchDroneBuildInfo,
	fetchDroneBuildLogs,
	fetchPipelineYaml,
	fetchPipelineRunRows,
	type PipelineRunRow,
	type PipelineRunStage,
} from "@/app/lib/kubespark/pipelines"
import { fetchResourceByName } from "@/app/lib/kubespark/common"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LogViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/log-viewer-dialog"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

type PipelineRunsPageClientProps = {
  pipelineName: string
}
const CODE_REPOSITORY_ANNOTATION_KEY = "tanqidi.com/code-repository"
const DRONE_YAML_ANNOTATION_KEY = "tanqidi.com/drone-yaml"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

const MONACO_OPTIONS: EditorProps["options"] = {
  automaticLayout: true,
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  stickyScroll: { enabled: false },
  tabSize: 2,
  wordWrap: "on",
}

function splitRepository(value: string): { namespace: string; repo: string } {
  const segments = value
    .split("/")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  return {
    namespace: segments[0] ?? "",
    repo: segments.length >= 2 ? segments.slice(1).join("/") : "",
  }
}

function buildPipelineRunYamlText(params: {
  pipelineName: string
  repository: string
  droneYaml: string
}): string {
  const source = params.repository.trim()
  const parts = splitRepository(source)
  return stringify(
    {
      apiVersion: "tanqidi.com/v1alpha1",
      kind: "PipelineRun",
      metadata: {
        generateName: `${params.pipelineName.trim()}-`,
        labels: {
          pipeline: params.pipelineName.trim(),
        },
        ...(params.droneYaml.trim()
          ? {
              annotations: {
                [DRONE_YAML_ANNOTATION_KEY]: params.droneYaml.trim(),
              },
            }
          : {}),
      },
      spec: {
        pipelineRef: {
          name: params.pipelineName.trim(),
        },
        trigger: {
          type: "manual",
        },
        ...(parts.namespace && parts.repo
          ? {
              data: {
                namespace: parts.namespace,
                repo: parts.repo,
              },
            }
          : {}),
      },
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parsePipelineRunYamlText(
  yamlText: string,
  pipelineName: string
): { repository: string; droneYaml: string } {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error("请输入 YAML 内容")

  const parsed = parseYaml(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error("YAML 内容格式无效")

  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "PipelineRun") throw new Error("YAML 资源类型必须是 PipelineRun")

  const metadata =
    typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : {}
  const annotations =
    typeof metadata.annotations === "object" &&
    metadata.annotations !== null &&
    !Array.isArray(metadata.annotations)
      ? (metadata.annotations as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}
  const pipelineRef =
    typeof spec.pipelineRef === "object" && spec.pipelineRef !== null && !Array.isArray(spec.pipelineRef)
      ? (spec.pipelineRef as Record<string, unknown>)
      : {}
  const data =
    typeof spec.data === "object" && spec.data !== null && !Array.isArray(spec.data)
      ? (spec.data as Record<string, unknown>)
      : {}

  const refName = typeof pipelineRef.name === "string" ? pipelineRef.name.trim() : ""
  if (refName && refName !== pipelineName) {
    throw new Error(`pipelineRef.name 必须为当前流水线：${pipelineName}`)
  }

  const namespace = typeof data.namespace === "string" ? data.namespace.trim() : ""
  const repo = typeof data.repo === "string" ? data.repo.trim() : ""
  const repository = namespace && repo ? `${namespace}/${repo}` : ""
  const droneYaml =
    typeof annotations[DRONE_YAML_ANNOTATION_KEY] === "string"
      ? (annotations[DRONE_YAML_ANNOTATION_KEY] as string)
      : ""

  return {
    repository,
    droneYaml,
  }
}

function extractAnnotationFromPipelinePayload(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return ""
  const root = payload as Record<string, unknown>
  const metadata =
    root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : null
  if (!metadata) return ""
  const annotations =
    metadata.annotations && typeof metadata.annotations === "object" && !Array.isArray(metadata.annotations)
      ? (metadata.annotations as Record<string, unknown>)
      : null
  if (!annotations) return ""
  const value = annotations[key]
  return typeof value === "string" ? value.trim() : ""
}

function extractAnnotationFromPipelineYamlText(yamlText: string, key: string): string {
  const parsed = parseYaml(yamlText)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return ""
  const root = parsed as Record<string, unknown>
  const metadata =
    root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : null
  if (!metadata) return ""
  const annotations =
    metadata.annotations && typeof metadata.annotations === "object" && !Array.isArray(metadata.annotations)
      ? (metadata.annotations as Record<string, unknown>)
      : null
  if (!annotations) return ""
  const value = annotations[key]
  return typeof value === "string" ? value.trim() : ""
}

function sanitizePipelineRunYamlPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const root = payload as Record<string, unknown>
  const metadata =
    root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata)
      ? ({ ...(root.metadata as Record<string, unknown>) })
      : null
  if (!metadata) return payload
  delete metadata.managedFields
  return {
    ...root,
    metadata,
  }
}

function countLeadingSpaces(line: string): number {
  const match = line.match(/^ */)
  return match ? match[0].length : 0
}

function toYamlScalar(value: string): string {
  // Keep common git branch names unquoted; quote only when necessary.
  if (/^[A-Za-z0-9._/\-]+$/.test(value)) return value
  return `'${value.replace(/'/g, "''")}'`
}

function syncDroneYamlBranch(yamlText: string, branch: string): string {
  const normalizedYaml = yamlText.trim()
  const normalizedBranch = branch.trim()
  if (!normalizedYaml || !normalizedBranch) return yamlText

  try {
    const lines = yamlText.split(/\r?\n/)
    const triggerIndex = lines.findIndex((line) => /^\s*trigger\s*:\s*(#.*)?$/.test(line))
    if (triggerIndex < 0) return yamlText

    const triggerIndent = countLeadingSpaces(lines[triggerIndex] ?? "")
    let triggerEnd = lines.length
    for (let i = triggerIndex + 1; i < lines.length; i++) {
      const line = lines[i] ?? ""
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      if (countLeadingSpaces(line) <= triggerIndent) {
        triggerEnd = i
        break
      }
    }

    let branchIndex = -1
    for (let i = triggerIndex + 1; i < triggerEnd; i++) {
      const line = lines[i] ?? ""
      if (/^\s*branch\s*:\s*(#.*)?$/.test(line)) {
        branchIndex = i
        break
      }
    }

    const branchScalar = toYamlScalar(normalizedBranch)

    if (branchIndex >= 0) {
      const branchIndent = countLeadingSpaces(lines[branchIndex] ?? "")
      let branchEnd = triggerEnd
      for (let i = branchIndex + 1; i < triggerEnd; i++) {
        const line = lines[i] ?? ""
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        if (countLeadingSpaces(line) <= branchIndent) {
          branchEnd = i
          break
        }
      }

      const itemIndent = " ".repeat(branchIndent + 2)
      const nextLines = [
        ...lines.slice(0, branchIndex + 1),
        `${itemIndent}- ${branchScalar}`,
        ...lines.slice(branchEnd),
      ]
      return nextLines.join("\n")
    }

    // trigger exists but no branch section yet: inject it as first child under trigger.
    const childIndent = " ".repeat(triggerIndent + 2)
    const itemIndent = " ".repeat(triggerIndent + 4)
    const injected = [
      ...lines.slice(0, triggerIndex + 1),
      `${childIndent}branch:`,
      `${itemIndent}- ${branchScalar}`,
      ...lines.slice(triggerIndex + 1),
    ]
    return injected.join("\n")
  } catch {
    return yamlText
  }
}

const pipelineRunColumns: ColumnConfig<PipelineRunRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "phase", label: "状态", render: "status" },
  { key: "buildNumber", label: "构建号" },
  { key: "branch", label: "分支" },
  { key: "triggerTime", label: "触发时间" },
]

export function PipelineRunsPageClient({ pipelineName }: PipelineRunsPageClientProps) {
  const normalizedPipelineName = pipelineName.trim()
  const [rows, setRows] = React.useState<PipelineRunRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const [nameQuery, setNameQuery] = React.useState("")
  const [runDialogOpen, setRunDialogOpen] = React.useState(false)
  const [runStep, setRunStep] = React.useState<"basic" | "advanced">("basic")
  const [runYamlMode, setRunYamlMode] = React.useState(false)
  const [runDroneYamlMode, setRunDroneYamlMode] = React.useState(false)
  const [runRepository, setRunRepository] = React.useState("")
  const [runBranch, setRunBranch] = React.useState("")
  const [runBranchError, setRunBranchError] = React.useState<string | null>(null)
  const [runDescription, setRunDescription] = React.useState("")
  const [runRepositoryLoading, setRunRepositoryLoading] = React.useState(false)
  const [runYamlDraft, setRunYamlDraft] = React.useState("")
  const [runDroneYamlDefault, setRunDroneYamlDefault] = React.useState("")
  const [runDroneYaml, setRunDroneYaml] = React.useState("")
  const [runDroneYamlDraft, setRunDroneYamlDraft] = React.useState("")
  const [runYamlError, setRunYamlError] = React.useState<string | null>(null)
  const [runError, setRunError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<PipelineRunRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlSubtitle, setYamlSubtitle] = React.useState("查看 PipelineRun 的 YAML 内容。")
  const [logOpen, setLogOpen] = React.useState(false)
  const [logLoading, setLogLoading] = React.useState(false)
  const [logError, setLogError] = React.useState<string | null>(null)
  const [logContent, setLogContent] = React.useState("")
  const [logRealtime, setLogRealtime] = React.useState(false)
  const [logTitle, setLogTitle] = React.useState("查看日志")
  const [logSubtitle, setLogSubtitle] = React.useState("")
  const [currentLogBuildNumber, setCurrentLogBuildNumber] = React.useState("")
  const [currentLogRepository, setCurrentLogRepository] = React.useState("")
  const [currentLogStages, setCurrentLogStages] = React.useState<PipelineRunStage[]>([])
  const [currentLogStage, setCurrentLogStage] = React.useState<number | undefined>(undefined)
  const [currentLogStep, setCurrentLogStep] = React.useState<number | undefined>(undefined)

  const loadRows = React.useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        const items = await fetchPipelineRunRows(normalizedPipelineName)
        setRows(items)
        if (!silent) setError(null)
      } catch (e: unknown) {
        if (!silent) setError(e instanceof Error ? e.message : "加载运行记录失败")
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [normalizedPipelineName]
  )

  React.useEffect(() => {
    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [loadRows])

  React.useEffect(() => {
    let cancelled = false
    setRunRepositoryLoading(true)
    setRunError(null)

    void fetchResourceByName<unknown>("tanqidi.com", "v1alpha1", "pipelines", normalizedPipelineName)
      .then(async ({ payload }) => {
        let nextRepository = extractAnnotationFromPipelinePayload(payload, CODE_REPOSITORY_ANNOTATION_KEY)
        let nextDroneYaml = extractAnnotationFromPipelinePayload(payload, DRONE_YAML_ANNOTATION_KEY)
        if (!nextRepository) {
          try {
            const yamlText = await fetchPipelineYaml(normalizedPipelineName)
            nextRepository = extractAnnotationFromPipelineYamlText(yamlText, CODE_REPOSITORY_ANNOTATION_KEY)
            if (!nextDroneYaml) {
              nextDroneYaml = extractAnnotationFromPipelineYamlText(yamlText, DRONE_YAML_ANNOTATION_KEY)
            }
          } catch {
            // ignore fallback parse errors and keep empty value
          }
        }
        if (cancelled) return
        setRunRepository(nextRepository)
        setRunDroneYamlDefault(nextDroneYaml)
        setRunDroneYaml(nextDroneYaml)
        setRunDroneYamlDraft(nextDroneYaml)
      })
      .catch(() => {
        if (cancelled) return
        setRunRepository("")
        setRunDroneYamlDefault("")
        setRunDroneYaml("")
        setRunDroneYamlDraft("")
      })
      .finally(() => {
        if (cancelled) return
        setRunRepositoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [normalizedPipelineName])

  React.useEffect(() => {
    if (!runDialogOpen) return
    const nextYaml = syncDroneYamlBranch(runDroneYaml, runBranch)
    if (nextYaml === runDroneYaml) return
    setRunDroneYaml(nextYaml)
    setRunDroneYamlDraft(nextYaml)
  }, [runBranch, runDialogOpen, runDroneYaml])

  const handleRun = React.useCallback(() => {
    if (running || runRepositoryLoading) return
    const source = runRepository.trim()
    const { namespace, repo } = splitRepository(source)
    if (!source) {
      setRunError("请先在流水线中配置代码仓库（owner/repo）")
      return
    }
    if (!namespace || !repo) {
      setRunError("代码仓库注解格式无效，需为 owner/repo")
      return
    }

    const normalizedBranch = runBranch.trim()
    if (!normalizedBranch) {
      setRunBranchError("请输入分支名称")
      return
    }

    setRunning(true)
    setRunError(null)
    setError(null)
    const normalizedDroneYaml = syncDroneYamlBranch(runDroneYaml.trim(), runBranch.trim()).trim()
    void createPipelineRun({
        pipelineName: normalizedPipelineName,
        triggerType: "manual",
        data: {
          namespace,
          repo,
          ...(runBranch.trim() ? { branch: runBranch.trim() } : {}),
        },
        ...(normalizedDroneYaml
          ? {
              annotations: {
                [DRONE_YAML_ANNOTATION_KEY]: normalizedDroneYaml,
              },
            }
          : {}),
      })
      .then(() => {
        // Trigger request accepted: close immediately, no need to wait build completion.
        setRunDialogOpen(false)
        setRunning(false)
        void loadRows(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "触发流水线运行失败"
        setRunError(message)
        setError(message)
        setRunning(false)
      })
  }, [loadRows, normalizedPipelineName, runBranch, runDroneYaml, runRepository, runRepositoryLoading, running])

  const handleViewLogs = React.useCallback(
    (row: PipelineRunRow) => {
      const buildNumber = row.buildNumber.trim()
      if (!buildNumber || buildNumber === "-") {
        return
      }

      const repository = row.repository.trim()
      if (!repository || repository === "-") {
        setLogOpen(true)
      setLogLoading(false)
      setLogError("无法获取仓库信息")
      setLogContent("")
      setLogTitle("查看日志")
      setLogSubtitle(`查看 Drone PipelineRun（${row.name}）的日志内容。`)
      setLogRealtime(true)
      setCurrentLogBuildNumber(buildNumber)
      setCurrentLogRepository("")
      setCurrentLogStages([])
      setCurrentLogStage(undefined)
      setCurrentLogStep(undefined)
        return
      }

      const repoParts = repository.split("/")
      const displayRepo = repoParts.length >= 2 ? repoParts.slice(-2).join("/") : repository
      
      // Combine repo and name, then take last 2 segments
      const fullPath = `${displayRepo}/${row.name}`
      const fullPathParts = fullPath.split("/")
      const displayPath = fullPathParts.length >= 2 ? fullPathParts.slice(-2).join("/") : fullPath

      setLogOpen(true)
      setLogLoading(true)
      setLogError(null)
      setLogContent("")
      setLogTitle("查看日志")
      setLogSubtitle(`查看 Drone PipelineRun（${displayPath}）的日志内容。`)
      setLogRealtime(true)
      setCurrentLogBuildNumber(buildNumber)
      setCurrentLogRepository(repository)
      setCurrentLogStages(row.stages || [])
      setCurrentLogStage(undefined)
      setCurrentLogStep(undefined)

      if (row.stages && row.stages.length > 0 && row.stages[0].steps.length > 0) {
        const firstStage = row.stages[0]
        const firstStep = firstStage.steps[0]
        setCurrentLogStage(firstStage.number)
        setCurrentLogStep(firstStep.number)
        void fetchDroneBuildLogs(repository, buildNumber, firstStage.number, firstStep.number)
          .then((logs) => {
            setLogContent(logs || "(无日志输出)")
            setLogError(null)
          })
          .catch((e: unknown) => {
            const errorMessage = e instanceof Error ? e.message : "获取日志失败"
            if (errorMessage.includes("404") || errorMessage.includes("no rows in result set")) {
              setLogContent("日志正在处理中...")
              setLogError(null)
            } else {
              setLogError(errorMessage)
            }
          })
          .finally(() => {
            setLogLoading(false)
          })
      } else {
        void fetchDroneBuildLogs(repository, buildNumber)
          .then((logs) => {
            setLogContent(logs || "(无日志输出)")
            setLogError(null)
          })
          .catch((e: unknown) => {
            const errorMessage = e instanceof Error ? e.message : "获取日志失败"
            if (errorMessage.includes("404") || errorMessage.includes("no rows in result set")) {
              setLogContent("日志正在处理中...")
              setLogError(null)
            } else {
              setLogError(errorMessage)
            }
          })
          .finally(() => {
            setLogLoading(false)
          })
      }
    },
    []
  )

  const handleDownloadLogs = React.useCallback(() => {
    if (!logContent) return

    const blob = new Blob([logContent], { type: "text/plain;charset=utf-8" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `build-${currentLogBuildNumber}-logs.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }, [logContent, currentLogBuildNumber])

  const handleLogStageStepChange = React.useCallback(
    (stage: number, step: number) => {
      if (!currentLogBuildNumber || !currentLogRepository) return

      setCurrentLogStage(stage)
      setCurrentLogStep(step)
      setLogLoading(true)
      setLogError(null)

      void fetchDroneBuildLogs(currentLogRepository, currentLogBuildNumber, stage, step)
        .then((logs) => {
          setLogContent(logs || "(无日志输出)")
          setLogError(null)
        })
        .catch((e: unknown) => {
          const errorMessage = e instanceof Error ? e.message : "获取日志失败"
          if (errorMessage.includes("404") || errorMessage.includes("no rows in result set")) {
            setLogContent("日志正在处理中...")
            setLogError(null)
          } else {
            setLogError(errorMessage)
          }
        })
        .finally(() => {
          setLogLoading(false)
        })
    },
    [currentLogBuildNumber, currentLogRepository]
  )

  React.useEffect(() => {
    if (!logOpen || !logRealtime || !currentLogBuildNumber || !currentLogRepository) return

    const timer = window.setInterval(async () => {
      try {
        await Promise.all([
          fetchDroneBuildLogs(currentLogRepository, currentLogBuildNumber, currentLogStage, currentLogStep)
            .then((logs) => {
              setLogContent(logs || "(无日志输出)")
              setLogError(null)
            })
            .catch((e: unknown) => {
              const errorMessage = e instanceof Error ? e.message : "获取日志失败"
              if (errorMessage.includes("404") || errorMessage.includes("no rows in result set")) {
                setLogContent("日志正在处理中...")
                setLogError(null)
              }
            }),
          
          fetchDroneBuildInfo(currentLogRepository, currentLogBuildNumber)
            .then((stages) => {
              if (stages.length > 0) {
                setCurrentLogStages(stages)
              }
            })
            .catch(() => {}),
        ])
      } catch {
      }
    }, 2000)

    return () => {
      window.clearInterval(timer)
    }
  }, [logOpen, logRealtime, currentLogBuildNumber, currentLogRepository, currentLogStage, currentLogStep])

  const columns = React.useMemo(
    () =>
      createColumns<PipelineRunRow>({
        columns: pipelineRunColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                查看 YAML
              </>
            ),
            onSelect: (row) => {
              const name = row.name.trim()
              if (!name || name === "-") return

              setYamlOpen(true)
              setYamlLoading(true)
              setYamlError(null)
              setYamlContent("")
              setYamlSubtitle(`查看 PipelineRun（${name}）的 YAML 内容。`)

              void fetchResourceByName<unknown>("tanqidi.com", "v1alpha1", "pipelineruns", name)
                .then(({ payload }) => {
                  const sanitizedPayload = sanitizePipelineRunYamlPayload(payload)
                  setYamlContent(
                    stringify(sanitizedPayload, {
                      indent: 2,
                      lineWidth: 0,
                      sortMapEntries: false,
                    })
                  )
                })
                .catch((e: unknown) => {
                  setYamlError(e instanceof Error ? e.message : "加载 YAML 失败")
                })
                .finally(() => {
                  setYamlLoading(false)
                })
            },
          },
          {
            label: (
              <>
                <IconFileText className="size-4" />
                日志
              </>
            ),
            onSelect: handleViewLogs,
            disabled: (row) => row.phase === "pending" || row.phase === "-" || !row.buildNumber || row.buildNumber === "-",
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                删除
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              setPendingDeleteRow(row)
            },
          },
        ],
      }),
    [handleViewLogs]
  )

  const handleDeleteSelectedRows = React.useCallback(
    (selectedRows: PipelineRunRow[]) => {
      if (selectedRows.length === 0 || deleting) return

      const names = selectedRows
        .map((row) => row.name.trim())
        .filter((name) => name.length > 0 && name !== "-")
      if (names.length === 0) return

      setDeleting(true)
      setError(null)
      void Promise.all(names.map((name) => deletePipelineRun(name)))
        .then(() => {
          void loadRows(false)
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "删除运行记录失败")
        })
        .finally(() => {
          setDeleting(false)
        })
    },
    [deleting, loadRows]
  )

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return

    const targetName = pendingDeleteRow.name.trim()
    if (!targetName || targetName === "-") return

    setDeleting(true)
    setError(null)
    void deletePipelineRun(targetName)
      .then(() => {
        setPendingDeleteRow(null)
        void loadRows(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "删除运行记录失败")
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, loadRows, pendingDeleteRow])

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  if (error && !loading) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <MonacoViewerDialog
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        title="查看 YAML"
        subtitle={yamlSubtitle}
        value={yamlLoading ? "加载中..." : yamlContent}
        language="yaml"
        error={yamlError}
      />
      <LogViewerDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        title={logTitle}
        subtitle={logSubtitle}
        realtime={logRealtime}
        onRealtimeChange={setLogRealtime}
        loading={logLoading}
        error={logError}
        content={logContent}
        onDownload={handleDownloadLogs}
        downloadDisabled={!logContent}
        stages={currentLogStages}
        currentStage={currentLogStage}
        currentStep={currentLogStep}
        onStageStepChange={handleLogStageStepChange}
      />
      <Dialog
        open={runDialogOpen}
        onOpenChange={(open) => {
          if (!open && running) return
          setRunDialogOpen(open)
          if (open) {
            setRunStep("basic")
            setRunYamlMode(false)
            setRunDroneYamlMode(false)
            setRunYamlError(null)
            setRunError(null)
            setRunBranch("")
            setRunBranchError(null)
            setRunDescription("")
            setRunDroneYaml(runDroneYamlDefault)
            setRunDroneYamlDraft(runDroneYamlDefault)
            setRunYamlDraft(
              buildPipelineRunYamlText({
                pipelineName: normalizedPipelineName,
                repository: runRepository,
                droneYaml: runDroneYamlDefault,
              })
            )
            if (!runRepository.trim()) {
              setRunError("请先在流水线中配置代码仓库（owner/repo）")
            }
          }
        }}
      >
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>立即运行</DialogTitle>
                <DialogDescription>创建一次 PipelineRun，可按需覆盖 .drone.yml</DialogDescription>
              </DialogHeader>
              <div className="me-20 flex h-full items-center">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                    <span className="text-sm font-medium">编辑 YAML</span>
                    <Switch
                      checked={runYamlMode}
                      onCheckedChange={(checked) => {
                        if (running || runRepositoryLoading) return
                        setRunYamlError(null)
                        if (checked) {
                          setRunYamlDraft(
                            buildPipelineRunYamlText({
                              pipelineName: normalizedPipelineName,
                              repository: runRepository,
                              droneYaml: runDroneYaml,
                            })
                          )
                        }
                        setRunYamlMode(checked)
                        if (checked) setRunDroneYamlMode(false)
                      }}
                      disabled={running || runRepositoryLoading}
                      aria-label="编辑 YAML"
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                    <span className="text-sm font-medium">编辑 .drone.yml</span>
                    <Switch
                      checked={runDroneYamlMode}
                      onCheckedChange={(checked) => {
                        if (running || runRepositoryLoading) return
                        if (checked) {
                          setRunDroneYamlDraft(runDroneYaml)
                        }
                        setRunDroneYamlMode(checked)
                        if (checked) setRunYamlMode(false)
                      }}
                      disabled={running || runRepositoryLoading}
                      aria-label="编辑 .drone.yml"
                    />
                  </div>
                </div>
              </div>
            </div>
            {!runDroneYamlMode && !runYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: "基本信息",
                    status: runStep === "basic" ? "当前" : "已设置",
                    active: runStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: running || runRepositoryLoading,
                    onClick: () => {
                      if (running || runRepositoryLoading) return
                      setRunStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status: runStep === "advanced" ? "当前" : "已设置",
                    active: runStep === "advanced",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: running || runRepositoryLoading,
                    onClick: () => {
                      if (running || runRepositoryLoading) return
                      setRunStep("advanced")
                    },
                  },
                ]}
              />
            ) : null}
            <div className={`min-h-0 flex-1 p-6 ${runDroneYamlMode || runYamlMode ? "flex flex-col" : "overflow-y-auto"}`}>
              {!runDroneYamlMode && !runYamlMode ? (
                runStep === "basic" ? (
                  <>
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">运行参数</h3>
                    <p className="mt-1 text-sm text-muted-foreground">指定本次运行使用的参数，流水线将从该仓库获取代码并执行</p>
                  </div>
                  <FieldGroup className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="pipeline-run-repository">代码仓库</FieldLabel>
                        <Input
                          id="pipeline-run-repository"
                          value={runRepository}
                          placeholder={runRepositoryLoading ? "读取中..." : "owner/repo"}
                          autoComplete="off"
                          disabled
                          readOnly
                        />
                        <FieldDescription>要构建的 Drone 仓库（owner/repo）</FieldDescription>
                      </Field>
                      <Field data-invalid={Boolean(runBranchError)}>
                        <FieldLabel htmlFor="pipeline-run-branch">分支</FieldLabel>
                        <Input
                          id="pipeline-run-branch"
                          value={runBranch}
                          onChange={(event) => {
                            setRunBranch(event.target.value)
                            if (runBranchError) setRunBranchError(null)
                          }}
                          placeholder="请输入分支名称"
                          autoComplete="off"
                          aria-invalid={Boolean(runBranchError)}
                          disabled={running || runRepositoryLoading}
                        />
                        {runBranchError ? (
                          <FieldError>{runBranchError}</FieldError>
                        ) : (
                          <FieldDescription>要构建的 Git 分支</FieldDescription>
                        )}
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="pipeline-run-description">描述</FieldLabel>
                      <Textarea
                        id="pipeline-run-description"
                        value={runDescription}
                        onChange={(event) => setRunDescription(event.target.value)}
                        placeholder="请输入描述"
                        className="min-h-28"
                        maxLength={256}
                        disabled={running || runRepositoryLoading}
                      />
                      <FieldDescription>描述信息仅用于本次运行说明，最长 256 个字符</FieldDescription>
                    </Field>
                  </FieldGroup>
                  {runError ? <FieldError className="mt-3">{runError}</FieldError> : null}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300/80 bg-muted/10">
                    <p className="text-sm text-muted-foreground">高级设置能力敬请期待。</p>
                  </div>
                )
              ) : runYamlMode ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <FieldGroup className="grid min-h-0 flex-1 grid-cols-1 gap-4">
                    <Field className="flex min-h-0 flex-1 flex-col">
                      <div
                        id="pipeline-run-yaml"
                        className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner"
                      >
                        <MonacoEditor
                          language="yaml"
                          theme="vs-dark"
                          value={runYamlDraft}
                          onChange={(value) => {
                            setRunYamlDraft(value ?? "")
                            if (runYamlError) setRunYamlError(null)
                          }}
                          options={MONACO_OPTIONS}
                          height="100%"
                          loading={<div className="p-3 text-xs text-slate-300">编辑器加载中...</div>}
                        />
                      </div>
                      {runYamlError ? <FieldError className="mt-3">{runYamlError}</FieldError> : null}
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <FieldGroup className="grid min-h-0 flex-1 grid-cols-1 gap-4">
                    <Field className="flex min-h-0 flex-1 flex-col">
                      <div
                        id="pipeline-run-drone-yaml"
                        className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner"
                      >
                        <MonacoEditor
                          language="yaml"
                          theme="vs-dark"
                          value={runDroneYamlDraft}
                          onChange={(value) => setRunDroneYamlDraft(value ?? "")}
                          options={MONACO_OPTIONS}
                          height="100%"
                          loading={<div className="p-3 text-xs text-slate-300">编辑器加载中...</div>}
                        />
                      </div>
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>
            <DialogFooter className="border-t bg-background px-6 py-5">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={running || runRepositoryLoading}>
                    取消
                  </Button>
                </DialogClose>
                {runYamlMode ? (
                  <Button
                    type="button"
                    onClick={() => {
                      try {
                        const parsed = parsePipelineRunYamlText(runYamlDraft, normalizedPipelineName)
                        setRunRepository(parsed.repository)
                        setRunDroneYaml(parsed.droneYaml)
                        setRunDroneYamlDraft(parsed.droneYaml)
                        setRunYamlError(null)
                        setRunError(null)
                        setRunYamlMode(false)
                      } catch (e: unknown) {
                        setRunYamlError(e instanceof Error ? e.message : "YAML 解析失败")
                      }
                    }}
                    disabled={running || runRepositoryLoading}
                  >
                    确认保存
                  </Button>
                ) : runDroneYamlMode ? (
                  <Button
                    type="button"
                    onClick={() => {
                      setRunDroneYaml(runDroneYamlDraft)
                      setRunDroneYamlMode(false)
                    }}
                    disabled={running || runRepositoryLoading}
                  >
                    确认保存
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void handleRun()} disabled={running || runRepositoryLoading}>
                    {runRepositoryLoading ? "读取中..." : running ? "触发中..." : "立即运行"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        title="删除运行记录"
        description={pendingDeleteRow ? `确定删除运行记录 ${pendingDeleteRow.name} 吗？` : ""}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        showColumnCustomizer={false}
        toolbarEnd={
          <div className="flex items-center gap-2">
            <Input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="名称"
              className="h-9 w-40"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setRunDialogOpen(true)} disabled={running}>
              <IconPlayerPlay className="size-4" />
              立即运行
            </Button>
          </div>
        }
      />
    </div>
  )
}
