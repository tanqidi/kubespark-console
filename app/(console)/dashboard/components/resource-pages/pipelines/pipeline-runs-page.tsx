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
	buildDroneBuildLogsStreamUrl,
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
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"
import { useTranslations } from "@/app/lib/i18n"

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
  if (!normalized) throw new Error("yamlRequired")

  const parsed = parseYaml(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error("yamlInvalid")

  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "PipelineRun") throw new Error("yamlKindMustBePipelineRun")

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
    throw new Error("pipelineRefNameMustBeCurrent")
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

export function PipelineRunsPageClient({ pipelineName }: PipelineRunsPageClientProps) {
  const t = useTranslations()
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
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")
  const [logOpen, setLogOpen] = React.useState(false)
  const [logLoading, setLogLoading] = React.useState(false)
  const [logError, setLogError] = React.useState<string | null>(null)
  const [logContent, setLogContent] = React.useState("")
  const [logRealtime, setLogRealtime] = React.useState(false)
  const [logTitle, setLogTitle] = React.useState("")
  const [logSubtitle, setLogSubtitle] = React.useState("")
  const [currentLogBuildNumber, setCurrentLogBuildNumber] = React.useState("")
  const [currentLogRepository, setCurrentLogRepository] = React.useState("")
  const [currentLogStages, setCurrentLogStages] = React.useState<PipelineRunStage[]>([])
  const [currentLogStage, setCurrentLogStage] = React.useState<number | undefined>(undefined)
  const [currentLogStep, setCurrentLogStep] = React.useState<number | undefined>(undefined)
  // 现在这里存放的是 EventSource
  const abortControllerRef = React.useRef<any | null>(null)
  
  // 监听 logOpen 变化，当关闭对话框时清理 EventSource
  React.useEffect(() => {
    if (!logOpen) {
      // 关闭对话框，清理 EventSource
      if (abortControllerRef.current) {
        if (typeof abortControllerRef.current.close === 'function') {
          abortControllerRef.current.close()
        }
        abortControllerRef.current = null
      }
    }
  }, [logOpen])

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
        if (!silent) setError(e instanceof Error ? e.message : "loadPipelineRunsFailed")
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [normalizedPipelineName]
  )

  React.useEffect(() => {
    void loadRows(false)
  }, [loadRows])

  useIntervalRefresh(() => loadRows(true), 3000)

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
      setRunError(t("pipelineRuns.repoRequired"))
      return
    }
    if (!namespace || !repo) {
      setRunError(t("pipelineRuns.repoFormatInvalid"))
      return
    }

    const normalizedBranch = runBranch.trim()
    if (!normalizedBranch) {
      setRunBranchError(t("pipelineRuns.branchRequired"))
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
        const message = e instanceof Error ? e.message : t("pipelineRuns.triggerFailed")
        setRunError(message)
        setError(message)
        setRunning(false)
      })
  }, [loadRows, normalizedPipelineName, runBranch, runDroneYaml, runRepository, runRepositoryLoading, running, t])

  const connectToEventStream = React.useCallback(
    async (repository: string, buildNumber: string, stage?: number, step?: number) => {
      // 关闭之前的连接
      if (abortControllerRef.current) {
        // 这里 abortControllerRef.current 其实是 EventSource，我们把它 close 掉
        if (typeof abortControllerRef.current.close === 'function') {
          abortControllerRef.current.close()
        }
        abortControllerRef.current = null
      }

      try {
        const streamUrl = await buildDroneBuildLogsStreamUrl(repository, buildNumber, stage, step)
        
        console.log("[logs] Connecting to EventSource:", streamUrl)
        
        // 使用 EventSource API（标准 SSE 连接）
        const eventSource = new EventSource(streamUrl)
        
        abortControllerRef.current = eventSource

        setLogError(null)

        eventSource.onmessage = (event) => {
          console.log("[logs] Message received:", event.data)
          
          if (event.data === 'eof') {
            // Drone sends 'eof' to indicate stream completion
            console.log("[logs] Received eof, closing connection")
            eventSource.close()
            if (abortControllerRef.current === eventSource) {
              abortControllerRef.current = null
            }
            return
          }
          
          // Parse JSON data (Drone format)
          try {
            const logEntry = JSON.parse(event.data)
            if (logEntry.out) {
              setLogContent((prev) => prev + logEntry.out)
            }
          } catch (e) {
            // Fallback: treat as plain text
            setLogContent((prev) => prev + event.data)
          }
        }

        eventSource.onerror = (error) => {
          console.error("[logs] EventSource error:", error)
          // 注意：不要在这里调用 eventSource.close()，因为 retry: 0 会处理
          // 但为了安全，我们还是主动关闭
          try {
            eventSource.close()
          } catch (e) {
            // ignore
          }
          if (abortControllerRef.current === eventSource) {
            abortControllerRef.current = null
          }
        }

        eventSource.onopen = () => {
          console.log("[logs] EventSource opened")
          setLogError(null)
        }

      } catch (e) {
        console.error("Failed to create EventSource:", e)
      }
    },
    []
  )

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
        setLogError(t("pipelineRuns.getRepoInfoFailed"))
        setLogContent("")
        setLogTitle(t("pipelineRuns.viewLogsTitle"))
        setLogSubtitle(t("pipelineRuns.viewLogsSubtitleNoRepo", { name: row.name }))
        setLogRealtime(false)
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
      setLogTitle(t("pipelineRuns.viewLogsTitle"))
      setLogSubtitle(t("pipelineRuns.viewLogsSubtitle", { name: displayPath }))
      setLogRealtime(false)
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

        // 1. 先尝试获取历史日志
        fetchDroneBuildLogs(repository, buildNumber, firstStage.number, firstStep.number)
          .then((logs) => {
            if (logs && logs.length > 0) {
              // 有历史日志，直接显示
              setLogContent(logs.map((l) => l.out).join(""))
              setLogError(null)
              setLogLoading(false)
            } else {
              // 没有历史日志，走实时流
              setLogContent(t("pipelineRuns.logsProcessing"))
              setLogError(null)
              setLogLoading(false)
              setLogRealtime(true)
              connectToEventStream(repository, buildNumber, firstStage.number, firstStep.number)
            }
          })
          .catch((err) => {
            console.log("[logs] 没有历史日志，走实时流:", err)
            setLogContent(t("pipelineRuns.logsProcessing"))
            setLogError(null)
            setLogLoading(false)
            setLogRealtime(true)
            connectToEventStream(repository, buildNumber, firstStage.number, firstStep.number)
          })
      } else {
        // 1. 先尝试获取历史日志
        fetchDroneBuildLogs(repository, buildNumber)
          .then((logs) => {
            if (logs && logs.length > 0) {
              // 有历史日志，直接显示
              setLogContent(logs.map((l) => l.out).join(""))
              setLogError(null)
              setLogLoading(false)
            } else {
              // 没有历史日志，走实时流
              setLogContent(t("pipelineRuns.logsProcessing"))
              setLogError(null)
              setLogLoading(false)
              setLogRealtime(true)
              connectToEventStream(repository, buildNumber)
            }
          })
          .catch((err) => {
            console.log("[logs] 没有历史日志，走实时流:", err)
            setLogContent(t("pipelineRuns.logsProcessing"))
            setLogError(null)
            setLogLoading(false)
            setLogRealtime(true)
            connectToEventStream(repository, buildNumber)
          })
      }
    },
    [t, connectToEventStream]
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
      setLogContent("")

      // 使用 EventStream 实时获取日志
      connectToEventStream(currentLogRepository, currentLogBuildNumber, stage, step)
      
      // 同时也获取一次完整的历史日志
      void fetchDroneBuildLogs(currentLogRepository, currentLogBuildNumber, stage, step)
        .then((logs) => {
          if (logs && logs.length > 0) {
            setLogContent(logs.map((l) => l.out).join(""))
          } else {
            setLogContent(t("pipelineRuns.logsProcessing"))
          }
          setLogError(null)
        })
        .catch((e: unknown) => {
          const errorMessage = e instanceof Error ? e.message : t("pipelineRuns.loadLogsFailed")
          if (errorMessage.includes("404") || errorMessage.includes("no rows in result set")) {
            setLogContent(t("pipelineRuns.logsProcessing"))
            setLogError(null)
          } else {
            setLogError(errorMessage)
          }
        })
        .finally(() => {
          setLogLoading(false)
        })
    },
    [currentLogBuildNumber, currentLogRepository, connectToEventStream, t]
  )

  // 防止重复连接的标记
  const connectionKeyRef = React.useRef<string>("")

  // 当打开日志窗口时建立连接
  React.useEffect(() => {
    // 生成连接的唯一 key，只有当真正需要改变时才重建连接
    const connectionKey = `${currentLogRepository}-${currentLogBuildNumber}-${currentLogStage}-${currentLogStep}`

    if (!logOpen || !logRealtime || !currentLogBuildNumber || !currentLogRepository) {
      // 关闭连接
      if (abortControllerRef.current) {
        if (typeof abortControllerRef.current.close === 'function') {
          abortControllerRef.current.close()
        }
        abortControllerRef.current = null
      }
      connectionKeyRef.current = ""
      return
    }

    // 如果连接 key 没有变化，不重新建立连接
    if (connectionKeyRef.current === connectionKey && abortControllerRef.current) {
      return
    }

    // 关闭旧连接
    if (abortControllerRef.current) {
      if (typeof abortControllerRef.current.close === 'function') {
        abortControllerRef.current.close()
      }
      abortControllerRef.current = null
    }

    // 记录新的 key
    connectionKeyRef.current = connectionKey

    // 建立连接
    connectToEventStream(currentLogRepository, currentLogBuildNumber, currentLogStage, currentLogStep)

    // 同时仍然定时获取阶段信息
    const timer = window.setInterval(async () => {
      const hasOpenMenu = document.querySelector('[data-state="open"]') !== null
      if (hasOpenMenu) return

      try {
        await fetchDroneBuildInfo(currentLogRepository, currentLogBuildNumber)
          .then((stages) => {
            if (stages.length > 0) {
              setCurrentLogStages(stages)
            }
          })
          .catch(() => {})
      } catch {
      }
    }, 2000)

    return () => {
      window.clearInterval(timer)
      if (abortControllerRef.current) {
        if (typeof abortControllerRef.current.close === 'function') {
          abortControllerRef.current.close()
        }
        abortControllerRef.current = null
      }
      connectionKeyRef.current = ""
    }
  }, [logOpen, logRealtime, currentLogBuildNumber, currentLogRepository, currentLogStage, currentLogStep, connectToEventStream])

  const columns = React.useMemo(
    () =>
      createColumns<PipelineRunRow>({
        columns: [
          {
            key: "name",
            label: t("table.columns.name"),
            enableHiding: false,
            cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
          },
          { key: "phase", label: t("table.columns.status"), render: "status" },
          { key: "buildNumber", label: t("pipelineRuns.columns.buildNumber") },
          { key: "branch", label: t("pipelineRuns.columns.branch") },
          { key: "triggerTime", label: t("pipelineRuns.columns.triggerTime") },
        ],
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("pipelineRuns.viewYaml")}
              </>
            ),
            onSelect: (row) => {
              const name = row.name.trim()
              if (!name || name === "-") return

              setYamlOpen(true)
              setYamlLoading(true)
              setYamlError(null)
              setYamlContent("")
              setYamlSubtitle(t("pipelineRuns.viewYamlSubtitle", { name }))

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
                  const errMsg = e instanceof Error ? e.message : "loadYamlFailed"
                  setYamlError(errMsg)
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
                {t("pipelineRuns.logs")}
              </>
            ),
            onSelect: handleViewLogs,
            disabled: (row) => row.phase === "pending" || row.phase === "-" || !row.buildNumber || row.buildNumber === "-",
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("common.delete")}
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
    [handleViewLogs, t]
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
          setError(e instanceof Error ? e.message : t("pipelineRuns.deleteFailed"))
        })
        .finally(() => {
          setDeleting(false)
        })
    },
    [deleting, loadRows, t]
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
        setError(e instanceof Error ? e.message : t("pipelineRuns.deleteFailed"))
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, loadRows, pendingDeleteRow, t])

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  if (error && !loading) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("common.loadFailed")}</AlertTitle>
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
        title={t("pipelineRuns.viewYaml")}
        subtitle={yamlSubtitle}
        value={yamlLoading ? t("pipelineRuns.loading") : yamlContent}
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
              setRunError(t("pipelineRuns.repoRequired"))
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
                <DialogTitle>{t("pipelineRuns.runDialogTitle")}</DialogTitle>
                <DialogDescription>{t("pipelineRuns.runDialogDesc")}</DialogDescription>
              </DialogHeader>
              <div className="me-20 flex h-full items-center">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                    <span className="text-sm font-medium">{t("pipelineRuns.editYaml")}</span>
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
                      aria-label={t("pipelineRuns.editYaml")}
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                    <span className="text-sm font-medium">{t("pipelineRuns.editDroneYml")}</span>
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
                      aria-label={t("pipelineRuns.editDroneYml")}
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
                    title: t("common.basicInfo"),
                    status: runStep === "basic" ? t("common.current") : t("common.configured"),
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
                    title: t("common.advancedSettings"),
                    status: runStep === "advanced" ? t("common.current") : t("common.configured"),
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
                    <h3 className="text-[15px] font-semibold">{t("pipelineRuns.runParams")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("pipelineRuns.runParamsDesc")}</p>
                  </div>
                  <FieldGroup className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="pipeline-run-repository">{t("pipelineRuns.codeRepository")}</FieldLabel>
                        <Input
                          id="pipeline-run-repository"
                          value={runRepository}
                          placeholder={runRepositoryLoading ? t("pipelineRuns.reading") : "owner/repo"}
                          autoComplete="off"
                          disabled
                          readOnly
                        />
                        <FieldDescription>{t("pipelineRuns.droneRepoDesc")}</FieldDescription>
                      </Field>
                      <Field data-invalid={Boolean(runBranchError)}>
                        <FieldLabel htmlFor="pipeline-run-branch">{t("pipelineRuns.branch")}</FieldLabel>
                        <Input
                          id="pipeline-run-branch"
                          value={runBranch}
                          onChange={(event) => {
                            setRunBranch(event.target.value)
                            if (runBranchError) setRunBranchError(null)
                          }}
                          placeholder={t("pipelineRuns.branchRequired")}
                          autoComplete="off"
                          aria-invalid={Boolean(runBranchError)}
                          disabled={running || runRepositoryLoading}
                        />
                        {runBranchError ? (
                          <FieldError>{runBranchError}</FieldError>
                        ) : (
                          <FieldDescription>{t("pipelineRuns.gitBranchDesc")}</FieldDescription>
                        )}
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="pipeline-run-description">{t("pipelineRuns.description")}</FieldLabel>
                      <Textarea
                        id="pipeline-run-description"
                        value={runDescription}
                        onChange={(event) => setRunDescription(event.target.value)}
                        placeholder={t("pipelineRuns.descriptionPlaceholder")}
                        className="min-h-28"
                        maxLength={256}
                        disabled={running || runRepositoryLoading}
                      />
                      <FieldDescription>{t("pipelineRuns.descriptionDesc")}</FieldDescription>
                    </Field>
                  </FieldGroup>
                  {runError ? <FieldError className="mt-3">{runError}</FieldError> : null}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-300/80 bg-muted/10">
                    <p className="text-sm text-muted-foreground">{t("pipelineRuns.advancedSettingsComingSoon")}</p>
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
                          loading={<div className="p-3 text-xs text-slate-300">{t("keyValueDialog.editorLoading")}</div>}
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
                          loading={<div className="p-3 text-xs text-slate-300">{t("keyValueDialog.editorLoading")}</div>}
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
                    {t("common.cancel")}
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
                        setRunYamlError(e instanceof Error ? e.message : t("pipelineRuns.yamlParseFailed"))
                      }
                    }}
                    disabled={running || runRepositoryLoading}
                  >
                    {t("common.confirmSave")}
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
                    {t("common.confirmSave")}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void handleRun()} disabled={running || runRepositoryLoading}>
                    {runRepositoryLoading ? t("pipelineRuns.reading") : running ? t("pipelineRuns.triggering") : t("pipelineRuns.runNow")}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        title={t("pipelineRuns.deleteTitle")}
        description={pendingDeleteRow ? t("pipelineRuns.deleteDesc", { name: pendingDeleteRow.name }) : ""}
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
              placeholder={t("pipelineRuns.searchPlaceholder")}
              className="h-9 w-40"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setRunDialogOpen(true)} disabled={running}>
              <IconPlayerPlay className="size-4" />
              {t("pipelineRuns.runNow")}
            </Button>
          </div>
        }
      />
    </div>
  )
}
