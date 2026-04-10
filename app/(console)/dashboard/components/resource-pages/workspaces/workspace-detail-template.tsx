"use client"

import * as React from "react"
import { IconEye, IconInfoCircle, IconPencil, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import type { EditorProps } from "@monaco-editor/react"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  ResourceMetadataEditor,
  hasUserProvidedMetadata,
  metadataEntriesToRecord,
  metadataRecordToEntries,
  type MetadataEntry,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { fetchResourceByName, fetchResourceDescribe } from "@/app/lib/kubespark/common"
import {
  createNamespace,
  deleteNamespace,
  fetchNamespaceYaml,
  fetchNamespaces,
  updateNamespace,
  type CreateNamespaceInput,
} from "@/app/lib/kubespark/projects"
import { fetchWorkspaceDetail, fetchWorkspaceRows, type WorkspaceDetail } from "@/app/lib/kubespark/workspaces"
import {
  createWorkspaceNamespaceBinding,
  fetchWorkspaceNamespaceBindings,
} from "@/app/lib/kubespark/workspace-namespace-bindings"
import {
  createPipelineProject,
  fetchPipelineProjectRows,
} from "@/app/lib/kubespark/pipeline-projects"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { FilterCombobox, type FilterComboboxOption } from "@/components/ui/filter-combobox"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

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

const PROJECT_NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字和连字符（-），必须以小写字母开头并以小写字母或数字结尾，最长 63 个字符。"
const PROJECT_WORKSPACE_ANNOTATION = "tanqidi.com/workspace"
const PROJECT_WORKSPACE_REQUIRED_MESSAGE = "请选择企业空间"

function resolveCreateProjectErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()

  if (text.includes("already exists")) {
    return "项目名称已存在，请更换后重试"
  }

  if (text.includes("状态码 409") || text.includes("status 409")) {
    return "项目名称已存在，请更换后重试"
  }

  if (raw) return raw
  return "创建项目失败，请稍后重试"
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

function validateProjectName(name: string): string | null {
  if (!name) return "请输入项目名称"
  if (name.length > 63) return PROJECT_NAME_RULE_MESSAGE
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) return PROJECT_NAME_RULE_MESSAGE
  return null
}

function ensureWorkspaceAnnotationEntries(entries: MetadataEntry[], workspace: string): MetadataEntry[] {
  const workspaceValue = workspace.trim()
  const withoutWorkspace = entries.filter((entry) => entry.key !== PROJECT_WORKSPACE_ANNOTATION)
  const nonEmptyEntries = withoutWorkspace.filter(
    (entry) => entry.key.trim().length > 0 || entry.value.trim().length > 0
  )

  if (!workspaceValue) {
    return nonEmptyEntries.length > 0 ? nonEmptyEntries : [{ key: "", value: "" }]
  }

  return [
    ...nonEmptyEntries,
    {
      key: PROJECT_WORKSPACE_ANNOTATION,
      value: workspaceValue,
    },
  ]
}

function areMetadataEntriesEqual(a: MetadataEntry[], b: MetadataEntry[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.key !== b[i]?.key || a[i]?.value !== b[i]?.value) return false
  }
  return true
}

type WorkspaceDetailTemplateProps = {
  name: string
}

type DetailTab = "projects" | "pipelineProjects" | "roles" | "members"

type WorkspaceDetailRow = {
  id: string
  name?: string
  description?: string
  status?: string
  workspace?: string
  labels?: string
  annotations?: string
  age?: string
  updatedAt?: string
  repository?: string
  branch?: string
  lastRun?: string
  role?: string
  scope?: string
  bindings?: string
  member?: string
}

const projectColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  {
    key: "name",
    label: "名称",
    cell: (_value, row) => renderNameDescriptionCell(row.name ?? "-", row.description),
    enableHiding: false,
  },
  { key: "status", label: "状态", render: "status" },
  { key: "workspace", label: "企业空间" },
  { key: "labels", label: "标签", align: "right" },
  { key: "annotations", label: "注解", align: "right" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

const pipelineProjectColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "name", label: "名称", enableHiding: false },
  { key: "repository", label: "Git 地址" },
  { key: "branch", label: "分支" },
  { key: "lastRun", label: "最近构建" },
]

const roleColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "role", label: "角色", enableHiding: false },
  { key: "scope", label: "作用域" },
  { key: "bindings", label: "绑定数", align: "right" },
]

const memberColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "member", label: "成员", enableHiding: false },
  { key: "role", label: "角色" },
  { key: "status", label: "状态", render: "status" },
]

function buildProjectYamlText(params: {
  name: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
}): string {
  const labels = metadataEntriesToRecord(params.labels)
  const annotations = metadataEntriesToRecord(params.annotations)
  if (params.description.trim()) annotations.description = params.description.trim()
  else delete annotations.description
  return stringify(
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
    },
    { indent: 2, lineWidth: 0, sortMapEntries: false }
  )
}

function parseProjectYamlText(yamlText: string): {
  name: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
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
  if (kind && kind !== "Namespace") throw new Error("YAML 资源类型必须是 Namespace")

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

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
    labels: metadataRecordToEntries(
      Object.fromEntries(Object.entries(labels).filter(([, value]) => typeof value === "string")) as Record<
        string,
        string
      >
    ),
    annotations: metadataRecordToEntries(
      Object.fromEntries(
        Object.entries(annotations).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    ),
  }
}

function buildPipelineProjectYamlText(params: {
  name: string
  description: string
  workspaceName: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
}): string {
  const labels = metadataEntriesToRecord(params.labels)
  const annotations = metadataEntriesToRecord(params.annotations)
  if (params.description.trim()) annotations.description = params.description.trim()
  else delete annotations.description

  return stringify(
    {
      apiVersion: "tanqidi.com/v1alpha1",
      kind: "PipelineProject",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
      spec: {
        workspaceRef: {
          name: params.workspaceName.trim(),
        },
        ...(params.description.trim() ? { description: params.description.trim() } : {}),
      },
    },
    { indent: 2, lineWidth: 0, sortMapEntries: false }
  )
}

function parsePipelineProjectYamlText(yamlText: string): {
  name: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  workspaceName: string
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
  if (kind && kind !== "PipelineProject") throw new Error("YAML 资源类型必须是 PipelineProject")

  const metadata =
    typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}
  const workspaceRef =
    typeof spec.workspaceRef === "object" && spec.workspaceRef !== null && !Array.isArray(spec.workspaceRef)
      ? (spec.workspaceRef as Record<string, unknown>)
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

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    description:
      typeof spec.description === "string"
        ? spec.description
        : typeof annotations.description === "string"
          ? annotations.description
          : "",
    workspaceName: typeof workspaceRef.name === "string" ? workspaceRef.name : "",
    labels: metadataRecordToEntries(
      Object.fromEntries(Object.entries(labels).filter(([, value]) => typeof value === "string")) as Record<
        string,
        string
      >
    ),
    annotations: metadataRecordToEntries(
      Object.fromEntries(
        Object.entries(annotations).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    ),
  }
}

export function WorkspaceDetailTemplate({ name }: WorkspaceDetailTemplateProps) {
  const currentWorkspaceName = name.trim()
  const [activeTab, setActiveTab] = React.useState<DetailTab>("projects")
  const [error, setError] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<WorkspaceDetail | null>(null)
  const [projectRows, setProjectRows] = React.useState<WorkspaceDetailRow[]>([])
  const [allProjectNames, setAllProjectNames] = React.useState<string[]>([])
  const [pipelineProjectRows, setPipelineProjectRows] = React.useState<WorkspaceDetailRow[]>([])
  const [allPipelineProjectNames, setAllPipelineProjectNames] = React.useState<string[]>([])

  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("查看 Kubernetes Namespace 的 YAML 内容。")

  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("查看 Kubernetes Namespace 的详情内容。")

  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<WorkspaceDetailRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  type ProjectDialogStep = "basic" | "advanced"
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createWorkspace, setCreateWorkspace] = React.useState("")
  const [createWorkspaceInvalid, setCreateWorkspaceInvalid] = React.useState(false)
  const [createWorkspaceError, setCreateWorkspaceError] = React.useState<string | null>(null)
  const [createMetadataEnabled, setCreateMetadataEnabled] = React.useState(false)
  const [createLabelEntries, setCreateLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [createAnnotationEntries, setCreateAnnotationEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [createStep, setCreateStep] = React.useState<ProjectDialogStep>("basic")

  const [pipelineProjectCreateOpen, setPipelineProjectCreateOpen] = React.useState(false)
  const [pipelineProjectCreateName, setPipelineProjectCreateName] = React.useState("")
  const [pipelineProjectCreateDescription, setPipelineProjectCreateDescription] = React.useState("")
  const [pipelineProjectCreateWorkspace, setPipelineProjectCreateWorkspace] = React.useState("")
  const [pipelineProjectCreateWorkspaceInvalid, setPipelineProjectCreateWorkspaceInvalid] = React.useState(false)
  const [pipelineProjectCreateWorkspaceError, setPipelineProjectCreateWorkspaceError] = React.useState<string | null>(null)
  const [pipelineProjectCreateMetadataEnabled, setPipelineProjectCreateMetadataEnabled] = React.useState(false)
  const [pipelineProjectCreateLabelEntries, setPipelineProjectCreateLabelEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [pipelineProjectCreateAnnotationEntries, setPipelineProjectCreateAnnotationEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [pipelineProjectCreateNameInvalid, setPipelineProjectCreateNameInvalid] = React.useState(false)
  const [pipelineProjectCreateNameError, setPipelineProjectCreateNameError] = React.useState<string | null>(null)
  const [pipelineProjectCreateYamlMode, setPipelineProjectCreateYamlMode] = React.useState(false)
  const [pipelineProjectCreateYamlText, setPipelineProjectCreateYamlText] = React.useState("")
  const [pipelineProjectCreateYamlError, setPipelineProjectCreateYamlError] = React.useState<string | null>(null)
  const [pipelineProjectCreating, setPipelineProjectCreating] = React.useState(false)
  const [pipelineProjectCreateStep, setPipelineProjectCreateStep] = React.useState<ProjectDialogStep>("basic")

  const [editOpen, setEditOpen] = React.useState(false)
  const [editingRow, setEditingRow] = React.useState<WorkspaceDetailRow | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editWorkspace, setEditWorkspace] = React.useState("")
  const [workspaceOptions, setWorkspaceOptions] = React.useState<FilterComboboxOption[]>([])
  const [workspaceBindingExists, setWorkspaceBindingExists] = React.useState(false)
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [editYamlMode, setEditYamlMode] = React.useState(false)
  const [editYamlText, setEditYamlText] = React.useState("")
  const [editYamlError, setEditYamlError] = React.useState<string | null>(null)
  const [editStep, setEditStep] = React.useState<ProjectDialogStep>("basic")
  const [savingEdit, setSavingEdit] = React.useState(false)
  const resetCreateDialogState = React.useCallback(() => {
    setCreateName("")
    setCreateDescription("")
    setCreateWorkspace(currentWorkspaceName)
    setCreateWorkspaceInvalid(false)
    setCreateWorkspaceError(null)
    setCreateMetadataEnabled(false)
    setCreateLabelEntries([{ key: "", value: "" }])
    setCreateAnnotationEntries(
      ensureWorkspaceAnnotationEntries([{ key: "", value: "" }], currentWorkspaceName)
    )
    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateStep("basic")
  }, [currentWorkspaceName])

  const resetPipelineProjectCreateDialogState = React.useCallback(() => {
    setPipelineProjectCreateName("")
    setPipelineProjectCreateDescription("")
    setPipelineProjectCreateWorkspace(currentWorkspaceName)
    setPipelineProjectCreateWorkspaceInvalid(false)
    setPipelineProjectCreateWorkspaceError(null)
    setPipelineProjectCreateMetadataEnabled(false)
    setPipelineProjectCreateLabelEntries([{ key: "", value: "" }])
    setPipelineProjectCreateAnnotationEntries(
      ensureWorkspaceAnnotationEntries([{ key: "", value: "" }], currentWorkspaceName)
    )
    setPipelineProjectCreateNameInvalid(false)
    setPipelineProjectCreateNameError(null)
    setPipelineProjectCreateYamlMode(false)
    setPipelineProjectCreateYamlText("")
    setPipelineProjectCreateYamlError(null)
    setPipelineProjectCreateStep("basic")
  }, [currentWorkspaceName])
  const resetEditDialogState = React.useCallback(() => {
    setEditingRow(null)
    setEditName("")
    setEditDescription("")
    setEditWorkspace("")
    setWorkspaceBindingExists(false)
    setMetadataEnabled(false)
    setLabelEntries([{ key: "", value: "" }])
    setAnnotationEntries([{ key: "", value: "" }])
    setEditYamlMode(false)
    setEditYamlText("")
    setEditYamlError(null)
    setEditStep("basic")
  }, [])

  const loadData = React.useCallback(async (workspaceName: string) => {
    const [next, projects, bindings, pipelineProjects] = await Promise.all([
      fetchWorkspaceDetail(workspaceName),
      fetchNamespaces(),
      fetchWorkspaceNamespaceBindings(),
      fetchPipelineProjectRows(workspaceName),
    ])

    const boundNamespaceSet = new Set(
      bindings
        .filter((binding) => binding.workspaceName === next.name)
        .map((binding) => binding.namespaceName)
    )
    const filteredProjects = projects.filter((project) => boundNamespaceSet.has(project.name))

    return {
      detail: next,
      allProjectNames: projects.map((project) => project.name),
      allPipelineProjectNames: pipelineProjects.map((item) => item.name),
      projectRows: filteredProjects.map((project) => ({
        id: `project-${project.id}`,
        name: project.name,
        description: project.description || "-",
        status: project.status,
        workspace: next.name || "-",
        labels: String(project.labels),
        annotations: String(project.annotations),
        age: project.age,
        updatedAt: project.updatedAt,
      })),
      pipelineProjectRows: pipelineProjects.map((item) => ({
        id: `pipeline-project-${item.id}`,
        name: item.name,
        description: item.description,
        repository: "-",
        branch: "-",
        lastRun: "-",
        updatedAt: item.updatedAt,
      })),
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setError(null)

    void loadData(name)
      .then((next) => {
        if (cancelled) return
        setDetail(next.detail)
        setAllProjectNames(next.allProjectNames)
        setAllPipelineProjectNames(next.allPipelineProjectNames)
        setProjectRows(next.projectRows)
        setPipelineProjectRows(next.pipelineProjectRows)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "加载企业空间详情失败")
      })

    return () => {
      cancelled = true
    }
  }, [loadData, name])

  React.useEffect(() => {
    let cancelled = false
    void fetchWorkspaceRows(500)
      .then((items) => {
        if (cancelled) return
        setWorkspaceOptions(items.map((item) => ({ id: item.name, name: item.name })))
      })
      .catch(() => {
        if (cancelled) return
        setWorkspaceOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshProjectRows = React.useCallback(async () => {
    const next = await loadData(name)
    setDetail(next.detail)
    setAllProjectNames(next.allProjectNames)
    setAllPipelineProjectNames(next.allPipelineProjectNames)
    setProjectRows(next.projectRows)
    setPipelineProjectRows(next.pipelineProjectRows)
  }, [loadData, name])

  const openCreateDialog = React.useCallback(() => {
    resetCreateDialogState()
    setCreateOpen(true)
  }, [resetCreateDialogState])

  const openPipelineProjectCreateDialog = React.useCallback(() => {
    resetPipelineProjectCreateDialogState()
    setPipelineProjectCreateOpen(true)
  }, [resetPipelineProjectCreateDialogState])

  const handleCreateSubmit = React.useCallback(() => {
    if (creating) return

    let nextName = createName.trim()
    let nextDescription = createDescription.trim()
    let nextLabels = metadataEntriesToRecord(createLabelEntries)
    let nextAnnotations = metadataEntriesToRecord(createAnnotationEntries)
    const nextWorkspace = currentWorkspaceName

    if (createYamlMode) {
      try {
        const parsed = parseProjectYamlText(createYamlText)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextLabels = metadataEntriesToRecord(parsed.labels)
        nextAnnotations = metadataEntriesToRecord(parsed.annotations)
        setCreateName(nextName)
        setCreateDescription(nextDescription)
        setCreateWorkspace(currentWorkspaceName)
        setCreateLabelEntries(parsed.labels)
        const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, currentWorkspaceName)
        setCreateAnnotationEntries(protectedAnnotations)
        setCreateMetadataEnabled(hasUserProvidedMetadata(parsed.labels, protectedAnnotations))
        setCreateYamlError(null)
      } catch (error) {
        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
        return
      }
    }

    const validationMessage = validateProjectName(nextName)
    if (validationMessage) {
      setCreateNameInvalid(true)
      setCreateNameError(validationMessage)
      if (createYamlMode) setCreateYamlError(validationMessage)
      return
    }

    const selectedWorkspace = nextWorkspace.trim()
    if (!selectedWorkspace) {
      setCreateWorkspaceInvalid(true)
      setCreateWorkspaceError(PROJECT_WORKSPACE_REQUIRED_MESSAGE)
      if (createYamlMode) setCreateYamlError(PROJECT_WORKSPACE_REQUIRED_MESSAGE)
      return
    }

    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCreateWorkspaceInvalid(false)
    setCreateWorkspaceError(null)
    setCreateYamlError(null)
    setCreating(true)
    nextAnnotations = {
      ...nextAnnotations,
      [PROJECT_WORKSPACE_ANNOTATION]: selectedWorkspace,
    }

    const requestPayload: CreateNamespaceInput = {
      name: nextName,
      description: nextDescription,
      labels: nextLabels,
      annotations: nextAnnotations,
    }

    const request = async () => {
      await createNamespace(requestPayload)
      await createWorkspaceNamespaceBinding({
        namespaceName: nextName,
        workspaceName: selectedWorkspace,
      })
    }

    void request()
      .then(async () => {
        setCreateOpen(false)
        resetCreateDialogState()
        await refreshProjectRows()
        setError(null)
      })
      .catch((e: unknown) => {
        const message = resolveCreateProjectErrorMessage(e)
        const isNameError = isNameRelatedCreateError(e)
        setCreateNameInvalid(isNameError)
        setCreateNameError(isNameError ? message : null)
        if (createYamlMode) {
          setCreateYamlError(message)
        }
      })
      .finally(() => {
        setCreating(false)
      })
  }, [
    createAnnotationEntries,
    createDescription,
    createLabelEntries,
    createName,
    createYamlMode,
    createYamlText,
    creating,
    currentWorkspaceName,
    refreshProjectRows,
    resetCreateDialogState,
  ])

  const handlePipelineProjectCreateSubmit = React.useCallback(() => {
    if (pipelineProjectCreating) return

    let nextName = pipelineProjectCreateName.trim()
    let nextDescription = pipelineProjectCreateDescription.trim()
    let nextLabels = metadataEntriesToRecord(pipelineProjectCreateLabelEntries)
    let nextAnnotations = metadataEntriesToRecord(pipelineProjectCreateAnnotationEntries)
    const nextWorkspace = currentWorkspaceName

    if (pipelineProjectCreateYamlMode) {
      try {
        const parsed = parsePipelineProjectYamlText(pipelineProjectCreateYamlText)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextLabels = metadataEntriesToRecord(parsed.labels)
        nextAnnotations = metadataEntriesToRecord(parsed.annotations)
        setPipelineProjectCreateName(nextName)
        setPipelineProjectCreateDescription(nextDescription)
        setPipelineProjectCreateWorkspace(currentWorkspaceName)
        setPipelineProjectCreateLabelEntries(parsed.labels)
        const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, currentWorkspaceName)
        setPipelineProjectCreateAnnotationEntries(protectedAnnotations)
        setPipelineProjectCreateMetadataEnabled(
          hasUserProvidedMetadata(parsed.labels, protectedAnnotations)
        )
        setPipelineProjectCreateYamlError(null)
      } catch (error) {
        setPipelineProjectCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
        return
      }
    }

    const validationMessage = validateProjectName(nextName)
    if (validationMessage) {
      setPipelineProjectCreateNameInvalid(true)
      setPipelineProjectCreateNameError(validationMessage)
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(validationMessage)
      return
    }

    const nameExists = allPipelineProjectNames.includes(nextName)
    if (nameExists) {
      const duplicatedNameMessage = "流水线项目名称已存在，请更换后重试"
      setPipelineProjectCreateNameInvalid(true)
      setPipelineProjectCreateNameError(duplicatedNameMessage)
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(duplicatedNameMessage)
      return
    }

    const selectedWorkspace = nextWorkspace.trim()
    if (!selectedWorkspace) {
      setPipelineProjectCreateWorkspaceInvalid(true)
      setPipelineProjectCreateWorkspaceError(PROJECT_WORKSPACE_REQUIRED_MESSAGE)
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(PROJECT_WORKSPACE_REQUIRED_MESSAGE)
      return
    }

    setPipelineProjectCreateNameInvalid(false)
    setPipelineProjectCreateNameError(null)
    setPipelineProjectCreateWorkspaceInvalid(false)
    setPipelineProjectCreateWorkspaceError(null)
    setPipelineProjectCreateYamlError(null)
    setPipelineProjectCreating(true)
    nextAnnotations = {
      ...nextAnnotations,
      [PROJECT_WORKSPACE_ANNOTATION]: selectedWorkspace,
    }

    void createPipelineProject({
      name: nextName,
      workspaceName: selectedWorkspace,
      description: nextDescription,
      labels: nextLabels,
      annotations: nextAnnotations,
    })
      .then(async () => {
        setPipelineProjectCreateOpen(false)
        resetPipelineProjectCreateDialogState()
        await refreshProjectRows()
        setError(null)
      })
      .catch((e: unknown) => {
        const message = resolveCreateProjectErrorMessage(e)
        const isNameError = isNameRelatedCreateError(e)
        setPipelineProjectCreateNameInvalid(isNameError)
        setPipelineProjectCreateNameError(isNameError ? message : null)
        if (pipelineProjectCreateYamlMode) {
          setPipelineProjectCreateYamlError(message)
        }
      })
      .finally(() => {
        setPipelineProjectCreating(false)
      })
  }, [
    allPipelineProjectNames,
    currentWorkspaceName,
    pipelineProjectCreateAnnotationEntries,
    pipelineProjectCreateDescription,
    pipelineProjectCreateLabelEntries,
    pipelineProjectCreateName,
    pipelineProjectCreateYamlMode,
    pipelineProjectCreateYamlText,
    pipelineProjectCreating,
    refreshProjectRows,
    resetPipelineProjectCreateDialogState,
  ])

  if (error) return <div className="text-sm text-destructive">{error}</div>
  if (!detail) return null

  const handleViewYaml = (row: WorkspaceDetailRow) => {
    const namespaceName = row.name?.trim()
    if (!namespaceName) return
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`查看 Kubernetes Namespace（${namespaceName}）的 YAML 内容。`)

    void fetchNamespaceYaml(namespaceName)
      .then(({ text }) => setYamlContent(text))
      .catch((e: unknown) => setYamlError(e instanceof Error ? e.message : "加载 YAML 失败"))
      .finally(() => setYamlLoading(false))
  }

  const handleViewDescribe = (row: WorkspaceDetailRow) => {
    const namespaceName = row.name?.trim()
    if (!namespaceName) return
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(`查看 Kubernetes Namespace（${namespaceName}）的详情内容。`)

    void fetchResourceDescribe("core", "v1", "namespaces", namespaceName)
      .then(({ text }) => setDescribeContent(text || "(无详情输出)"))
      .catch((e: unknown) => setDescribeError(e instanceof Error ? e.message : "加载详情失败"))
      .finally(() => setDescribeLoading(false))
  }

  const requestEdit = (row: WorkspaceDetailRow) => {
    const namespaceName = row.name?.trim()
    if (!namespaceName) return
    void fetchResourceByName<unknown>("core", "v1", "namespaces", namespaceName)
      .then(({ payload }) => {
        resetEditDialogState()
        const resource =
          typeof payload === "object" && payload !== null && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {}
        const metadata =
          typeof resource.metadata === "object" &&
          resource.metadata !== null &&
          !Array.isArray(resource.metadata)
            ? (resource.metadata as Record<string, unknown>)
            : {}
        const labels =
          typeof metadata.labels === "object" &&
          metadata.labels !== null &&
          !Array.isArray(metadata.labels)
            ? (metadata.labels as Record<string, unknown>)
            : {}
        const annotations =
          typeof metadata.annotations === "object" &&
          metadata.annotations !== null &&
          !Array.isArray(metadata.annotations)
            ? (metadata.annotations as Record<string, unknown>)
            : {}

        const stringLabels = Object.fromEntries(
          Object.entries(labels).filter(([, value]) => typeof value === "string")
        ) as Record<string, string>
        const stringAnnotations = Object.fromEntries(
          Object.entries(annotations).filter(([, value]) => typeof value === "string")
        ) as Record<string, string>

        const initialLabels = metadataRecordToEntries(stringLabels)
        const initialAnnotations = metadataRecordToEntries(stringAnnotations)
        const annotationWorkspace =
          typeof stringAnnotations[PROJECT_WORKSPACE_ANNOTATION] === "string"
            ? stringAnnotations[PROJECT_WORKSPACE_ANNOTATION]
            : ""

        setEditingRow(row)
        setEditName(namespaceName)
        setEditDescription(typeof stringAnnotations.description === "string" ? stringAnnotations.description : "")
        setEditWorkspace(annotationWorkspace || name)
        setWorkspaceBindingExists(true)
        setLabelEntries(initialLabels)
        setAnnotationEntries(initialAnnotations)
        setMetadataEnabled(hasUserProvidedMetadata(initialLabels, initialAnnotations))
        setEditYamlMode(false)
        setEditYamlText("")
        setEditYamlError(null)
        setEditStep("basic")
        setEditOpen(true)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "加载项目详情失败"))
  }

  const handleSaveEdit = () => {
    if (!editingRow?.name || savingEdit) return
    setSavingEdit(true)
    let nextDescription = editDescription.trim()
    let nextLabels = metadataEntriesToRecord(labelEntries)
    let nextAnnotations = metadataEntriesToRecord(annotationEntries)
    let nextWorkspace = editWorkspace.trim()

    if (editYamlMode) {
      try {
        const parsed = parseProjectYamlText(editYamlText)
        nextDescription = parsed.description.trim()
        nextLabels = metadataEntriesToRecord(parsed.labels)
        nextAnnotations = metadataEntriesToRecord(parsed.annotations)
        nextWorkspace =
          typeof nextAnnotations[PROJECT_WORKSPACE_ANNOTATION] === "string"
            ? nextAnnotations[PROJECT_WORKSPACE_ANNOTATION].trim()
            : ""
        setEditDescription(nextDescription)
        setEditWorkspace(nextWorkspace)
        setLabelEntries(parsed.labels)
        setAnnotationEntries(parsed.annotations)
        setMetadataEnabled(hasUserProvidedMetadata(parsed.labels, parsed.annotations))
        setEditYamlError(null)
      } catch (e) {
        setEditYamlError(e instanceof Error ? e.message : "YAML 解析失败")
        setSavingEdit(false)
        return
      }
    }

    if (nextWorkspace) nextAnnotations[PROJECT_WORKSPACE_ANNOTATION] = nextWorkspace
    else delete nextAnnotations[PROJECT_WORKSPACE_ANNOTATION]

    void updateNamespace({
      name: editingRow.name,
      description: nextDescription,
      labels: nextLabels,
      annotations: nextAnnotations,
    })
      .then(async () => {
        setEditOpen(false)
        await refreshProjectRows()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "保存项目失败"))
      .finally(() => setSavingEdit(false))
  }

  const handleConfirmDelete = () => {
    const namespaceName = pendingDeleteRow?.name?.trim()
    if (!namespaceName || deleting) return
    setDeleting(true)
    void deleteNamespace(namespaceName)
      .then(async () => {
        setPendingDeleteRow(null)
        await refreshProjectRows()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "删除失败"))
      .finally(() => setDeleting(false))
  }

  const handleDeleteSelectedRows = (selectedRows: WorkspaceDetailRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows
        .map((row) => row.name?.trim())
        .filter((v): v is string => Boolean(v))
        .map((namespaceName) => deleteNamespace(namespaceName))
    )
      .then(async () => {
        await refreshProjectRows()
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "批量删除失败"))
  }

  const columns = createColumns<WorkspaceDetailRow>({
    columns:
      activeTab === "projects"
        ? projectColumns
        : activeTab === "pipelineProjects"
          ? pipelineProjectColumns
          : activeTab === "roles"
            ? roleColumns
            : memberColumns,
    actionItems:
      activeTab === "projects"
        ? [
            {
              label: (
                <>
                  <IconEye className="size-4" />
                  {"查看 YAML"}
                </>
              ),
              onSelect: (row) => handleViewYaml(row),
            },
            {
              label: (
                <>
                  <IconInfoCircle className="size-4" />
                  {"详情"}
                </>
              ),
              onSelect: (row) => handleViewDescribe(row),
            },
            {
              label: (
                <>
                  <IconPencil className="size-4" />
                  {"编辑"}
                </>
              ),
              onSelect: (row) => requestEdit(row),
            },
            {
              label: (
                <>
                  <IconTrash className="size-4" />
                  {"删除"}
                </>
              ),
              variant: "destructive",
              withSeparator: true,
              onSelect: (row) => setPendingDeleteRow(row),
            },
          ]
        : [],
  })

  const data =
    activeTab === "projects"
      ? projectRows
      : activeTab === "pipelineProjects"
        ? pipelineProjectRows
        : activeTab === "roles"
          ? [
              {
                id: `role-owner-${detail.name}`,
                role: "workspace-admin",
                scope: "Workspace",
                bindings: "1",
              },
            ]
          : [
              {
                id: `member-owner-${detail.name}`,
                member: detail.owner || "-",
                role: "workspace-admin",
                status: "Normal",
              },
            ]

  const tabs = (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)} className="w-fit">
      <TabsList>
        <TabsTrigger value="projects">项目</TabsTrigger>
        <TabsTrigger value="pipelineProjects">流水线项目</TabsTrigger>
        <TabsTrigger value="roles">角色</TabsTrigger>
        <TabsTrigger value="members">企业空间成员</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  return (
    <>
      <DataTable
        data={data}
        columns={columns}
        toolbarStart={tabs}
        enableRowNavigation={false}
        getRowHref={() => null}
        showColumnCustomizer={false}
        onCreate={
          activeTab === "projects"
            ? openCreateDialog
            : activeTab === "pipelineProjects"
              ? openPipelineProjectCreateDialog
              : () => void 0
        }
        onDeleteSelectedRows={activeTab === "projects" ? handleDeleteSelectedRows : undefined}
      />

      <Dialog
        open={pipelineProjectCreateOpen}
        onOpenChange={(open) => {
          if (!open && pipelineProjectCreating) return
          setPipelineProjectCreateOpen(open)
          if (!open) resetPipelineProjectCreateDialogState()
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
                <DialogTitle>创建流水线项目</DialogTitle>
                <DialogDescription>创建流水线项目并归属到当前企业空间。</DialogDescription>
              </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={pipelineProjectCreateYamlMode}
                    onCheckedChange={(checked) => {
                      if (pipelineProjectCreating) return
                      if (checked) {
                        const annotationsForYaml = metadataEntriesToRecord(pipelineProjectCreateAnnotationEntries)
                        const workspaceValue = currentWorkspaceName
                        if (workspaceValue) {
                          annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION] = workspaceValue
                        } else {
                          delete annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION]
                        }
                        setPipelineProjectCreateYamlText(
                          buildPipelineProjectYamlText({
                            name: pipelineProjectCreateName,
                            description: pipelineProjectCreateDescription,
                            workspaceName: currentWorkspaceName,
                            labels: pipelineProjectCreateLabelEntries,
                            annotations: metadataRecordToEntries(annotationsForYaml),
                          })
                        )
                        setPipelineProjectCreateYamlError(null)
                        setPipelineProjectCreateYamlMode(true)
                        return
                      }

                      try {
                        const parsed = parsePipelineProjectYamlText(pipelineProjectCreateYamlText)
                        setPipelineProjectCreateName(parsed.name)
                        setPipelineProjectCreateDescription(parsed.description)
                        const nextWorkspace = currentWorkspaceName || parsed.workspaceName.trim()
                        setPipelineProjectCreateWorkspace(nextWorkspace)
                        setPipelineProjectCreateLabelEntries(parsed.labels)
                        const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, nextWorkspace)
                        setPipelineProjectCreateAnnotationEntries(protectedAnnotations)
                        setPipelineProjectCreateMetadataEnabled(
                          hasUserProvidedMetadata(parsed.labels, protectedAnnotations)
                        )
                        setPipelineProjectCreateYamlError(null)
                        setPipelineProjectCreateYamlMode(false)
                      } catch (error) {
                        setPipelineProjectCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                      }
                    }}
                    disabled={pipelineProjectCreating}
                    aria-label="编辑 YAML"
                  />
                </div>
              </div>
            </div>

            {!pipelineProjectCreateYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: "基本信息",
                    status: pipelineProjectCreateStep === "basic" ? "当前" : "已设置",
                    active: pipelineProjectCreateStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: pipelineProjectCreating,
                    onClick: () => {
                      if (pipelineProjectCreating) return
                      setPipelineProjectCreateStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status:
                      pipelineProjectCreateStep === "advanced"
                        ? "当前"
                        : hasUserProvidedMetadata(
                            pipelineProjectCreateLabelEntries,
                            pipelineProjectCreateAnnotationEntries
                          )
                          ? "已设置"
                          : "未设置",
                    active: pipelineProjectCreateStep === "advanced",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: pipelineProjectCreating,
                    onClick: () => {
                      if (pipelineProjectCreating) return
                      setPipelineProjectCreateStep("advanced")
                    },
                  },
                ]}
              />
            ) : null}

            <div
              className={
                pipelineProjectCreateYamlMode ? "min-h-0 flex-1 p-6" : "min-h-0 flex-1 overflow-y-auto"
              }
            >
              {pipelineProjectCreateYamlMode ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <MonacoEditor
                      language="yaml"
                      theme="vs-dark"
                      value={pipelineProjectCreateYamlText}
                      onChange={(value) => {
                        setPipelineProjectCreateYamlText(value ?? "")
                        if (pipelineProjectCreateYamlError) setPipelineProjectCreateYamlError(null)
                        if (pipelineProjectCreateNameInvalid) setPipelineProjectCreateNameInvalid(false)
                        if (pipelineProjectCreateNameError) setPipelineProjectCreateNameError(null)
                      }}
                      options={MONACO_OPTIONS}
                      height="100%"
                    />
                  </div>
                  {pipelineProjectCreateYamlError ? (
                    <FieldError className="mt-3">{pipelineProjectCreateYamlError}</FieldError>
                  ) : null}
                </div>
              ) : pipelineProjectCreateStep === "basic" ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">基本信息</h3>
                    <p className="mt-1 text-sm text-muted-foreground">填写流水线项目名称与描述信息。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field data-invalid={pipelineProjectCreateNameInvalid}>
                        <FieldLabel htmlFor="workspace-pipeline-project-create-name">名称</FieldLabel>
                        <Input
                          id="workspace-pipeline-project-create-name"
                          value={pipelineProjectCreateName}
                          onChange={(event) => {
                            setPipelineProjectCreateName(event.target.value)
                            if (pipelineProjectCreateNameInvalid) setPipelineProjectCreateNameInvalid(false)
                            if (pipelineProjectCreateNameError) setPipelineProjectCreateNameError(null)
                          }}
                          placeholder="请输入流水线项目名称"
                          autoComplete="off"
                          aria-invalid={pipelineProjectCreateNameInvalid}
                          disabled={pipelineProjectCreating}
                        />
                        {pipelineProjectCreateNameError ? (
                          <FieldError>{pipelineProjectCreateNameError}</FieldError>
                        ) : (
                          <FieldDescription>{PROJECT_NAME_RULE_MESSAGE}</FieldDescription>
                        )}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="workspace-pipeline-project-create-workspace">企业空间</FieldLabel>
                        <FilterCombobox
                          options={workspaceOptions}
                          value={pipelineProjectCreateWorkspace}
                          onValueChange={(value) => {
                            setPipelineProjectCreateWorkspace(value)
                            setPipelineProjectCreateAnnotationEntries((prev) => {
                              const ensured = ensureWorkspaceAnnotationEntries(prev, value)
                              return areMetadataEntriesEqual(prev, ensured) ? prev : ensured
                            })
                            if (pipelineProjectCreateWorkspaceInvalid) setPipelineProjectCreateWorkspaceInvalid(false)
                            if (pipelineProjectCreateWorkspaceError) setPipelineProjectCreateWorkspaceError(null)
                          }}
                          placeholder="请选择企业空间"
                          emptyText="暂无企业空间"
                          className="h-10"
                          ariaInvalid={pipelineProjectCreateWorkspaceInvalid}
                          disabled
                        />
                        {pipelineProjectCreateWorkspaceError ? (
                          <FieldError>{pipelineProjectCreateWorkspaceError}</FieldError>
                        ) : (
                          <FieldDescription>
                            当前在企业空间详情页创建，企业空间固定为 {currentWorkspaceName}。
                          </FieldDescription>
                        )}
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="workspace-pipeline-project-create-description">描述</FieldLabel>
                      <Textarea
                        id="workspace-pipeline-project-create-description"
                        value={pipelineProjectCreateDescription}
                        onChange={(event) => setPipelineProjectCreateDescription(event.target.value)}
                        placeholder="请输入描述"
                        maxLength={256}
                        className="min-h-28"
                        disabled={pipelineProjectCreating}
                      />
                      <FieldDescription>描述将写入资源注解 description，最长 256 个字符。</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">补充标签与注解信息，便于检索、分类和后续治理。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field>
                      <ResourceMetadataEditor
                        checked={pipelineProjectCreateMetadataEnabled}
                        onCheckedChange={setPipelineProjectCreateMetadataEnabled}
                        labels={pipelineProjectCreateLabelEntries}
                        setLabels={setPipelineProjectCreateLabelEntries}
                        annotations={pipelineProjectCreateAnnotationEntries}
                        setAnnotations={(next) => {
                          setPipelineProjectCreateAnnotationEntries((prev) => {
                            const resolved = typeof next === "function" ? next(prev) : next
                            const ensured = ensureWorkspaceAnnotationEntries(resolved, currentWorkspaceName)
                            return areMetadataEntriesEqual(prev, ensured) ? prev : ensured
                          })
                        }}
                        description={pipelineProjectCreateDescription}
                        setDescription={setPipelineProjectCreateDescription}
                        disabled={pipelineProjectCreating}
                        titleText="统一管理流水线项目的标签与注解信息。"
                      />
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-background px-6 py-5">
              {pipelineProjectCreateYamlMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pipelineProjectCreating}
                    onClick={() => setPipelineProjectCreateOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePipelineProjectCreateSubmit}
                    disabled={pipelineProjectCreating}
                  >
                    {pipelineProjectCreating ? "创建中..." : "创建"}
                  </Button>
                </>
              ) : pipelineProjectCreateStep === "basic" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pipelineProjectCreating}
                    onClick={() => setPipelineProjectCreateOpen(false)}
                  >
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={pipelineProjectCreating}
                    onClick={() => {
                      const nextName = pipelineProjectCreateName.trim()
                      const validationMessage = validateProjectName(nextName)
                      if (validationMessage) {
                        setPipelineProjectCreateNameInvalid(true)
                        setPipelineProjectCreateNameError(validationMessage)
                        return
                      }

                      const nameExists = allPipelineProjectNames.includes(nextName)
                      if (nameExists) {
                        setPipelineProjectCreateNameInvalid(true)
                        setPipelineProjectCreateNameError("流水线项目名称已存在，请更换后重试")
                        return
                      }

                      setPipelineProjectCreateNameInvalid(false)
                      setPipelineProjectCreateNameError(null)

                      const selectedWorkspace = currentWorkspaceName.trim()
                      if (!selectedWorkspace) {
                        setPipelineProjectCreateWorkspaceInvalid(true)
                        setPipelineProjectCreateWorkspaceError(PROJECT_WORKSPACE_REQUIRED_MESSAGE)
                        return
                      }
                      setPipelineProjectCreateWorkspaceInvalid(false)
                      setPipelineProjectCreateWorkspaceError(null)
                      setPipelineProjectCreateStep("advanced")
                    }}
                  >
                    下一步
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pipelineProjectCreating}
                    onClick={() => setPipelineProjectCreateStep("basic")}
                  >
                    上一步
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePipelineProjectCreateSubmit}
                    disabled={pipelineProjectCreating}
                  >
                    {pipelineProjectCreating ? "创建中..." : "创建"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateOpen(open)
          if (!open) resetCreateDialogState()
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
                <DialogTitle>创建项目</DialogTitle>
                <DialogDescription>创建项目以对资源进行分组并控制不同用户的权限。</DialogDescription>
              </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (creating) return
                      if (checked) {
                        const annotationsForYaml = metadataEntriesToRecord(createAnnotationEntries)
                        const workspaceValue = currentWorkspaceName
                        if (workspaceValue) {
                          annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION] = workspaceValue
                        } else {
                          delete annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION]
                        }
                        setCreateYamlText(
                          buildProjectYamlText({
                            name: createName,
                            description: createDescription,
                            labels: createLabelEntries,
                            annotations: metadataRecordToEntries(annotationsForYaml),
                          })
                        )
                        setCreateYamlError(null)
                        setCreateYamlMode(true)
                        return
                      }

                      try {
                        const parsed = parseProjectYamlText(createYamlText)
                        setCreateName(parsed.name)
                        setCreateDescription(parsed.description)
                        const parsedWorkspace =
                          parsed.annotations.find((entry) => entry.key === PROJECT_WORKSPACE_ANNOTATION)?.value ?? ""
                        const nextWorkspace = currentWorkspaceName || parsedWorkspace.trim()
                        setCreateWorkspace(nextWorkspace)
                        setCreateLabelEntries(parsed.labels)
                        const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, nextWorkspace)
                        setCreateAnnotationEntries(protectedAnnotations)
                        setCreateMetadataEnabled(hasUserProvidedMetadata(parsed.labels, protectedAnnotations))
                        setCreateYamlError(null)
                        setCreateYamlMode(false)
                      } catch (error) {
                        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                      }
                    }}
                    disabled={creating}
                    aria-label="编辑 YAML"
                  />
                </div>
              </div>
            </div>

            {!createYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: "基本信息",
                    status: createStep === "basic" ? "当前" : "已设置",
                    active: createStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => {
                      if (creating) return
                      setCreateStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status:
                      createStep === "advanced"
                        ? "当前"
                        : hasUserProvidedMetadata(createLabelEntries, createAnnotationEntries)
                          ? "已设置"
                          : "未设置",
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

            <div className={createYamlMode ? "min-h-0 flex-1 p-6" : "min-h-0 flex-1 overflow-y-auto"}>
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
              ) : createStep === "basic" ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">基本信息</h3>
                    <p className="mt-1 text-sm text-muted-foreground">填写项目名称与描述信息。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field data-invalid={createNameInvalid}>
                        <FieldLabel htmlFor="workspace-project-create-name">名称</FieldLabel>
                        <Input
                          id="workspace-project-create-name"
                          value={createName}
                          onChange={(event) => {
                            setCreateName(event.target.value)
                            if (createNameInvalid) setCreateNameInvalid(false)
                            if (createNameError) setCreateNameError(null)
                          }}
                          placeholder="请输入项目名称"
                          autoComplete="off"
                          aria-invalid={createNameInvalid}
                          disabled={creating}
                        />
                        {createNameError ? (
                          <FieldError>{createNameError}</FieldError>
                        ) : (
                          <FieldDescription>{PROJECT_NAME_RULE_MESSAGE}</FieldDescription>
                        )}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="workspace-project-create-workspace">企业空间</FieldLabel>
                        <FilterCombobox
                          options={workspaceOptions}
                          value={createWorkspace}
                          onValueChange={(value) => {
                            setCreateWorkspace(value)
                            setCreateAnnotationEntries((prev) => ensureWorkspaceAnnotationEntries(prev, value))
                            if (createWorkspaceInvalid) setCreateWorkspaceInvalid(false)
                            if (createWorkspaceError) setCreateWorkspaceError(null)
                          }}
                          placeholder="请选择企业空间"
                          emptyText="暂无企业空间"
                          className="h-10"
                          ariaInvalid={createWorkspaceInvalid}
                          disabled
                        />
                        {createWorkspaceError ? (
                          <FieldError>{createWorkspaceError}</FieldError>
                        ) : (
                          <FieldDescription>
                            当前在企业空间详情页创建，企业空间固定为 {currentWorkspaceName}。
                          </FieldDescription>
                        )}
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="workspace-project-create-description">描述</FieldLabel>
                      <Textarea
                        id="workspace-project-create-description"
                        value={createDescription}
                        onChange={(event) => setCreateDescription(event.target.value)}
                        placeholder="请输入描述"
                        maxLength={256}
                        className="min-h-28"
                        disabled={creating}
                      />
                      <FieldDescription>描述将写入资源注解 description，最长 256 个字符。</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">补充标签与注解信息，便于检索、分类和后续治理。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field>
                      <ResourceMetadataEditor
                        checked={createMetadataEnabled}
                        onCheckedChange={setCreateMetadataEnabled}
                        labels={createLabelEntries}
                        setLabels={setCreateLabelEntries}
                        annotations={createAnnotationEntries}
                        setAnnotations={(next) => {
                          setCreateAnnotationEntries((prev) => {
                            const resolved = typeof next === "function" ? next(prev) : next
                            const ensured = ensureWorkspaceAnnotationEntries(
                              resolved,
                              currentWorkspaceName
                            )
                            return areMetadataEntriesEqual(prev, ensured) ? prev : ensured
                          })
                        }}
                        description={createDescription}
                        setDescription={setCreateDescription}
                        disabled={creating}
                        titleText="统一管理项目的标签与注解信息。"
                      />
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-background px-6 py-5">
              {createYamlMode ? (
                <>
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>
                    取消
                  </Button>
                  <Button type="button" onClick={handleCreateSubmit} disabled={creating}>
                    {creating ? "创建中..." : "创建"}
                  </Button>
                </>
              ) : createStep === "basic" ? (
                <>
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>
                    取消
                  </Button>
                  <Button
                    type="button"
                    disabled={creating}
                    onClick={() => {
                      const nextName = createName.trim()
                      const validationMessage = validateProjectName(nextName)
                      if (validationMessage) {
                        setCreateNameInvalid(true)
                        setCreateNameError(validationMessage)
                        return
                      }

                      const nameExists = allProjectNames.includes(nextName)
                      if (nameExists) {
                        setCreateNameInvalid(true)
                        setCreateNameError("项目名称已存在，请更换后重试")
                        return
                      }

                      setCreateNameInvalid(false)
                      setCreateNameError(null)

                      const selectedWorkspace = currentWorkspaceName.trim()
                      if (!selectedWorkspace) {
                        setCreateWorkspaceInvalid(true)
                        setCreateWorkspaceError(PROJECT_WORKSPACE_REQUIRED_MESSAGE)
                        return
                      }
                      setCreateWorkspaceInvalid(false)
                      setCreateWorkspaceError(null)
                      setCreateStep("advanced")
                    }}
                  >
                    下一步
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateStep("basic")}>
                    上一步
                  </Button>
                  <Button type="button" onClick={handleCreateSubmit} disabled={creating}>
                    {creating ? "创建中..." : "创建"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <DescribeViewerDialog
        title="查看详情"
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />

      <MonacoViewerDialog
        title="查看YAML"
        subtitle={yamlSubtitle}
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />

      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title="删除项目"
        description={pendingDeleteRow?.name ? `确定删除项目 ${pendingDeleteRow.name} 吗？` : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />

      <Dialog open={editOpen} onOpenChange={(open) => !savingEdit && setEditOpen(open)}>
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>编辑项目</DialogTitle>
                <DialogDescription>编辑项目描述信息。</DialogDescription>
              </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={editYamlMode}
                    onCheckedChange={(checked) => {
                      if (savingEdit) return
                      if (checked) {
                        const annotationsForYaml = metadataEntriesToRecord(annotationEntries)
                        const workspaceValue = editWorkspace.trim()
                        if (workspaceValue) annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION] = workspaceValue
                        else delete annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION]

                        setEditYamlText(
                          buildProjectYamlText({
                            name: editName,
                            description: editDescription,
                            labels: labelEntries,
                            annotations: metadataRecordToEntries(annotationsForYaml),
                          })
                        )
                        setEditYamlError(null)
                        setEditYamlMode(true)
                        return
                      }

                      try {
                        const parsed = parseProjectYamlText(editYamlText)
                        setEditDescription(parsed.description)
                        setEditWorkspace(
                          parsed.annotations.find((entry) => entry.key === PROJECT_WORKSPACE_ANNOTATION)?.value ?? ""
                        )
                        setLabelEntries(parsed.labels)
                        setAnnotationEntries(parsed.annotations)
                        setMetadataEnabled(hasUserProvidedMetadata(parsed.labels, parsed.annotations))
                        setEditYamlError(null)
                        setEditYamlMode(false)
                      } catch (e) {
                        setEditYamlError(e instanceof Error ? e.message : "YAML 解析失败")
                      }
                    }}
                    disabled={savingEdit}
                    aria-label="编辑 YAML"
                  />
                </div>
              </div>
            </div>

            {!editYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: "基本信息",
                    status: editStep === "basic" ? "当前" : "已设置",
                    active: editStep === "basic",
                    icon: <IconPencil className="size-4" />,
                    disabled: savingEdit,
                    onClick: () => {
                      if (savingEdit) return
                      setEditStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status:
                      editStep === "advanced"
                        ? "当前"
                        : hasUserProvidedMetadata(labelEntries, annotationEntries)
                          ? "已设置"
                          : "未设置",
                    active: editStep === "advanced",
                    icon: <IconPencil className="size-4" />,
                    disabled: savingEdit,
                    onClick: () => {
                      if (savingEdit) return
                      setEditStep("advanced")
                    },
                  },
                ]}
              />
            ) : null}

            <div className={editYamlMode ? "min-h-0 flex-1 p-6" : "min-h-0 flex-1 overflow-y-auto"}>
              {editYamlMode ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <MonacoEditor
                      language="yaml"
                      theme="vs-dark"
                      value={editYamlText}
                      onChange={(value) => {
                        setEditYamlText(value ?? "")
                        if (editYamlError) setEditYamlError(null)
                      }}
                      options={MONACO_OPTIONS}
                      height="100%"
                    />
                  </div>
                  {editYamlError ? <FieldError className="mt-3">{editYamlError}</FieldError> : null}
                </div>
              ) : editStep === "basic" ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">基本信息</h3>
                    <p className="mt-1 text-sm text-muted-foreground">填写项目名称与描述信息。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="workspace-project-edit-name">名称</FieldLabel>
                        <Input id="workspace-project-edit-name" value={editName} disabled className="h-10" />
                        <FieldDescription>{PROJECT_NAME_RULE_MESSAGE}</FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="workspace-project-edit-workspace">企业空间</FieldLabel>
                        <FilterCombobox
                          options={workspaceOptions}
                          value={editWorkspace}
                          onValueChange={setEditWorkspace}
                          placeholder="请选择企业空间"
                          emptyText="暂无企业空间"
                          className="h-10"
                          disabled={savingEdit || workspaceBindingExists}
                        />
                        <FieldDescription>
                          {workspaceBindingExists
                            ? "已存在项目与企业空间绑定关系，如需调整请先删除对应 binding。"
                            : `可选，保存到注解 ${PROJECT_WORKSPACE_ANNOTATION}。`}
                        </FieldDescription>
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="workspace-project-edit-description">描述</FieldLabel>
                      <Textarea
                        id="workspace-project-edit-description"
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                        placeholder="请输入描述"
                        maxLength={256}
                        className="min-h-28"
                        disabled={savingEdit}
                      />
                      <FieldDescription>描述将写入资源注解 description，最长 256 个字符。</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">补充标签与注解信息，便于检索、分类和后续治理。</p>
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
                        description={editDescription}
                        setDescription={setEditDescription}
                        disabled={savingEdit}
                        titleText="统一管理项目的标签与注解信息。"
                      />
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-background px-6 py-5">
              {editYamlMode ? (
                <>
                  <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditOpen(false)}>
                    取消
                  </Button>
                  <Button type="button" onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? "保存中..." : "保存"}
                  </Button>
                </>
              ) : editStep === "basic" ? (
                <>
                  <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditOpen(false)}>
                    取消
                  </Button>
                  <Button type="button" disabled={savingEdit} onClick={() => setEditStep("advanced")}>
                    下一步
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" disabled={savingEdit} onClick={() => setEditStep("basic")}>
                    上一步
                  </Button>
                  <Button type="button" onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? "保存中..." : "保存"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
