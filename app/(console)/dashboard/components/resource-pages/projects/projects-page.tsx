"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconEye, IconInfoCircle, IconPencil, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  ResourceMetadataEditor,
  hasUserProvidedMetadata,
  metadataEntriesToRecord,
  metadataRecordToEntries,
  type MetadataEntry,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  createNamespace,
  deleteNamespace,
  fetchNamespaceYaml,
  fetchNamespaces,
  type CreateNamespaceInput,
  type NamespaceRow,
  updateNamespace,
} from "@/app/lib/kubespark/projects"
import {
  createPipelineProject,
  deletePipelineProject,
  fetchPipelineProjectDetail,
  fetchPipelineProjectRows,
  type PipelineProjectRow,
  updatePipelineProject,
} from "@/app/lib/kubespark/pipeline-projects"
import { fetchWorkspaceRows } from "@/app/lib/kubespark/workspaces"
import {
  createWorkspaceNamespaceBinding,
  fetchWorkspaceNamespaceBindings,
  fetchWorkspaceNamespaceBindingByNamespace,
} from "@/app/lib/kubespark/workspace-namespace-bindings"
import { fetchResourceByName, fetchResourceDescribe } from "@/app/lib/kubespark/common"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FilterCombobox, type FilterComboboxOption } from "@/components/ui/filter-combobox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

function getProjectColumns(t: (key: string) => string): ColumnConfig<NamespaceRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
      enableHiding: false,
    },
    { key: "status", label: t("table.columns.status"), render: "status" },
    { key: "workspace", label: t("table.columns.workspace") },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

function getPipelineProjectColumns(t: (key: string) => string): ColumnConfig<PipelineProjectRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
      enableHiding: false,
    },
    { key: "workspace", label: t("table.columns.workspace") },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

function resolveCreateProjectErrorMessage(error: unknown, t: (key: string) => string): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()

  if (text.includes("already exists")) {
    return t("projectsDialog.nameExists")
  }

  if (text.includes("状态码 409") || text.includes("status 409")) {
    return t("projectsDialog.nameExists")
  }

  if (raw) return raw
  return t("projectsDialog.createFailed")
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

const PROJECT_WORKSPACE_ANNOTATION = "tanqidi.com/workspace"

function validateProjectName(name: string, t: (key: string) => string): string | null {
  if (!name) return t("projectsDialog.nameRequired")
  if (name.length > 63) return t("projectsDialog.nameRule")
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) {
    return t("projectsDialog.nameRule")
  }
  return null
}

function ensureWorkspaceAnnotationEntries(
  entries: MetadataEntry[],
  workspace: string
): MetadataEntry[] {
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
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parseProjectYamlText(yamlText: string, t: (key: string) => string): {
  name: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
} {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error(t("projectsDialog.yamlRequired"))

  const parsed = parse(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error(t("projectsDialog.yamlInvalid"))

  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "Namespace") throw new Error(t("projectsDialog.yamlKindMustBe"))

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
      Object.fromEntries(
        Object.entries(labels).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
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

function parsePipelineProjectYamlText(yamlText: string, t: (key: string) => string): {
  name: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  workspaceName: string
} {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error(t("projectsDialog.yamlRequired"))
  const parsed = parse(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error(t("projectsDialog.yamlInvalid"))
  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "PipelineProject") throw new Error(t("projectsDialog.yamlKindMustBePipeline"))

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

export function ProjectsPageClient() {
  type ProjectDialogStep = "basic" | "advanced"
  type ProjectTab = "projects" | "pipelineProjects"
  const t = useTranslations()
  const [rows, setRows] = React.useState<NamespaceRow[]>([])
  const [pipelineRows, setPipelineRows] = React.useState<PipelineProjectRow[]>([])
  const [activeTab, setActiveTab] = React.useState<ProjectTab>("projects")
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [workspaceQuery, setWorkspaceQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState(t("projectsDialog.yamlSubtitle"))
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState(t("projectsDialog.describeSubtitle"))
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<NamespaceRow | null>(null)
  const [pendingPipelineDeleteRow, setPendingPipelineDeleteRow] = React.useState<PipelineProjectRow | null>(null)
  const [editingRow, setEditingRow] = React.useState<NamespaceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [pipelineDeleting, setPipelineDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [pipelineProjectCreateOpen, setPipelineProjectCreateOpen] = React.useState(false)
  const [pipelineProjectCreateName, setPipelineProjectCreateName] = React.useState("")
  const [pipelineProjectCreateDescription, setPipelineProjectCreateDescription] = React.useState("")
  const [pipelineProjectCreateWorkspace, setPipelineProjectCreateWorkspace] = React.useState("")
  const [pipelineProjectCreateWorkspaceInvalid, setPipelineProjectCreateWorkspaceInvalid] = React.useState(false)
  const [pipelineProjectCreateWorkspaceError, setPipelineProjectCreateWorkspaceError] = React.useState<string | null>(
    null
  )
  const [pipelineProjectCreateMetadataEnabled, setPipelineProjectCreateMetadataEnabled] = React.useState(false)
  const [pipelineProjectCreateLabelEntries, setPipelineProjectCreateLabelEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [pipelineProjectCreateAnnotationEntries, setPipelineProjectCreateAnnotationEntries] = React.useState<
    MetadataEntry[]
  >([{ key: "", value: "" }])
  const [pipelineProjectCreateNameInvalid, setPipelineProjectCreateNameInvalid] = React.useState(false)
  const [pipelineProjectCreateNameError, setPipelineProjectCreateNameError] = React.useState<string | null>(null)
  const [pipelineProjectCreateYamlMode, setPipelineProjectCreateYamlMode] = React.useState(false)
  const [pipelineProjectCreateYamlText, setPipelineProjectCreateYamlText] = React.useState("")
  const [pipelineProjectCreateYamlError, setPipelineProjectCreateYamlError] = React.useState<string | null>(null)
  const [pipelineProjectCreating, setPipelineProjectCreating] = React.useState(false)
  const [pipelineProjectCreateStep, setPipelineProjectCreateStep] = React.useState<ProjectDialogStep>("basic")
  const [pipelineProjectDialogMode, setPipelineProjectDialogMode] = React.useState<"create" | "edit">("create")
  const [pipelineProjectEditingName, setPipelineProjectEditingName] = React.useState<string | null>(null)
  const [createName, setCreateName] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createWorkspace, setCreateWorkspace] = React.useState("")
  const [workspaceOptions, setWorkspaceOptions] = React.useState<FilterComboboxOption[]>([])
  const [createWorkspaceInvalid, setCreateWorkspaceInvalid] = React.useState(false)
  const [createWorkspaceError, setCreateWorkspaceError] = React.useState<string | null>(null)
  const [workspaceBindingExists, setWorkspaceBindingExists] = React.useState(false)
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [createStep, setCreateStep] = React.useState<ProjectDialogStep>("basic")
  const isEditMode = Boolean(editingRow)
  const dialogTitle = isEditMode ? t("projectsDialog.editTitle") : t("projectsDialog.createTitle")
  const dialogDescription = isEditMode
    ? t("projectsDialog.editDesc")
    : t("projectsDialog.createDesc")
  const mergeRowsWithWorkspaceBindings = React.useCallback(
    async (namespaceRows: NamespaceRow[]): Promise<NamespaceRow[]> => {
      const bindings = await fetchWorkspaceNamespaceBindings(1000)
      const namespaceToWorkspace = new Map<string, string>()
      for (const binding of bindings) {
        const namespaceName = binding.namespaceName.trim()
        const workspaceName = binding.workspaceName.trim()
        if (!namespaceName || !workspaceName) continue
        namespaceToWorkspace.set(namespaceName, workspaceName)
      }
      return namespaceRows.map((row) => ({
        ...row,
        workspace: namespaceToWorkspace.get(row.name) ?? row.workspace,
      }))
    },
    []
  )
  const resetCreateDialogState = React.useCallback(() => {
    setEditingRow(null)
    setCreateName("")
    setCreateDescription("")
    setCreateWorkspace("")
    setCreateWorkspaceInvalid(false)
    setCreateWorkspaceError(null)
    setWorkspaceBindingExists(false)
    setMetadataEnabled(false)
    setLabelEntries([{ key: "", value: "" }])
    setAnnotationEntries([{ key: "", value: "" }])
    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateStep("basic")
  }, [])

  const handleCreateNextStep = React.useCallback(() => {
    if (creating) return

    const nextName = (editingRow?.name ?? createName).trim().toLowerCase()
    const nextWorkspace = createWorkspace.trim()

    const nameError = validateProjectName(nextName, t)
    setCreateNameInvalid(Boolean(nameError))
    setCreateNameError(nameError)

    const workspaceError = !nextWorkspace ? t("projectsDialog.workspaceRequired") : null
    setCreateWorkspaceInvalid(Boolean(workspaceError))
    setCreateWorkspaceError(workspaceError)

    if (nameError || workspaceError) {
      setCreateStep("basic")
      return
    }

    setCreateStep("advanced")
  }, [creating, createName, createWorkspace, editingRow?.name, t])
  const resetPipelineDialogState = React.useCallback(() => {
    setPipelineProjectDialogMode("create")
    setPipelineProjectEditingName(null)
    setPipelineProjectCreateName("")
    setPipelineProjectCreateDescription("")
    setPipelineProjectCreateWorkspace("")
    setPipelineProjectCreateWorkspaceInvalid(false)
    setPipelineProjectCreateWorkspaceError(null)
    setPipelineProjectCreateMetadataEnabled(false)
    setPipelineProjectCreateLabelEntries([{ key: "", value: "" }])
    setPipelineProjectCreateAnnotationEntries([{ key: "", value: "" }])
    setPipelineProjectCreateNameInvalid(false)
    setPipelineProjectCreateNameError(null)
    setPipelineProjectCreateYamlMode(false)
    setPipelineProjectCreateYamlText("")
    setPipelineProjectCreateYamlError(null)
    setPipelineProjectCreateStep("basic")
  }, [])

  const handleViewYaml = React.useCallback((row: NamespaceRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("projectsDialog.yamlSubtitleWithName", { name: row.name }))

    void fetchNamespaceYaml(row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Projects] view yaml response", {
          namespace: row.name,
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.loadFailed")
        setYamlError(message)
        console.error("[Projects] view yaml request failed", {
          namespace: row.name,
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])
  const handleViewPipelineYaml = React.useCallback((row: PipelineProjectRow) => {
    const pipelineProjectName = row.name.trim()
    if (!pipelineProjectName || pipelineProjectName === "-") return
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("projectsDialog.yamlPipelineSubtitle", { name: pipelineProjectName }))

    void fetchResourceByName<Record<string, unknown>>(
      "tanqidi.com",
      "v1alpha1",
      "pipelineprojects",
      pipelineProjectName
    )
      .then(({ payload }) => {
        const text = stringify(payload, {
          indent: 2,
          lineWidth: 0,
          sortMapEntries: false,
        })
        setYamlContent(text)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.loadFailed")
        setYamlError(message)
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const handleViewDescribe = React.useCallback((row: NamespaceRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(t("projectsDialog.describeSubtitleWithName", { name: row.name }))

    void fetchResourceDescribe("core", "v1", "namespaces", row.name)
      .then(({ text }) => {
        setDescribeContent(text || t("projectsDialog.describeNoContent"))
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.loadDetailFailed")
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [t])

  const requestDelete = React.useCallback((row: NamespaceRow) => {
    setPendingDeleteRow(row)
  }, [])

  const requestEdit = React.useCallback((row: NamespaceRow) => {
    void Promise.all([
      fetchResourceByName<unknown>("core", "v1", "namespaces", row.name),
      fetchWorkspaceNamespaceBindingByNamespace(row.name),
    ])
      .then(([{ payload }, binding]) => {
        setEditingRow(null)
        setCreateName("")
        setCreateDescription("")
        setCreateWorkspace("")
        setWorkspaceBindingExists(false)
        setMetadataEnabled(false)
        setLabelEntries([{ key: "", value: "" }])
        setAnnotationEntries([{ key: "", value: "" }])
        setCreateNameInvalid(false)
        setCreateNameError(null)
        setCreateYamlMode(false)
        setCreateYamlText("")
        setCreateYamlError(null)
        setCreateStep("basic")
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
        const initialLabels = metadataRecordToEntries(
          Object.fromEntries(
            Object.entries(labels).filter(([, value]) => typeof value === "string")
          ) as Record<string, string>
        )
        const initialAnnotations = metadataRecordToEntries(
          Object.fromEntries(
            Object.entries(annotations).filter(([, value]) => typeof value === "string")
          ) as Record<string, string>
        )
        const annotationWorkspace = (annotations[PROJECT_WORKSPACE_ANNOTATION] as string | undefined) ?? ""
        const bindingWorkspace = binding?.workspaceName ?? ""
        const initialWorkspace = bindingWorkspace || annotationWorkspace

        setEditingRow(row)
        setCreateName(row.name)
        setCreateDescription(row.description ?? "")
        setCreateWorkspace(initialWorkspace)
        setCreateWorkspaceInvalid(false)
        setCreateWorkspaceError(null)
        setWorkspaceBindingExists(Boolean(bindingWorkspace))
        setLabelEntries(initialLabels)
        setAnnotationEntries(initialAnnotations)
        setMetadataEnabled(false)
        setCreateNameInvalid(false)
        setCreateNameError(null)
        setCreateYamlMode(false)
        setCreateYamlText("")
        setCreateYamlError(null)
        setCreateStep("basic")
        setCreateDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.loadDetailFailed")
        setError(message)
      })
  }, [t])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteNamespace(pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.deleteFailed")
        setError(message)
        console.error("[Projects] delete request failed", {
          namespace: pendingDeleteRow.name,
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: NamespaceRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteNamespace(row.name))).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : t("projectsDialog.deleteFailed")
      setError(message)
      console.error("[Projects] bulk delete request failed", e)
    })
  }, [t])
  const handlePipelineDeleteSelectedRows = React.useCallback((selectedRows: PipelineProjectRow[]) => {
    if (selectedRows.length === 0) return
    const names = selectedRows
      .map((row) => row.name.trim())
      .filter((name) => name.length > 0 && name !== "-")
    if (names.length === 0) return
    void Promise.all(names.map((name) => deletePipelineProject(name)))
      .then(async () => {
        const items = await fetchPipelineProjectRows()
        setPipelineRows(items)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.deleteFailed")
        setError(message)
        console.error("[Projects] bulk delete pipeline project failed", e)
      })
  }, [t])
  const openPipelineProjectCreateDialog = React.useCallback(() => {
    resetPipelineDialogState()
    setPipelineProjectDialogMode("create")
    setPipelineProjectEditingName(null)
    setPipelineProjectCreateOpen(true)
  }, [resetPipelineDialogState])
  const openPipelineProjectEditDialog = React.useCallback(
    (row: PipelineProjectRow) => {
      const pipelineProjectName = row.name.trim()
      if (!pipelineProjectName || pipelineProjectName === "-") return
      void fetchPipelineProjectDetail(pipelineProjectName)
        .then((detail) => {
          resetPipelineDialogState()
          setPipelineProjectDialogMode("edit")
          setPipelineProjectEditingName(detail.name)
          setPipelineProjectCreateName(detail.name)
          setPipelineProjectCreateDescription(detail.description)
          setPipelineProjectCreateWorkspace(detail.workspace || "")
          const nextLabels = metadataRecordToEntries(detail.labels)
          const nextAnnotations = ensureWorkspaceAnnotationEntries(
            metadataRecordToEntries(detail.annotations),
            detail.workspace || ""
          )
          setPipelineProjectCreateLabelEntries(nextLabels)
          setPipelineProjectCreateAnnotationEntries(nextAnnotations)
        setPipelineProjectCreateMetadataEnabled(false)
          setPipelineProjectCreateNameInvalid(false)
          setPipelineProjectCreateNameError(null)
          setPipelineProjectCreateWorkspaceInvalid(false)
          setPipelineProjectCreateWorkspaceError(null)
          setPipelineProjectCreateYamlError(null)
          setPipelineProjectCreateOpen(true)
        })
        .catch((e: unknown) =>
          setError(e instanceof Error ? e.message : t("projectsDialog.loadPipelineDetailFailed"))
        )
    },
    [resetPipelineDialogState, t]
  )
  const handlePipelineProjectCreateSubmit = React.useCallback(() => {
    if (pipelineProjectCreating) return
    const isPipelineProjectEditMode = pipelineProjectDialogMode === "edit"
    const allPipelineProjectNames = pipelineRows.map((row) => row.name.trim())

    let nextName = pipelineProjectCreateName.trim()
    let nextDescription = pipelineProjectCreateDescription.trim()
    let nextLabels = metadataEntriesToRecord(pipelineProjectCreateLabelEntries)
    let nextAnnotations = metadataEntriesToRecord(pipelineProjectCreateAnnotationEntries)
    let nextWorkspace = pipelineProjectCreateWorkspace.trim()

    if (pipelineProjectCreateYamlMode) {
      try {
        const parsed = parsePipelineProjectYamlText(pipelineProjectCreateYamlText, t)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextLabels = metadataEntriesToRecord(parsed.labels)
        nextAnnotations = metadataEntriesToRecord(parsed.annotations)
        nextWorkspace = parsed.workspaceName.trim() || pipelineProjectCreateWorkspace.trim()
        setPipelineProjectCreateName(nextName)
        setPipelineProjectCreateDescription(nextDescription)
        setPipelineProjectCreateWorkspace(nextWorkspace)
        setPipelineProjectCreateLabelEntries(parsed.labels)
        const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, nextWorkspace)
        setPipelineProjectCreateAnnotationEntries(protectedAnnotations)
        setPipelineProjectCreateMetadataEnabled(false)
        setPipelineProjectCreateYamlError(null)
      } catch (error) {
        setPipelineProjectCreateYamlError(error instanceof Error ? error.message : t("projectsDialog.yamlParseFailed"))
        return
      }
    }

    const validationMessage = validateProjectName(nextName, t)
    if (validationMessage) {
      setPipelineProjectCreateNameInvalid(true)
      setPipelineProjectCreateNameError(validationMessage)
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(validationMessage)
      return
    }

    const nameExists = allPipelineProjectNames.includes(nextName)
    if (!isPipelineProjectEditMode && nameExists) {
      const duplicatedNameMessage = t("projectsDialog.pipelineNameExists")
      setPipelineProjectCreateNameInvalid(true)
      setPipelineProjectCreateNameError(duplicatedNameMessage)
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(duplicatedNameMessage)
      return
    }

    if (isPipelineProjectEditMode && pipelineProjectEditingName && nextName !== pipelineProjectEditingName) {
      const lockedNameError = t("projectsDialog.nameLocked")
      setPipelineProjectCreateNameInvalid(true)
      setPipelineProjectCreateNameError(lockedNameError)
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(lockedNameError)
      return
    }
    if (isPipelineProjectEditMode && pipelineProjectEditingName) {
      const originWorkspace =
        pipelineRows.find((row) => row.name.trim() === pipelineProjectEditingName)?.workspace.trim() || ""
      if (originWorkspace && nextWorkspace !== originWorkspace) {
        const lockedWorkspaceError = t("projectsDialog.workspaceLocked")
        setPipelineProjectCreateWorkspaceInvalid(true)
        setPipelineProjectCreateWorkspaceError(lockedWorkspaceError)
        if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(lockedWorkspaceError)
        return
      }
    }

    if (!nextWorkspace) {
      setPipelineProjectCreateWorkspaceInvalid(true)
      setPipelineProjectCreateWorkspaceError(t("projectsDialog.workspaceRequired"))
      if (pipelineProjectCreateYamlMode) setPipelineProjectCreateYamlError(t("projectsDialog.workspaceRequired"))
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
      [PROJECT_WORKSPACE_ANNOTATION]: nextWorkspace,
    }

    const request = isPipelineProjectEditMode
      ? updatePipelineProject({
          name: pipelineProjectEditingName || nextName,
          workspaceName: nextWorkspace,
          description: nextDescription,
          labels: nextLabels,
          annotations: nextAnnotations,
        })
      : createPipelineProject({
          name: nextName,
          workspaceName: nextWorkspace,
          description: nextDescription,
          labels: nextLabels,
          annotations: nextAnnotations,
        })

    void request
      .then(async () => {
        setPipelineProjectCreateOpen(false)
        resetPipelineDialogState()
        const items = await fetchPipelineProjectRows()
        setPipelineRows(items)
        setError(null)
      })
      .catch((e: unknown) => {
        const message = resolveCreateProjectErrorMessage(e, t)
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
    pipelineProjectCreateAnnotationEntries,
    pipelineProjectCreateDescription,
    pipelineProjectCreateLabelEntries,
    pipelineProjectCreateName,
    pipelineProjectCreateWorkspace,
    pipelineProjectCreateYamlMode,
    pipelineProjectCreateYamlText,
    pipelineProjectCreating,
    pipelineProjectDialogMode,
    pipelineProjectEditingName,
    pipelineRows,
    resetPipelineDialogState,
    t,
  ])
  const handleConfirmPipelineDelete = React.useCallback(() => {
    if (!pendingPipelineDeleteRow || pipelineDeleting) return
    const name = pendingPipelineDeleteRow.name.trim()
    if (!name || name === "-") return
    setPipelineDeleting(true)
    void deletePipelineProject(name)
      .then(async () => {
        setPendingPipelineDeleteRow(null)
        const items = await fetchPipelineProjectRows()
        setPipelineRows(items)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("projectsDialog.deleteFailed")
        setError(message)
      })
      .finally(() => {
        setPipelineDeleting(false)
      })
  }, [pendingPipelineDeleteRow, pipelineDeleting, t])

  const handleCreateSubmit = React.useCallback(
    () => {
      if (creating) return

      let nextName = (editingRow?.name ?? createName).trim()
      let nextDescription = createDescription.trim()
      let nextLabels = metadataEntriesToRecord(labelEntries)
      let nextAnnotations = metadataEntriesToRecord(annotationEntries)
      let nextWorkspace = createWorkspace.trim()

      if (createYamlMode) {
        try {
          const parsed = parseProjectYamlText(createYamlText, t)
          nextName = isEditMode ? (editingRow?.name ?? "").trim() : parsed.name.trim()
          nextDescription = parsed.description.trim()
          nextLabels = metadataEntriesToRecord(parsed.labels)
          nextAnnotations = metadataEntriesToRecord(parsed.annotations)
          nextWorkspace =
            typeof nextAnnotations[PROJECT_WORKSPACE_ANNOTATION] === "string"
              ? nextAnnotations[PROJECT_WORKSPACE_ANNOTATION].trim()
              : ""
          if (!nextWorkspace) {
            nextWorkspace = createWorkspace.trim()
          }
          if (!isEditMode) setCreateName(nextName)
          setCreateDescription(nextDescription)
          setCreateWorkspace(nextWorkspace)
          setLabelEntries(parsed.labels)
          const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, nextWorkspace)
          setAnnotationEntries(protectedAnnotations)
          setMetadataEnabled(false)
          setCreateYamlError(null)
        } catch (error) {
          setCreateYamlError(error instanceof Error ? error.message : t("projectsDialog.yamlParseFailed"))
          return
        }
      }

      const validationMessage = validateProjectName(nextName, t)
      if (validationMessage) {
        setCreateNameInvalid(true)
        setCreateNameError(validationMessage)
        if (createYamlMode) setCreateYamlError(validationMessage)
        return
      }

      setCreateNameInvalid(false)
      setCreateNameError(null)
      const selectedWorkspace = nextWorkspace.trim()
      if (!selectedWorkspace) {
        setCreateWorkspaceInvalid(true)
        setCreateWorkspaceError(t("projectsDialog.workspaceRequired"))
        if (createYamlMode) setCreateYamlError(t("projectsDialog.workspaceRequired"))
        return
      }
      const existsInOptions = workspaceOptions.some((option) => option.id === selectedWorkspace)
      if (!existsInOptions) {
        setCreateWorkspaceInvalid(true)
        setCreateWorkspaceError(t("projectsDialog.workspaceInvalid"))
        if (createYamlMode) setCreateYamlError(t("projectsDialog.workspaceInvalid"))
        return
      }
      setCreateWorkspaceInvalid(false)
      setCreateWorkspaceError(null)
      setCreateYamlError(null)
      setCreating(true)
      if (!nextWorkspace) {
        nextWorkspace = createWorkspace.trim()
      }
      if (nextWorkspace) nextAnnotations[PROJECT_WORKSPACE_ANNOTATION] = nextWorkspace
      else delete nextAnnotations[PROJECT_WORKSPACE_ANNOTATION]

      const requestPayload: CreateNamespaceInput = {
        name: nextName,
        description: nextDescription,
        labels: nextLabels,
        annotations: nextAnnotations,
      }
      const request = async () => {
        if (isEditMode) {
          await updateNamespace(requestPayload)
        } else {
          await createNamespace(requestPayload)
        }

        if (isEditMode && !workspaceBindingExists && nextWorkspace) {
          const namespaceName = (editingRow?.name ?? nextName).trim()
          if (namespaceName) {
            await createWorkspaceNamespaceBinding({
              namespaceName,
              workspaceName: nextWorkspace,
            })
          }
        }
      }

      void request()
      .then(async () => {
          setCreateDialogOpen(false)
          const namespaceRows = await fetchNamespaces()
          const items = await mergeRowsWithWorkspaceBindings(namespaceRows)
          setRows(items)
          setError(null)
        })
        .catch((e: unknown) => {
          const message = resolveCreateProjectErrorMessage(e, t)
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
    },
    [
      annotationEntries,
      createDescription,
      createName,
      createWorkspace,
      createYamlMode,
      createYamlText,
      creating,
      editingRow,
      isEditMode,
      labelEntries,
      workspaceOptions,
      workspaceBindingExists,
      mergeRowsWithWorkspaceBindings,
      t,
    ]
  )

  const enterCreateYamlMode = React.useCallback(() => {
    const annotationsForYaml = metadataEntriesToRecord(annotationEntries)
    const workspaceValue = createWorkspace.trim()
    if (workspaceValue) {
      annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION] = workspaceValue
    } else {
      delete annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION]
    }
    setCreateYamlText(
      buildProjectYamlText({
        name: editingRow?.name ?? createName,
        description: createDescription,
        labels: labelEntries,
        annotations: metadataRecordToEntries(annotationsForYaml),
      })
    )
    setCreateYamlError(null)
    setCreateYamlMode(true)
  }, [annotationEntries, createDescription, createName, createWorkspace, editingRow?.name, labelEntries])

  const cancelCreateYamlMode = React.useCallback(() => {
    setCreateYamlError(null)
    setCreateYamlMode(false)
  }, [])

  const confirmCreateYamlMode = React.useCallback(() => {
    try {
      const parsed = parseProjectYamlText(createYamlText, t)
      if (!isEditMode) {
        setCreateName(parsed.name)
      }
      setCreateDescription(parsed.description)
      const parsedWorkspace =
        parsed.annotations.find((entry) => entry.key === PROJECT_WORKSPACE_ANNOTATION)?.value ?? ""
      const nextWorkspace = parsedWorkspace.trim() || createWorkspace.trim()
      setCreateWorkspace(nextWorkspace)
      setLabelEntries(parsed.labels)
      const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, nextWorkspace)
      setAnnotationEntries(protectedAnnotations)
      setMetadataEnabled(false)
      setCreateYamlError(null)
      setCreateYamlMode(false)
    } catch (error) {
      setCreateYamlError(error instanceof Error ? error.message : t("projectsDialog.yamlParseFailed"))
    }
  }, [createWorkspace, createYamlText, isEditMode, t])

  const enterPipelineProjectCreateYamlMode = React.useCallback(() => {
    const annotationsForYaml = metadataEntriesToRecord(pipelineProjectCreateAnnotationEntries)
    const workspaceValue = pipelineProjectCreateWorkspace.trim()
    if (workspaceValue) {
      annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION] = workspaceValue
    } else {
      delete annotationsForYaml[PROJECT_WORKSPACE_ANNOTATION]
    }
    setPipelineProjectCreateYamlText(
      buildPipelineProjectYamlText({
        name: pipelineProjectCreateName,
        description: pipelineProjectCreateDescription,
        workspaceName: pipelineProjectCreateWorkspace,
        labels: pipelineProjectCreateLabelEntries,
        annotations: metadataRecordToEntries(annotationsForYaml),
      })
    )
    setPipelineProjectCreateYamlError(null)
    setPipelineProjectCreateYamlMode(true)
  }, [
    pipelineProjectCreateAnnotationEntries,
    pipelineProjectCreateDescription,
    pipelineProjectCreateLabelEntries,
    pipelineProjectCreateName,
    pipelineProjectCreateWorkspace,
  ])

  const cancelPipelineProjectCreateYamlMode = React.useCallback(() => {
    setPipelineProjectCreateYamlError(null)
    setPipelineProjectCreateYamlMode(false)
  }, [])

  const confirmPipelineProjectCreateYamlMode = React.useCallback(() => {
    try {
      const parsed = parsePipelineProjectYamlText(pipelineProjectCreateYamlText, t)
      setPipelineProjectCreateName(parsed.name)
      setPipelineProjectCreateDescription(parsed.description)
      const nextWorkspace = parsed.workspaceName.trim() || pipelineProjectCreateWorkspace.trim()
      setPipelineProjectCreateWorkspace(nextWorkspace)
      setPipelineProjectCreateLabelEntries(parsed.labels)
      const protectedAnnotations = ensureWorkspaceAnnotationEntries(parsed.annotations, nextWorkspace)
      setPipelineProjectCreateAnnotationEntries(protectedAnnotations)
      setPipelineProjectCreateMetadataEnabled(false)
      setPipelineProjectCreateYamlError(null)
      setPipelineProjectCreateYamlMode(false)
    } catch (error) {
      setPipelineProjectCreateYamlError(error instanceof Error ? error.message : t("projectsDialog.yamlParseFailed"))
    }
  }, [pipelineProjectCreateWorkspace, pipelineProjectCreateYamlText, t])

  const projectTableColumns = React.useMemo(
    () =>
      createColumns<NamespaceRow>({
        columns: getProjectColumns(t),
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("projectsDialog.viewYaml")}
              </>
            ),
            onSelect: (row) => {
              handleViewYaml(row)
            },
          },
          {
            label: (
              <>
                <IconInfoCircle className="size-4" />
                {t("projectsDialog.viewDetails")}
              </>
            ),
            onSelect: (row) => {
              handleViewDescribe(row)
            },
          },
          {
            label: (
              <>
                <IconPencil className="size-4" />
                {t("projectsDialog.edit")}
              </>
            ),
            onSelect: (row) => {
              requestEdit(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("projectsDialog.delete")}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              requestDelete(row)
            },
          },
        ],
      }),
    [handleViewDescribe, handleViewYaml, requestDelete, requestEdit, t]
  )

  const pipelineTableColumns = React.useMemo(
    () =>
      createColumns<PipelineProjectRow>({
        columns: getPipelineProjectColumns(t),
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("projectsDialog.viewYaml")}
              </>
            ),
            onSelect: (row) => {
              handleViewPipelineYaml(row)
            },
          },
          {
            label: (
              <>
                <IconPencil className="size-4" />
                {t("projectsDialog.edit")}
              </>
            ),
            onSelect: (row) => {
              openPipelineProjectEditDialog(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("projectsDialog.delete")}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              setPendingPipelineDeleteRow(row)
            },
          },
        ],
      }),
    [handleViewPipelineYaml, openPipelineProjectEditDialog, t]
  )

  // 提取成 useCallback，避免频繁重新创建导致的死循环
  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [namespaceRows, pipelineProjectItems] = await Promise.all([
        fetchNamespaces(),
        fetchPipelineProjectRows(),
      ])
      const items = await mergeRowsWithWorkspaceBindings(namespaceRows)
      setRows(items)
      setPipelineRows(pipelineProjectItems)
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setPipelineRows([])
        const message = e instanceof Error ? e.message : "API request failed"
        setError(message)
      } else {
        console.error("[Projects] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [mergeRowsWithWorkspaceBindings])

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (cancelled) return
      await refreshRows(silent)
    }

    void loadRows(false)
    void fetchWorkspaceRows(500)
      .then((items) => {
        if (cancelled) return
        setWorkspaceOptions(
          items.map((item) => ({
            id: item.name,
            name: item.name,
          }))
        )
      })
      .catch((e: unknown) => {
        if (cancelled) return
        console.error("[Projects] load workspace options failed", e)
      })
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [refreshRows])

  const query = nameQuery.trim().toLowerCase()
  const selectedWorkspace = workspaceQuery.trim()
  const activeRows = activeTab === "projects" ? rows : pipelineRows
  const workspaceFilterOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          activeRows
            .map((row) => row.workspace.trim())
            .filter((workspace) => workspace.length > 0 && workspace !== "-")
        )
      )
        .sort((a, b) => a.localeCompare(b, "zh-CN"))
        .map((workspace) => ({ id: workspace, name: workspace })),
    [activeRows]
  )
  const filteredProjectRows = rows.filter((row) => {
    const matchesWorkspace =
      !selectedWorkspace || row.workspace.trim().toLowerCase() === selectedWorkspace.toLowerCase()
    const matchesName = !query || row.name.toLowerCase().includes(query)
    return matchesWorkspace && matchesName
  })
  const filteredPipelineRows = pipelineRows.filter((row) => {
    const matchesWorkspace =
      !selectedWorkspace || row.workspace.trim().toLowerCase() === selectedWorkspace.toLowerCase()
    const matchesName = !query || row.name.toLowerCase().includes(query)
    return matchesWorkspace && matchesName
  })

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("projectsDialog.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const projectFilters = (
    <>
      <FilterCombobox
        options={workspaceFilterOptions}
        value={workspaceQuery}
        onValueChange={setWorkspaceQuery}
        placeholder={t("projectsDialog.workspaceFilterPlaceholder")}
        emptyText={t("projectsDialog.workspaceFilterEmpty")}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={t("projectsDialog.nameFilterPlaceholder")}
        className="h-9 w-40"
      />
    </>
  )

  const projectTabs = (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ProjectTab)} className="w-fit">
      <TabsList>
        <TabsTrigger value="projects">{t("projectsDialog.projectsTab")}</TabsTrigger>
        <TabsTrigger value="pipelineProjects">{t("projectsDialog.pipelineProjectsTab")}</TabsTrigger>
      </TabsList>
    </Tabs>
  )
  const isPipelineProjectEditMode = pipelineProjectDialogMode === "edit"

  return (
    <>
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateDialogOpen(open)
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
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">{t("projectsDialog.yamlMode")}</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (creating) return
                      if (checked) {
                        enterCreateYamlMode()
                        return
                      }
                      cancelCreateYamlMode()
                    }}
                    disabled={creating}
                    aria-label={t("projectsDialog.yamlMode")}
                  />
                </div>
              </div>
            </div>

            {!createYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: t("projectsDialog.basicInfo"),
                    status: createStep === "basic" ? t("projectsDialog.current") : t("projectsDialog.configured"),
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
                    title: t("projectsDialog.advancedSettings"),
                    status:
                      createStep === "advanced"
                        ? t("projectsDialog.current")
                        : hasUserProvidedMetadata(labelEntries, annotationEntries)
                          ? t("projectsDialog.configured")
                          : t("projectsDialog.notConfigured"),
                    active: createStep === "advanced",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => {
                      if (creating) return
                      if (createStep === "basic") {
                        void handleCreateNextStep()
                        return
                      }
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
                    <h3 className="text-[15px] font-semibold">{t("projectsDialog.basicInfo")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("projectsDialog.basicInfoDesc")}
                    </p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field data-invalid={createNameInvalid}>
                        <FieldLabel htmlFor="project-create-name">{t("projectsDialog.name")}</FieldLabel>
                        <Input
                          id="project-create-name"
                          name="name"
                          value={editingRow?.name ?? createName}
                          onChange={(event) => {
                            if (isEditMode) return
                            setCreateName(event.target.value)
                            if (createNameInvalid) setCreateNameInvalid(false)
                            if (createNameError) setCreateNameError(null)
                          }}
                          placeholder={t("projectsDialog.namePlaceholder")}
                          autoComplete="off"
                          aria-invalid={createNameInvalid}
                          disabled={creating || isEditMode}
                        />
                        {createNameError ? (
                          <FieldError>{createNameError}</FieldError>
                        ) : (
                          <FieldDescription>{t("projectsDialog.nameRule")}</FieldDescription>
                        )}
                      </Field>

                      <Field data-invalid={createWorkspaceInvalid}>
                        <FieldLabel htmlFor="project-create-workspace">{t("projectsDialog.workspace")}</FieldLabel>
                        <FilterCombobox
                          options={workspaceOptions}
                          value={createWorkspace}
                          onValueChange={(value) => {
                            setCreateWorkspace(value)
                            setAnnotationEntries((prev) => {
                              const ensured = ensureWorkspaceAnnotationEntries(prev, value)
                              return areMetadataEntriesEqual(prev, ensured) ? prev : ensured
                            })
                            if (createWorkspaceInvalid) setCreateWorkspaceInvalid(false)
                            if (createWorkspaceError) setCreateWorkspaceError(null)
                          }}
                          placeholder={t("projectsDialog.workspacePlaceholder")}
                          emptyText={t("projectsDialog.workspaceFilterEmpty")}
                          className="h-10"
                          ariaInvalid={createWorkspaceInvalid}
                          disabled={creating || (isEditMode && workspaceBindingExists)}
                        />
                        {createWorkspaceError ? (
                          <FieldError>{createWorkspaceError}</FieldError>
                        ) : (
                          <FieldDescription>
                            {isEditMode && workspaceBindingExists
                              ? t("projectsDialog.workspaceLocked")
                              : t("projectsDialog.workspaceRequiredDesc", { annotation: PROJECT_WORKSPACE_ANNOTATION })}
                          </FieldDescription>
                        )}
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel htmlFor="project-create-description">
                        {t("projectsDialog.description")}
                      </FieldLabel>
                      <Textarea
                        id="project-create-description"
                        name="description"
                        value={createDescription}
                        onChange={(event) => setCreateDescription(event.target.value)}
                        placeholder={t("projectsDialog.descriptionPlaceholder")}
                        maxLength={256}
                        className="min-h-28"
                        disabled={creating}
                      />
                      <FieldDescription>
                        {t("projectsDialog.descriptionRule")}
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">{t("projectsDialog.advancedSettings")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("projectsDialog.advancedSettingsDesc")}
                    </p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field>
                      <ResourceMetadataEditor
                        checked={metadataEnabled}
                        onCheckedChange={setMetadataEnabled}
                        labels={labelEntries}
                        setLabels={setLabelEntries}
                        annotations={annotationEntries}
                        setAnnotations={(next) => {
                          setAnnotationEntries((prev) => {
                            const resolved = typeof next === "function" ? next(prev) : next
                            const ensured = ensureWorkspaceAnnotationEntries(resolved, createWorkspace)
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
                <div className="flex w-full items-center justify-between gap-3">
                  <Button type="button" variant="outline" disabled={creating} onClick={cancelCreateYamlMode}>
                    {t("projectsDialog.cancel")}
                  </Button>
                  <Button type="button" onClick={confirmCreateYamlMode} disabled={creating}>
                    {t("projectsDialog.confirmSave")}
                  </Button>
                </div>
              ) : createStep === "basic" ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating}>
                      {t("projectsDialog.cancel")}
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    disabled={creating}
                    onClick={() => {
                      const nextName = (editingRow?.name ?? createName).trim()
                      const nameValidationMessage = validateProjectName(nextName, t)
                      if (nameValidationMessage) {
                        setCreateNameInvalid(true)
                        setCreateNameError(nameValidationMessage)
                        return
                      }

                      if (!isEditMode) {
                        const nameExists = rows.some((row) => row.name === nextName)
                        if (nameExists) {
                          setCreateNameInvalid(true)
                          setCreateNameError(t("projectsDialog.nameExists"))
                          return
                        }
                      }

                      setCreateNameInvalid(false)
                      setCreateNameError(null)

                      if (!workspaceBindingExists) {
                        const selectedWorkspace = createWorkspace.trim()
                        if (!selectedWorkspace) {
                          setCreateWorkspaceInvalid(true)
                          setCreateWorkspaceError(t("projectsDialog.workspaceRequired"))
                          return
                        }
                        const existsInOptions = workspaceOptions.some((option) => option.id === selectedWorkspace)
                        if (!existsInOptions) {
                          setCreateWorkspaceInvalid(true)
                          setCreateWorkspaceError(t("projectsDialog.workspaceInvalid"))
                          return
                        }
                      }
                      setCreateWorkspaceInvalid(false)
                      setCreateWorkspaceError(null)
                      setCreateStep("advanced")
                    }}
                  >
                    {t("projectsDialog.nextStep")}
                  </Button>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateStep("basic")}>
                    {t("projectsDialog.previousStep")}
                  </Button>
                  <Button type="button" onClick={() => handleCreateSubmit()} disabled={creating}>
                    {creating ? (isEditMode ? t("projectsDialog.saving") : t("projectsDialog.creating")) : isEditMode ? t("projectsDialog.save") : t("projectsDialog.create")}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <DescribeViewerDialog
        title={t("projectsDialog.viewDetails")}
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <MonacoViewerDialog
        title={t("projectsDialog.viewYaml")}
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
        title={t("projectsDialog.deleteTitle")}
        description={
          pendingDeleteRow
            ? t("projectsDialog.deleteDesc", { name: pendingDeleteRow.name })
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingPipelineDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !pipelineDeleting) setPendingPipelineDeleteRow(null)
        }}
        title={t("projectsDialog.deletePipelineTitle")}
        description={
          pendingPipelineDeleteRow
            ? t("projectsDialog.deletePipelineDesc", { name: pendingPipelineDeleteRow.name })
            : ""
        }
        deleting={pipelineDeleting}
        onConfirm={handleConfirmPipelineDelete}
      />
      <Dialog
        open={pipelineProjectCreateOpen}
        onOpenChange={(open) => {
          if (!open && pipelineProjectCreating) return;
          setPipelineProjectCreateOpen(open);
          if (!open) resetPipelineDialogState();
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
                <DialogTitle>{isPipelineProjectEditMode ? t("projectsDialog.editPipelineTitle") : t("projectsDialog.createPipelineTitle")}</DialogTitle>
                <DialogDescription>
                  {isPipelineProjectEditMode ? t("projectsDialog.editPipelineDesc") : t("projectsDialog.createPipelineDesc")}</DialogDescription>
                </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">{t("projectsDialog.yamlMode")}</span>
                  <Switch
                    checked={pipelineProjectCreateYamlMode}
                    onCheckedChange={(checked) => {
                      if (pipelineProjectCreating) return
                      if (checked) {
                        enterPipelineProjectCreateYamlMode()
                        return
                      }
                      cancelPipelineProjectCreateYamlMode()
                    }}
                    disabled={pipelineProjectCreating}
                    aria-label={t("projectsDialog.yamlMode")}
                  />
                </div>
              </div>
            </div>

            {!pipelineProjectCreateYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: t("projectsDialog.basicInfo"),
                    status: pipelineProjectCreateStep === "basic" ? t("projectsDialog.current") : t("projectsDialog.configured"),
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
                    title: t("projectsDialog.advancedSettings"),
                    status:
                      pipelineProjectCreateStep === "advanced"
                        ? t("projectsDialog.current")
                        : hasUserProvidedMetadata(
                            pipelineProjectCreateLabelEntries,
                            pipelineProjectCreateAnnotationEntries
                          )
                          ? t("projectsDialog.configured")
                          : t("projectsDialog.notConfigured"),
                    active: pipelineProjectCreateStep === "advanced",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: pipelineProjectCreating,
                    onClick: () => {
                      if (pipelineProjectCreating) return
                      if (pipelineProjectCreateStep === "advanced") return
                      if (pipelineProjectCreateStep === "basic") {
                        const nextName = pipelineProjectCreateName.trim()
                        const validationMessage = validateProjectName(nextName, t)
                        setPipelineProjectCreateNameInvalid(Boolean(validationMessage))
                        setPipelineProjectCreateNameError(validationMessage)

                        const allPipelineProjectNames = pipelineRows.map((row) => row.name.trim())
                        const nameExists = allPipelineProjectNames.includes(nextName)
                        const duplicateError = !isPipelineProjectEditMode && nameExists ? t("projectsDialog.pipelineNameExists") : null
                        if (duplicateError) {
                          setPipelineProjectCreateNameInvalid(true)
                          setPipelineProjectCreateNameError(duplicateError)
                        }

                        const selectedWorkspace = pipelineProjectCreateWorkspace.trim()
                        const workspaceError = !selectedWorkspace ? t("projectsDialog.workspaceRequired") : null
                        setPipelineProjectCreateWorkspaceInvalid(Boolean(workspaceError))
                        setPipelineProjectCreateWorkspaceError(workspaceError)

                        if (validationMessage || duplicateError || workspaceError) {
                          return
                        }

                        setPipelineProjectCreateStep("advanced")
                        return
                      }
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
                    <h3 className="text-[15px] font-semibold">{t("projectsDialog.basicInfo")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("projectsDialog.basicPipelineInfoDesc")}</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field data-invalid={pipelineProjectCreateNameInvalid}>
                        <FieldLabel htmlFor="project-pipeline-project-create-name">{t("projectsDialog.name")}</FieldLabel>
                        <Input
                          id="project-pipeline-project-create-name"
                          value={pipelineProjectCreateName}
                          onChange={(event) => {
                            setPipelineProjectCreateName(event.target.value)
                            if (pipelineProjectCreateNameInvalid) setPipelineProjectCreateNameInvalid(false)
                            if (pipelineProjectCreateNameError) setPipelineProjectCreateNameError(null)
                          }}
                          placeholder={t("projectsDialog.namePlaceholder")}
                          autoComplete="off"
                          aria-invalid={pipelineProjectCreateNameInvalid}
                          disabled={pipelineProjectCreating || isPipelineProjectEditMode}
                        />
                        {pipelineProjectCreateNameError ? (
                          <FieldError>{pipelineProjectCreateNameError}</FieldError>
                        ) : (
                          <FieldDescription>{t("projectsDialog.nameRule")}</FieldDescription>
                        )}
                      </Field>
                      <Field data-invalid={pipelineProjectCreateWorkspaceInvalid}>
                        <FieldLabel htmlFor="project-pipeline-project-create-workspace">{t("projectsDialog.workspace")}</FieldLabel>
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
                          placeholder={t("projectsDialog.workspacePlaceholder")}
                          emptyText={t("projectsDialog.workspaceFilterEmpty")}
                          className="h-10"
                          ariaInvalid={pipelineProjectCreateWorkspaceInvalid}
                          disabled={pipelineProjectCreating || isPipelineProjectEditMode}
                        />
                        {pipelineProjectCreateWorkspaceError ? (
                          <FieldError>{pipelineProjectCreateWorkspaceError}</FieldError>
                        ) : (
                          <FieldDescription>
                            {isPipelineProjectEditMode
                              ? t("projectsDialog.pipelineWorkspaceLocked", { workspace: pipelineProjectCreateWorkspace || "-" })
                              : t("projectsDialog.workspaceRequired")}
                          </FieldDescription>
                        )}
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="project-pipeline-project-create-description">{t("projectsDialog.description")}</FieldLabel>
                      <Textarea
                        id="project-pipeline-project-create-description"
                        value={pipelineProjectCreateDescription}
                        onChange={(event) => setPipelineProjectCreateDescription(event.target.value)}
                        placeholder={t("projectsDialog.descriptionPlaceholder")}
                        maxLength={256}
                        className="min-h-28"
                        disabled={pipelineProjectCreating}
                      />
                      <FieldDescription>{t("projectsDialog.descriptionRule")}</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">{t("projectsDialog.advancedSettings")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("projectsDialog.advancedSettingsDesc")}</p>
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
                            const ensured = ensureWorkspaceAnnotationEntries(
                              resolved,
                              pipelineProjectCreateWorkspace
                            )
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
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pipelineProjectCreating}
                    onClick={cancelPipelineProjectCreateYamlMode}
                  >
                    {t("projectsDialog.cancel")}
                  </Button>
                  <Button
                    type="button"
                    onClick={confirmPipelineProjectCreateYamlMode}
                    disabled={pipelineProjectCreating}
                  >
                    {t("projectsDialog.confirmSave")}
                  </Button>
                </div>
              ) : pipelineProjectCreateStep === "basic" ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pipelineProjectCreating}
                    onClick={() => setPipelineProjectCreateOpen(false)}
                  >
                    {t("projectsDialog.cancel")}
                  </Button>
                  <Button
                    type="button"
                    disabled={pipelineProjectCreating}
                    onClick={() => {
                      const nextName = pipelineProjectCreateName.trim()
                      const validationMessage = validateProjectName(nextName, t)
                      setPipelineProjectCreateNameInvalid(Boolean(validationMessage))
                      setPipelineProjectCreateNameError(validationMessage)

                      const allPipelineProjectNames = pipelineRows.map((row) => row.name.trim())
                      const nameExists = allPipelineProjectNames.includes(nextName)
                      const duplicateError = !isPipelineProjectEditMode && nameExists ? t("projectsDialog.pipelineNameExists") : null
                      if (duplicateError) {
                        setPipelineProjectCreateNameInvalid(true)
                        setPipelineProjectCreateNameError(duplicateError)
                      }

                      const selectedWorkspace = pipelineProjectCreateWorkspace.trim()
                      const workspaceError = !selectedWorkspace ? t("projectsDialog.workspaceRequired") : null
                      setPipelineProjectCreateWorkspaceInvalid(Boolean(workspaceError))
                      setPipelineProjectCreateWorkspaceError(workspaceError)

                      if (validationMessage || duplicateError || workspaceError) {
                        return
                      }

                      setPipelineProjectCreateStep("advanced")
                    }}
                  >
                    {t("projectsDialog.nextStep")}
                  </Button>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pipelineProjectCreating}
                    onClick={() => setPipelineProjectCreateStep("basic")}
                  >
                    {t("projectsDialog.previousStep")}
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePipelineProjectCreateSubmit}
                    disabled={pipelineProjectCreating}
                  >
                    {pipelineProjectCreating
                      ? isPipelineProjectEditMode
                        ? t("projectsDialog.saving")
                        : t("projectsDialog.creating")
                      : isPipelineProjectEditMode
                        ? t("projectsDialog.save")
                        : t("projectsDialog.create")}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      {activeTab === "projects" ? (
        <DataTable
          data={filteredProjectRows}
          columns={projectTableColumns}
          enableRowNavigation
          getRowHref={(row) => `/dashboard/projects/namespaces/${encodeURIComponent(row.name)}`}
          onCreate={() => {
            resetCreateDialogState()
            setCreateDialogOpen(true)
          }}
          toolbarStart={projectTabs}
          toolbarEnd={projectFilters}
          onDeleteSelectedRows={handleDeleteSelectedRows}
        />
      ) : (
        <DataTable
          data={filteredPipelineRows}
          columns={pipelineTableColumns}
          enableRowNavigation
          getRowHref={(row) => `/dashboard/projects/devops/${encodeURIComponent(row.name)}`}
          onCreate={openPipelineProjectCreateDialog}
          toolbarStart={projectTabs}
          toolbarEnd={projectFilters}
          onDeleteSelectedRows={handlePipelineDeleteSelectedRows}
        />
      )}
    </>
  )
}
