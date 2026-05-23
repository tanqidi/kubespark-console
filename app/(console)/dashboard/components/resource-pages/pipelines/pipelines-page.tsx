"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconEye, IconPencil, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  ResourceMetadataEditor,
  hasUserProvidedMetadata,
  metadataEntriesToRecord,
  metadataRecordToEntries,
  type MetadataEntry,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
import {
  ResourceKeyValueEditor,
  hasUserProvidedKeyValues,
} from "@/app/(console)/dashboard/components/resource-pages/resource-key-value-editor"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  createDroneSecret,
  createPipeline,
  deleteDroneSecret,
  deletePipeline,
  fetchDroneRepoOptions,
  fetchDroneSecretKeyOptions,
  fetchPipelineDetail,
  fetchPipelineRows,
  fetchPipelineYaml,
  syncDroneRepos,
  updateDroneSecret,
  updatePipeline,
  type PipelineRow,
} from "@/app/lib/kubespark/pipelines"
import { fetchPipelineProjectDetail } from "@/app/lib/kubespark/pipeline-projects"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
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
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"
import { useTranslations } from "@/app/lib/i18n"

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

type PipelineDialogStep = "basic" | "advanced"
type PipelineYamlFormSnapshot = {
  pipelineName: string
  codeRepository: string
  pipelineDescription: string
  workspaceName: string
  labelEntries: MetadataEntry[]
  annotationEntries: MetadataEntry[]
}
type PipelinesPageClientProps = {
  pipelineProjectName?: string
  detailBasePath?: string
}

type PipelineDialogMode = "create" | "edit"

const PIPELINE_NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"
const CODE_REPOSITORY_ANNOTATION_KEY = "tanqidi.com/code-repository"
const DRONE_YAML_ANNOTATION_KEY = "tanqidi.com/drone-yaml"

function validatePipelineName(name: string): string | null {
  if (!name) return "请输入流水线名称"
  if (name.length > 63) return PIPELINE_NAME_RULE_MESSAGE
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) return PIPELINE_NAME_RULE_MESSAGE
  return null
}

function buildPipelineYamlText(params: {
  name: string
  description: string
  codeRepository: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  workspaceName?: string
  pipelineProjectName?: string
}): string {
  const labels = metadataEntriesToRecord(params.labels)
  const annotations = metadataEntriesToRecord(params.annotations)
  if (params.description.trim()) annotations.description = params.description.trim()
  else delete annotations.description
  if (params.codeRepository.trim()) {
    annotations[CODE_REPOSITORY_ANNOTATION_KEY] = params.codeRepository.trim()
  } else {
    delete annotations[CODE_REPOSITORY_ANNOTATION_KEY]
  }

  return stringify(
    {
      apiVersion: "tanqidi.com/v1alpha1",
      kind: "Pipeline",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
      spec: {
        ...(params.workspaceName?.trim()
          ? {
              workspaceRef: {
                name: params.workspaceName.trim(),
              },
            }
          : {}),
        ...(params.pipelineProjectName?.trim()
          ? {
              pipelineProjectRef: {
                name: params.pipelineProjectName.trim(),
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

function parsePipelineYamlText(yamlText: string): {
  name: string
  description: string
  codeRepository: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  workspaceName: string
  pipelineProjectName: string
} {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error("请输入 YAML 内容")

  const parsed = parse(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error("YAML 内容格式无效")

  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "Pipeline") throw new Error("YAML 资源类型必须是 Pipeline")

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
  const labels =
    typeof metadata.labels === "object" &&
    metadata.labels !== null &&
    !Array.isArray(metadata.labels)
      ? (metadata.labels as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}
  const workspaceRef =
    typeof spec.workspaceRef === "object" && spec.workspaceRef !== null && !Array.isArray(spec.workspaceRef)
      ? (spec.workspaceRef as Record<string, unknown>)
      : {}
  const pipelineProjectRef =
    typeof spec.pipelineProjectRef === "object" &&
    spec.pipelineProjectRef !== null &&
    !Array.isArray(spec.pipelineProjectRef)
      ? (spec.pipelineProjectRef as Record<string, unknown>)
      : {}
  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
    codeRepository:
      typeof annotations[CODE_REPOSITORY_ANNOTATION_KEY] === "string"
        ? (annotations[CODE_REPOSITORY_ANNOTATION_KEY] as string)
        : "",
    labels: metadataRecordToEntries(
      Object.fromEntries(
        Object.entries(labels).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    ),
    annotations: metadataRecordToEntries(
      Object.fromEntries(
        Object.entries(annotations).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    ),
    workspaceName:
      typeof workspaceRef.name === "string" ? workspaceRef.name : "",
    pipelineProjectName:
      typeof pipelineProjectRef.name === "string" ? pipelineProjectRef.name : "",
  }
}

function resolveCreatePipelineErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()

  if (text.includes("already exists")) return "流水线名称已存在，请更换后重试"
  if (text.includes("状态码 409") || text.includes("status 409")) return "流水线名称已存在，请更换后重试"

  return raw || "创建流水线失败，请稍后重试"
}

function isNameRelatedCreateError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()
  return (
    text.includes("already exists") ||
    text.includes("状态码 409") ||
    text.includes("status 409") ||
    text.includes("metadata.name") ||
    text.includes("名称")
  )
}

export function PipelinesPageClient({
  pipelineProjectName,
  detailBasePath = "/dashboard/pipelines",
}: PipelinesPageClientProps = {}) {
  const t = useTranslations()
  const normalizedPipelineProjectName = pipelineProjectName?.trim() ?? ""

  const [rows, setRows] = React.useState<PipelineRow[]>([])
  const [nameQuery, setNameQuery] = React.useState("")
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")

  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<PipelineRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [pendingDeleteSecretKey, setPendingDeleteSecretKey] = React.useState<string | null>(null)
  const [deletingSecret, setDeletingSecret] = React.useState(false)

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createStep, setCreateStep] = React.useState<PipelineDialogStep>("basic")
  const [createMode, setCreateMode] = React.useState<PipelineDialogMode>("create")
  const [editingName, setEditingName] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  const [pipelineName, setPipelineName] = React.useState("")
  const [codeRepository, setCodeRepository] = React.useState("")
  const [pipelineDescription, setPipelineDescription] = React.useState("")
  const [workspaceName, setWorkspaceName] = React.useState("")
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [keyValueEnabled, setKeyValueEnabled] = React.useState(false)
  const [keyValueEntries, setKeyValueEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [droneRepoOptions, setDroneRepoOptions] = React.useState<string[]>([])
  const [droneSecretLoading, setDroneSecretLoading] = React.useState(false)
  const [droneSecretIdByKey, setDroneSecretIdByKey] = React.useState<Record<string, number>>({})

  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [codeRepositoryError, setCodeRepositoryError] = React.useState<string | null>(null)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)
  const [createDroneYamlMode, setCreateDroneYamlMode] = React.useState(false)
  const [createDroneYamlText, setCreateDroneYamlText] = React.useState("")
  const [createDroneYamlError, setCreateDroneYamlError] = React.useState<string | null>(null)
  const createYamlSnapshotRef = React.useRef<PipelineYamlFormSnapshot | null>(null)
  const createDroneYamlSnapshotRef = React.useRef<string>("")
  const createDialogPopupLayerRef = React.useRef<HTMLDivElement | null>(null)

  const codeRepositoryOptions = React.useMemo<string[]>(() => {
    const names = new Set<string>()
    for (const option of droneRepoOptions) {
      const value = option.trim()
      if (value) names.add(value)
    }
    return Array.from(names)
  }, [droneRepoOptions])

  const matchedCodeRepositoryOptions = React.useMemo(() => {
    const query = codeRepository.trim().toLowerCase()
    if (!query) return codeRepositoryOptions
    return codeRepositoryOptions.filter((item) => item.toLowerCase().includes(query))
  }, [codeRepository, codeRepositoryOptions])

  const normalizeRepositoryValue = React.useCallback((value: string) => value.trim().toLowerCase(), [])

  const clearRepositoryIfNotMatched = React.useCallback(() => {
    const current = codeRepository.trim()
    if (!current) {
      setCodeRepositoryError("请选择代码仓库")
      return
    }
    const normalizedCurrent = normalizeRepositoryValue(current)
    const matched = codeRepositoryOptions.some(
      (item) => normalizeRepositoryValue(item) === normalizedCurrent
    )
    if (!matched) {
      setCodeRepository("")
      setCodeRepositoryError("请选择代码仓库")
      return
    }
    setCodeRepositoryError(null)
  }, [codeRepository, codeRepositoryOptions, normalizeRepositoryValue])

  const handleNextStep = React.useCallback(() => {
    if (creating) return

    const nameError = validatePipelineName(pipelineName.trim())
    if (nameError) {
      setCreateNameInvalid(true)
      setCreateNameError(nameError)
    } else {
      setCreateNameInvalid(false)
      setCreateNameError(null)
    }

    if (!codeRepository.trim()) {
      setCodeRepositoryError("请选择代码仓库")
      return
    }
    setCodeRepositoryError(null)

    if (nameError) return
    setCreateStep("advanced")
  }, [codeRepository, creating, pipelineName])

  const enterCreateYamlMode = React.useCallback(() => {
    createYamlSnapshotRef.current = {
      pipelineName,
      codeRepository,
      pipelineDescription,
      workspaceName,
      labelEntries: labelEntries.map((item) => ({ ...item })),
      annotationEntries: annotationEntries.map((item) => ({ ...item })),
    }
    setCreateDroneYamlMode(false)
    setCreateDroneYamlError(null)
    setCreateYamlText(
      buildPipelineYamlText({
        name: pipelineName,
        description: pipelineDescription,
        codeRepository,
        labels: labelEntries,
        annotations: annotationEntries,
        workspaceName,
        pipelineProjectName: normalizedPipelineProjectName,
      })
    )
    setCreateYamlError(null)
    setCreateYamlMode(true)
  }, [
    annotationEntries,
    codeRepository,
    labelEntries,
    normalizedPipelineProjectName,
    pipelineDescription,
    pipelineName,
    workspaceName,
  ])

  const cancelCreateYamlMode = React.useCallback(() => {
    const snapshot = createYamlSnapshotRef.current
    if (snapshot) {
      setPipelineName(snapshot.pipelineName)
      setCodeRepository(snapshot.codeRepository)
      setPipelineDescription(snapshot.pipelineDescription)
      setWorkspaceName(snapshot.workspaceName)
      setLabelEntries(snapshot.labelEntries.map((item) => ({ ...item })))
      setAnnotationEntries(snapshot.annotationEntries.map((item) => ({ ...item })))
    }
    setCreateYamlError(null)
    setCreateYamlMode(false)
  }, [])

  const confirmCreateYamlMode = React.useCallback(() => {
    try {
      const parsed = parsePipelineYamlText(createYamlText)
      setPipelineName(parsed.name)
      setPipelineDescription(parsed.description)
      setCodeRepository(parsed.codeRepository.trim())
      setLabelEntries(parsed.labels)
      setAnnotationEntries(parsed.annotations)
      if (parsed.workspaceName.trim()) setWorkspaceName(parsed.workspaceName.trim())
      setCreateYamlError(null)
      setCreateYamlMode(false)
    } catch (error) {
      setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
    }
  }, [createYamlText])

  const enterCreateDroneYamlMode = React.useCallback(() => {
    createDroneYamlSnapshotRef.current = createDroneYamlText
    setCreateYamlMode(false)
    setCreateYamlError(null)
    setCreateDroneYamlError(null)
    setCreateDroneYamlMode(true)
  }, [createDroneYamlText])

  const cancelCreateDroneYamlMode = React.useCallback(() => {
    setCreateDroneYamlText(createDroneYamlSnapshotRef.current)
    setCreateDroneYamlError(null)
    setCreateDroneYamlMode(false)
  }, [])

  const confirmCreateDroneYamlMode = React.useCallback(() => {
    setCreateDroneYamlError(null)
    setCreateDroneYamlMode(false)
  }, [])

  const loadRows = React.useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const items = await fetchPipelineRows(normalizedPipelineProjectName || undefined)
        setRows(items)
        setError(null)
      } catch (e: unknown) {
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[Pipelines] polling refresh failed", e)
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [normalizedPipelineProjectName]
  )

  React.useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!normalizedPipelineProjectName) return
      try {
        const detail = await fetchPipelineProjectDetail(normalizedPipelineProjectName)
        if (cancelled) return
        setWorkspaceName(detail.workspace || "")
      } catch {
        if (cancelled) return
        setWorkspaceName("")
      }
    })()

    void loadRows(false)

    return () => {
      cancelled = true
    }
  }, [loadRows, normalizedPipelineProjectName])

  useIntervalRefresh(() => loadRows(true), 3000)

  React.useEffect(() => {
    let cancelled = false

    void fetchDroneRepoOptions()
      .then((items) => {
        if (cancelled) return
        setDroneRepoOptions(items)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error("[Pipelines] load drone repos failed", e)
        setDroneRepoOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!createDialogOpen || createStep !== "advanced" || createYamlMode || createDroneYamlMode) return
    const repository = codeRepository.trim()
    if (!repository) {
      setDroneSecretLoading(false)
      setKeyValueEntries([{ key: "", value: "" }])
      setKeyValueEnabled(false)
      setDroneSecretIdByKey({})
      return
    }

    let cancelled = false
    setDroneSecretLoading(true)
    void fetchDroneSecretKeyOptions(repository)
      .then((items) => {
        if (cancelled) return
        if (items.length === 0) {
          setKeyValueEntries([{ key: "", value: "" }])
          setKeyValueEnabled(false)
          setDroneSecretIdByKey({})
          return
        }
        setKeyValueEntries(items.map((item) => ({ key: item.name, value: "" })))
        setDroneSecretIdByKey(
          Object.fromEntries(items.map((item) => [item.name, item.id]))
        )
        setKeyValueEnabled(true)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error("[Pipelines] load drone secrets failed", e)
        setKeyValueEntries([{ key: "", value: "" }])
        setKeyValueEnabled(false)
        setDroneSecretIdByKey({})
      })
      .finally(() => {
        if (cancelled) return
        setDroneSecretLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [codeRepository, createDialogOpen, createDroneYamlMode, createStep, createYamlMode])

  const resetCreateState = React.useCallback(() => {
    setCreateMode("create")
    setEditingName(null)
    setPipelineName("")
    setCodeRepository("")
    setPipelineDescription("")
    setMetadataEnabled(false)
    setLabelEntries([{ key: "", value: "" }])
    setAnnotationEntries([{ key: "", value: "" }])
    setKeyValueEnabled(false)
    setKeyValueEntries([{ key: "", value: "" }])
    setDroneSecretIdByKey({})
    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCodeRepositoryError(null)
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateDroneYamlMode(false)
    setCreateDroneYamlText("")
    setCreateDroneYamlError(null)
    setCreateStep("basic")
  }, [])

  const openCreateDialog = React.useCallback(() => {
    resetCreateState()
    setCreateMode("create")
    setCreateDialogOpen(true)
    void syncDroneRepos()
      .then(() => fetchDroneRepoOptions())
      .then((items) => {
        setDroneRepoOptions(items)
      })
      .catch((e: unknown) => {
        console.error("[Pipelines] sync drone repos failed", e)
      })
  }, [resetCreateState])

  const openEditDialog = React.useCallback(
    (row: PipelineRow) => {
      const targetName = row.name.trim()
      if (!targetName || targetName === "-") return

      void fetchPipelineDetail(targetName)
        .then((detail) => {
          resetCreateState()
          setCreateMode("edit")
          setEditingName(detail.name)
          setPipelineName(detail.name)
          setCodeRepository(detail.annotations[CODE_REPOSITORY_ANNOTATION_KEY] || detail.name)
          setPipelineDescription(detail.description)
          setWorkspaceName(detail.workspace || workspaceName)
          const nextLabels = metadataRecordToEntries(detail.labels)
          const nextAnnotations = metadataRecordToEntries(detail.annotations)
          setLabelEntries(nextLabels)
          setAnnotationEntries(nextAnnotations)
          setMetadataEnabled(false)
          setKeyValueEnabled(false)
          setKeyValueEntries([{ key: "", value: "" }])
          setCreateDroneYamlText(detail.annotations[DRONE_YAML_ANNOTATION_KEY] || "")
          setCreateDialogOpen(true)
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "加载流水线详情失败")
        })
    },
    [resetCreateState, workspaceName]
  )

  const handleCreateSubmit = React.useCallback(() => {
    if (creating) return

    const isEditMode = createMode === "edit"
    const allPipelineNames = rows.map((row) => row.name.trim())
    let nextName = pipelineName.trim()
    let nextDescription = pipelineDescription.trim()
    let nextCodeRepository = codeRepository.trim()
    let nextLabels = labelEntries
    let nextAnnotations = annotationEntries
    let nextWorkspaceName = workspaceName.trim()
    let nextPipelineProjectName = normalizedPipelineProjectName

    if (createYamlMode) {
      try {
        const parsed = parsePipelineYamlText(createYamlText)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextCodeRepository = parsed.codeRepository.trim()
        nextLabels = parsed.labels
        nextAnnotations = parsed.annotations
        nextWorkspaceName = parsed.workspaceName.trim() || nextWorkspaceName
        nextPipelineProjectName = parsed.pipelineProjectName.trim() || nextPipelineProjectName

        setPipelineName(nextName)
        setPipelineDescription(nextDescription)
        setCodeRepository(nextCodeRepository)
        setLabelEntries(nextLabels)
        setAnnotationEntries(nextAnnotations)
        setCreateYamlError(null)
      } catch (error) {
        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
        return
      }
    }

    if (!nextCodeRepository) {
      const message = "请选择代码仓库"
      setCodeRepositoryError(message)
      setCreateStep("basic")
      if (createYamlMode) setCreateYamlError(message)
      return
    }

    const nameError = validatePipelineName(nextName)
    if (nameError) {
      setCreateNameInvalid(true)
      setCreateNameError(nameError)
      setCreateStep("basic")
      if (createYamlMode) setCreateYamlError(nameError)
      return
    }

    if (!isEditMode && allPipelineNames.includes(nextName)) {
      const duplicatedNameMessage = "流水线名称已存在，请更换后重试"
      setCreateNameInvalid(true)
      setCreateNameError(duplicatedNameMessage)
      if (createYamlMode) setCreateYamlError(duplicatedNameMessage)
      return
    }

    if (isEditMode && editingName && nextName !== editingName) {
      const lockedNameError = t("pipelines.editNameLocked")
      setCreateNameInvalid(true)
      setCreateNameError(lockedNameError)
      if (createYamlMode) setCreateYamlError(lockedNameError)
      return
    }

    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCodeRepositoryError(null)
    setCreateYamlError(null)
    setCreating(true)

    const targetName = isEditMode && editingName ? editingName : nextName
    const nextAnnotationRecord = metadataEntriesToRecord(nextAnnotations)
    if (nextCodeRepository) {
      nextAnnotationRecord[CODE_REPOSITORY_ANNOTATION_KEY] = nextCodeRepository
    } else {
      delete nextAnnotationRecord[CODE_REPOSITORY_ANNOTATION_KEY]
    }
    if (createDroneYamlText.trim()) {
      nextAnnotationRecord[DRONE_YAML_ANNOTATION_KEY] = createDroneYamlText
    } else {
      delete nextAnnotationRecord[DRONE_YAML_ANNOTATION_KEY]
    }
    void (async () => {
      try {
        if (keyValueEnabled) {
          const normalized = new Map<string, string>()
          for (const entry of keyValueEntries) {
            const key = entry.key.trim()
            if (!key) continue
            if (normalized.has(key)) throw new Error(`变量键重复：${key}`)
            normalized.set(key, entry.value.trim())
          }

          const mutations: Array<Promise<void>> = []
          for (const [key, value] of normalized) {
            if (!value) continue
            if (droneSecretIdByKey[key]) {
              mutations.push(updateDroneSecret(nextCodeRepository, key, value))
            } else {
              mutations.push(createDroneSecret(nextCodeRepository, key, value))
            }
          }
          if (mutations.length > 0) {
            await Promise.all(mutations)
          }
        }

        if (isEditMode) {
          await updatePipeline({
            name: targetName,
            description: nextDescription,
            labels: metadataEntriesToRecord(nextLabels),
            annotations: nextAnnotationRecord,
            workspaceName: nextWorkspaceName || undefined,
            pipelineProjectName: nextPipelineProjectName || undefined,
          })
        } else {
          await createPipeline({
            name: targetName,
            description: nextDescription,
            labels: metadataEntriesToRecord(nextLabels),
            annotations: nextAnnotationRecord,
            workspaceName: nextWorkspaceName || undefined,
            pipelineProjectName: nextPipelineProjectName || undefined,
          })
        }

        setCreateDialogOpen(false)
        resetCreateState()
        await loadRows(false)
      } catch (e: unknown) {
        const message = resolveCreatePipelineErrorMessage(e)
        const isNameError = isNameRelatedCreateError(e)
        setCreateNameInvalid(isNameError)
        setCreateNameError(isNameError ? message : null)
        if (createYamlMode) setCreateYamlError(message)
        if (!isNameError) setError(message)
      } finally {
        setCreating(false)
      }
    })()
  }, [
    annotationEntries,
    createMode,
    createYamlMode,
    createYamlText,
    createDroneYamlText,
    codeRepository,
    creating,
    droneSecretIdByKey,
    editingName,
    keyValueEnabled,
    keyValueEntries,
    labelEntries,
    loadRows,
    normalizedPipelineProjectName,
    pipelineDescription,
    pipelineName,
    resetCreateState,
    rows,
    workspaceName,
  ])

  const handleViewYaml = React.useCallback((row: PipelineRow) => {
    const pipelineName = row.name.trim()
    if (!pipelineName || pipelineName === "-") return

    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`${t("pipelines.viewYaml")} (${pipelineName})`)

    void fetchPipelineYaml(pipelineName)
      .then((text) => {
        setYamlContent(text)
      })
      .catch((e: unknown) => {
        setYamlError(e instanceof Error ? e.message : t("common.loadYamlFailed"))
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const handleDeleteSelectedRows = React.useCallback(
    (selectedRows: PipelineRow[]) => {
      if (selectedRows.length === 0) return
      setDeleting(true)

      const names = selectedRows
        .map((row) => row.name.trim())
        .filter((name) => name.length > 0 && name !== "-")

      void Promise.all(names.map((name) => deletePipeline(name)))
        .then(async () => {
          await loadRows(false)
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : t("pipelines.deleteFailed"))
        })
        .finally(() => {
          setDeleting(false)
        })
    },
    [loadRows, t]
  )

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    const targetName = pendingDeleteRow.name.trim()
    if (!targetName || targetName === "-") return

    setDeleting(true)
    void deletePipeline(targetName)
      .then(async () => {
        setPendingDeleteRow(null)
        await loadRows(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("pipelines.deleteFailed"))
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, loadRows, pendingDeleteRow, t])

  const handleConfirmDeleteSecret = React.useCallback(() => {
    if (deletingSecret) return
    const key = pendingDeleteSecretKey?.trim() ?? ""
    const repository = codeRepository.trim()
    if (!key || !repository) return

    setDeletingSecret(true)
    void deleteDroneSecret(repository, key)
      .then(async () => {
        setPendingDeleteSecretKey(null)
        const items = await fetchDroneSecretKeyOptions(repository)
        setKeyValueEntries(
          items.length > 0 ? items.map((item) => ({ key: item.name, value: "" })) : [{ key: "", value: "" }]
        )
        setDroneSecretIdByKey(
          items.length > 0 ? Object.fromEntries(items.map((item) => [item.name, item.id])) : {}
        )
        setKeyValueEnabled(items.length > 0)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : t("pipelines.deleteSecretFailed"))
      })
      .finally(() => {
        setDeletingSecret(false)
      })
  }, [codeRepository, deletingSecret, pendingDeleteSecretKey, t])

  const columns = React.useMemo(() => {
    const pipelineColumns: ColumnConfig<PipelineRow>[] = [
      {
        key: "name",
        label: t("pipelines.columns.name"),
        enableHiding: false,
        cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
      },
      { key: "workspace", label: t("pipelines.columns.workspace") },
      { key: "age", label: t("pipelines.columns.age") },
      { key: "updatedAt", label: t("pipelines.columns.updatedAt") },
    ]
    return createColumns<PipelineRow>({
      columns: pipelineColumns,
      actionItems: [
        {
          label: (
            <>
              <IconEye className="size-4" />
              {t("pipelines.viewYaml")}
            </>
          ),
          onSelect: (row) => {
            handleViewYaml(row)
          },
        },
        {
          label: (
            <>
              <IconPencil className="size-4" />
              {t("pipelines.edit")}
            </>
          ),
          onSelect: (row) => {
            openEditDialog(row)
          },
        },
        {
          label: (
            <>
              <IconTrash className="size-4" />
              {t("pipelines.delete")}
            </>
          ),
          variant: "destructive",
          withSeparator: true,
          onSelect: (row) => {
            setPendingDeleteRow(row)
          },
        },
      ],
    })
  }, [t, handleViewYaml, openEditDialog])

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("common.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const isEditMode = createMode === "edit"
  const dialogTitle = isEditMode ? t("pipelines.editTitle") : t("pipelines.createTitle")
  const dialogDescription = isEditMode ? t("pipelines.editDesc") : t("pipelines.createDesc")

  return (
    <>
      <MonacoViewerDialog
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        title={t("pipelines.viewYaml")}
        subtitle={yamlSubtitle}
        value={yamlLoading ? t("workloadPickerDialog.loading") : yamlContent}
        language="yaml"
        error={yamlError}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        title={t("pipelines.deleteTitle")}
        description={pendingDeleteRow ? t("pipelines.deleteDesc").replace("{name}", pendingDeleteRow.name) : ""}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRow(null)
        }}
        onConfirm={handleConfirmDelete}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteSecretKey)}
        title={t("pipelines.deleteSecretTitle")}
        description={pendingDeleteSecretKey ? t("pipelines.deleteSecretDesc").replace("{name}", pendingDeleteSecretKey) : ""}
        deleting={deletingSecret}
        onOpenChange={(open) => {
          if (!open && !deletingSecret) setPendingDeleteSecretKey(null)
        }}
        onConfirm={handleConfirmDeleteSecret}
      />

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateDialogOpen(open)
          if (!open) resetCreateState()
        }}
      >
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div ref={createDialogPopupLayerRef} className="pointer-events-none absolute inset-0 z-50" />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="me-20 flex h-full items-center gap-3">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                    <span className="text-sm font-medium">{t("pipelines.editYaml")}</span>
                    <Switch
                        checked={createYamlMode}
                        onCheckedChange={(checked) => {
                          if (creating) return
                          if (checked) {
                            enterCreateYamlMode()
                          } else {
                            cancelCreateYamlMode()
                          }
                        }}
                        disabled={creating}
                        aria-label={t("pipelines.editYaml")}
                    />
                  </div>
                  <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                    <span className="text-sm font-medium">{t("pipelines.editDroneYaml")}</span>
                    <Switch
                        checked={createDroneYamlMode}
                        onCheckedChange={(checked) => {
                          if (creating) return
                          if (checked) {
                            enterCreateDroneYamlMode()
                          } else {
                            cancelCreateDroneYamlMode()
                          }
                        }}
                        disabled={creating}
                        aria-label={t("pipelines.editDroneYaml")}
                    />
                  </div>
              </div>
            </div>

            {!createYamlMode && !createDroneYamlMode ? (
            <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: t("common.basicInfo"),
                    status: createStep === "basic" ? t("common.current") : t("common.configured"),
                    active: createStep === "basic",
                    icon: <IconSettings2 className="size-4"/>,
                    disabled: creating,
                    onClick: () => {
                      if (creating) return
                      setCreateStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: t("common.advancedSettings"),
                    status:
                        createStep === "advanced"
                            ? t("common.current")
                            : hasUserProvidedMetadata(labelEntries, annotationEntries) ||
                                hasUserProvidedKeyValues(keyValueEntries)
                                ? t("common.configured")
                                : t("common.optional"),
                    active: createStep === "advanced",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => {
                      if (creating) return
                      setCreateStep("advanced")
                    },
                  },
                ]}
              />
          ) : null}

            <div className={createYamlMode || createDroneYamlMode ? "min-h-0 flex-1 p-6" : "min-h-0 flex-1 overflow-y-auto"}>
              {createYamlMode ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <MonacoEditor
                      language="yaml"
                      theme="vs-dark"
                      value={createYamlText}
                      onChange={(value) => {
                        setCreateYamlText(value ?? "")
                        if (createYamlError) setCreateYamlError(null)
                        if (createNameInvalid) setCreateNameInvalid(false)
                        if (createNameError) setCreateNameError(null)
                      }}
                      options={MONACO_OPTIONS}
                      height="100%"
                    />
                  </div>
                  {createYamlError ? <FieldError className="mt-3">{createYamlError}</FieldError> : null}
                </div>
              ) : createDroneYamlMode ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <MonacoEditor
                      language="yaml"
                      theme="vs-dark"
                      value={createDroneYamlText}
                      onChange={(value) => {
                        setCreateDroneYamlText(value ?? "")
                        if (createDroneYamlError) setCreateDroneYamlError(null)
                      }}
                      options={MONACO_OPTIONS}
                      height="100%"
                    />
                  </div>
                  {createDroneYamlError ? <FieldError className="mt-3">{createDroneYamlError}</FieldError> : null}
                </div>
              ) : createStep === "basic" ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">{t("common.basicInfo")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("pipelines.createDesc")}</p>
                  </div>
                  <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field data-invalid={createNameInvalid}>
                      <FieldLabel htmlFor="pipeline-create-name">{t("pipelines.columns.name")}</FieldLabel>
                      <Input
                        id="pipeline-create-name"
                        value={pipelineName}
                        onChange={(event) => {
                          setPipelineName(event.target.value)
                          if (createNameInvalid) setCreateNameInvalid(false)
                          if (createNameError) setCreateNameError(null)
                        }}
                        placeholder={t("pipelines.pipelineNameRequired")}
                        autoComplete="off"
                        aria-invalid={createNameInvalid}
                        disabled={creating || isEditMode}
                      />
                      {createNameError ? (
                        <FieldError>{createNameError}</FieldError>
                      ) : (
                        <FieldDescription>{t("pipelines.pipelineNameRule")}</FieldDescription>
                      )}
                    </Field>
                    <Field data-invalid={Boolean(codeRepositoryError)}>
                      <FieldLabel htmlFor="pipeline-create-repository">{t("pipelines.codeRepository")}</FieldLabel>
                      <Combobox
                        items={codeRepositoryOptions}
                        value={codeRepository.trim() ? codeRepository : null}
                        inputValue={codeRepository}
                        onInputValueChange={(value) => {
                          setCodeRepository(value ?? "")
                          if (codeRepositoryError) setCodeRepositoryError(null)
                        }}
                        onValueChange={(item) => {
                          if (typeof item === "string") {
                            setCodeRepository(item)
                            if (codeRepositoryError) setCodeRepositoryError(null)
                          }
                        }}
                        disabled={creating || isEditMode}
                      >
                        <ComboboxInput
                          placeholder={t("pipelines.codeRepositoryPlaceholder")}
                          className={cn(
                            "w-full",
                            codeRepositoryError
                              ? "border-destructive ring-[3px] ring-destructive/20 dark:ring-destructive/40"
                              : ""
                          )}
                          disabled={creating || isEditMode}
                          onBlur={clearRepositoryIfNotMatched}
                          aria-invalid={Boolean(codeRepositoryError)}
                        />
                        {matchedCodeRepositoryOptions.length > 0 ? (
                          <ComboboxContent
                            container={createDialogPopupLayerRef}
                            className="pointer-events-auto"
                          >
                            <ComboboxEmpty />
                            <ComboboxList>
                              {(item, index) => (
                                <ComboboxItem key={`${item}-${index}`} value={item}>
                                  {item}
                                </ComboboxItem>
                              )}
                            </ComboboxList>
                          </ComboboxContent>
                        ) : null}
                      </Combobox>
                      {codeRepositoryError ? (
                        <FieldError>{codeRepositoryError}</FieldError>
                      ) : (
                        <FieldDescription>
                          {t("pipelines.codeRepositoryPlaceholder")} (owner/repo)
                        </FieldDescription>
                      )}
                    </Field>

                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="pipeline-create-description">{t("pipelines.pipelineDescription")}</FieldLabel>
                      <Textarea
                        id="pipeline-create-description"
                        value={pipelineDescription}
                        onChange={(event) => setPipelineDescription(event.target.value)}
                        placeholder={t("pipelines.pipelineDescriptionPlaceholder")}
                        maxLength={256}
                        className="min-h-28"
                        disabled={creating}
                      />
                      <FieldDescription>{t("pipelines.pipelineDescription")} {t("common.descriptionMaxLength", { max: 256 })}</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">{t("common.advancedSettings")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("common.advancedSettingsDesc")}</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field>
                      <ResourceMetadataEditor
                        checked={metadataEnabled}
                        onCheckedChange={setMetadataEnabled}
                        labels={labelEntries}
                        setLabels={setLabelEntries}
                        annotations={annotationEntries}
                        setAnnotations={setAnnotationEntries}
                        description={pipelineDescription}
                        setDescription={setPipelineDescription}
                        disabled={creating}
                        titleText={t("common.metadataEditorTitle")}
                      />
                    </Field>
                    <Field>
                      <ResourceKeyValueEditor
                        checked={keyValueEnabled}
                        onCheckedChange={setKeyValueEnabled}
                        entries={keyValueEntries}
                        setEntries={setKeyValueEntries}
                        onRequestDeleteEntry={(entry, index) => {
                          const key = entry.key.trim()
                          if (!key) return
                          if (!droneSecretIdByKey[key]) {
                            setKeyValueEntries((current) =>
                              current.length <= 1
                                ? [{ key: "", value: "" }]
                                : current.filter((_, itemIndex) => itemIndex !== index)
                            )
                            return
                          }
                          setPendingDeleteSecretKey(key)
                        }}
                        disabled={!isEditMode || creating || droneSecretLoading}
                        title="变量配置"
                        description={
                          isEditMode
                            ? "维护流水线运行所需的键值变量或秘钥参数，值为空则跳过修改。"
                            : "该能力仅支持编辑流水线时使用，请从编辑状态进入后配置变量。"
                        }
                      />
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-background px-6 py-5">
              {createYamlMode || createDroneYamlMode ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={creating}
                    onClick={createYamlMode ? cancelCreateYamlMode : cancelCreateDroneYamlMode}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={creating}
                    onClick={createYamlMode ? confirmCreateYamlMode : confirmCreateDroneYamlMode}
                  >
                    确认保存
                  </Button>
                </div>
              ) : createStep === "basic" ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={creating} onClick={handleNextStep}>
                    下一步
                  </Button>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateStep("basic")}>
                    上一步
                  </Button>
                  <Button type="button" onClick={handleCreateSubmit} disabled={creating}>
                    {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <DataTable
        data={filteredRows}
        columns={columns}
        enableRowNavigation
        getRowHref={(row) => `${detailBasePath}/${encodeURIComponent(row.name)}`}
        onCreate={openCreateDialog}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        toolbarEnd={
          <Input
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder={t("pipelines.searchPlaceholder")}
            className="h-9 w-40"
          />
        }
      />
    </>
  )
}
