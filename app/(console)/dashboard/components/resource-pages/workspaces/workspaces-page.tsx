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
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  createWorkspace,
  deleteWorkspace,
  fetchWorkspaceDetail,
  fetchWorkspaceRows,
  fetchWorkspaceYaml,
  updateWorkspace,
  type WorkspaceRow,
} from "@/app/lib/kubespark/workspaces"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { useTranslations } from "@/app/lib/i18n"
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"

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

type WorkspaceDialogStep = "basic" | "advanced"

type WorkspaceDialogMode = "create" | "edit"

function getWorkspaceColumns(t: (key: string) => string): ColumnConfig<WorkspaceRow>[] {
  return [
    {
      key: "name",
      label: t("workspacesDialog.tableColumns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "owner", label: t("workspacesDialog.tableColumns.owner") },
    { key: "age", label: t("workspacesDialog.tableColumns.age") },
    { key: "updatedAt", label: t("workspacesDialog.tableColumns.updatedAt") },
  ]
}

function validateWorkspaceName(name: string, t: (key: string) => string): string | null {
  if (!name) return t("workspacesDialog.nameRequired")
  if (name.length > 63) return t("workspacesDialog.nameRule")
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) return t("workspacesDialog.nameRule")
  return null
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => typeof v === "string")
      .map(([k, v]) => [k, String(v)])
  ) as Record<string, string>
}

function buildWorkspaceYamlText(params: {
  name: string
  description: string
  owner: string
  metadataEnabled: boolean
  labelEntries: MetadataEntry[]
  annotationEntries: MetadataEntry[]
}): string {
  const labels = params.metadataEnabled ? metadataEntriesToRecord(params.labelEntries) : {}
  const annotations = params.metadataEnabled ? metadataEntriesToRecord(params.annotationEntries) : {}
  const description = params.description.trim()

  if (description) annotations.description = description
  else delete annotations.description

  return stringify(
    {
      apiVersion: "tanqidi.com/v1alpha1",
      kind: "Workspace",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
      spec: {
        owner: params.owner.trim(),
      },
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parseWorkspaceYamlText(yamlText: string, t: (key: string) => string): {
  name: string
  description: string
  owner: string
  metadataEnabled: boolean
  labelEntries: MetadataEntry[]
  annotationEntries: MetadataEntry[]
} {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error(t("workspacesDialog.yamlRequired"))

  const parsed = parse(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error(t("workspacesDialog.yamlInvalid"))

  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "Workspace") throw new Error(t("workspacesDialog.yamlKindMustBeWorkspace"))

  const metadata =
    typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}

  const labelRecord = parseStringRecord(metadata.labels)
  const annotationRecord = parseStringRecord(metadata.annotations)
  const labelEntries = metadataRecordToEntries(labelRecord)
  const annotationEntries = metadataRecordToEntries(annotationRecord)

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    description: typeof annotationRecord.description === "string" ? annotationRecord.description : "",
    owner: typeof spec.owner === "string" ? spec.owner : "",
    metadataEnabled: false,
    labelEntries,
    annotationEntries,
  }
}

export function WorkspacesPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<WorkspaceRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createStep, setCreateStep] = React.useState<WorkspaceDialogStep>("basic")
  const [dialogMode, setDialogMode] = React.useState<WorkspaceDialogMode>("create")
  const [editingName, setEditingName] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [loadingEditData, setLoadingEditData] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")

  const [workspaceName, setWorkspaceName] = React.useState("")
  const [workspaceDescription, setWorkspaceDescription] = React.useState("")
  const [workspaceOwner, setWorkspaceOwner] = React.useState("")
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])

  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createOwnerError, setCreateOwnerError] = React.useState<string | null>(null)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)

  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<WorkspaceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const loadRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setError(null)
    }

    try {
      const data = await fetchWorkspaceRows()
      setRows(data)
      if (!silent) setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : t("workspacesDialog.loadFailed"))
      }
    }
  }, [t])

  React.useEffect(() => {
    void loadRows(false)
  }, [loadRows])

  useIntervalRefresh(() => loadRows(true), 3000)

  const resetCreateState = React.useCallback(() => {
    setDialogMode("create")
    setEditingName(null)
    setWorkspaceName("")
    setWorkspaceDescription("")
    setWorkspaceOwner("")
    setMetadataEnabled(false)
    setLabelEntries([{ key: "", value: "" }])
    setAnnotationEntries([{ key: "", value: "" }])
    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCreateOwnerError(null)
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateStep("basic")
    setSubmitError(null)
    setLoadingEditData(false)
    setSubmitting(false)
  }, [])

  const openCreateDialog = React.useCallback(() => {
    resetCreateState()
    setDialogMode("create")
    setCreateDialogOpen(true)
  }, [resetCreateState])

  const openEditDialog = React.useCallback(async (row: WorkspaceRow) => {
    resetCreateState()
    setDialogMode("edit")
    setEditingName(row.name)
    setLoadingEditData(true)
    setCreateDialogOpen(true)

    try {
      const detail = await fetchWorkspaceDetail(row.name)
      setWorkspaceName(detail.name)
      setWorkspaceOwner(detail.owner)
      setWorkspaceDescription(detail.description)

      const labels = metadataRecordToEntries(detail.labels)
      const annotations = metadataRecordToEntries(detail.annotations)
      setLabelEntries(labels)
      setAnnotationEntries(annotations)
      setMetadataEnabled(false)
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : t("workspacesDialog.loadDetailFailed"))
    } finally {
      setLoadingEditData(false)
    }
  }, [resetCreateState, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: WorkspaceRow[]) => {
    if (selectedRows.length === 0) return
    setDeleting(true)

    void Promise.all(selectedRows.map((row) => deleteWorkspace(row.name)))
      .then(async () => {
        await loadRows(false)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("workspacesDialog.deleteFailed")
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [loadRows, t])

  const handleViewYaml = React.useCallback((row: WorkspaceRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("workspacesDialog.yamlSubtitleWithName", { name: row.name }))

    void fetchWorkspaceYaml(row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Workspaces] view yaml response", {
          workspace: { name: row.name },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("workspacesDialog.loadYamlFailed")
        setYamlError(message)
        console.error("[Workspaces] view yaml request failed", {
          workspace: { name: row.name },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteWorkspace(pendingDeleteRow.name)
      .then(async () => {
        setPendingDeleteRow(null)
        await loadRows(false)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("workspacesDialog.deleteFailed")
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, loadRows, pendingDeleteRow, t])

  const columns = React.useMemo(
    () =>
      createColumns<WorkspaceRow>({
        columns: getWorkspaceColumns(t),
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("workspacesDialog.viewYaml")}
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
                {t("workspacesDialog.edit")}
              </>
            ),
            onSelect: (row) => {
              void openEditDialog(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("workspacesDialog.delete")}
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
    [handleViewYaml, openEditDialog, t]
  )

  const isEditMode = dialogMode === "edit"

  const handleNextStep = React.useCallback(() => {
    if (submitting || loadingEditData) return

    const nameError = validateWorkspaceName(workspaceName.trim(), t)
    setCreateNameInvalid(Boolean(nameError))
    setCreateNameError(nameError)

    const ownerError = workspaceOwner.trim() ? null : t("workspacesDialog.ownerRequired")
    setCreateOwnerError(ownerError)

    if (nameError || ownerError) return
    setCreateStep("advanced")
  }, [loadingEditData, submitting, workspaceName, workspaceOwner, t])

  const handleCreateSubmit = React.useCallback(() => {
    if (submitting || loadingEditData) return

    let nextName = workspaceName.trim()
    let nextDescription = workspaceDescription.trim()
    let nextOwner = workspaceOwner.trim()
    let nextMetadataEnabled = metadataEnabled
    let nextLabelEntries = labelEntries
    let nextAnnotationEntries = annotationEntries

    if (createYamlMode) {
      try {
        const parsed = parseWorkspaceYamlText(createYamlText, t)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextOwner = parsed.owner.trim()
        nextMetadataEnabled = false
        nextLabelEntries = parsed.labelEntries
        nextAnnotationEntries = parsed.annotationEntries

        setWorkspaceName(nextName)
        setWorkspaceDescription(nextDescription)
        setWorkspaceOwner(nextOwner)
        setMetadataEnabled(nextMetadataEnabled)
        setLabelEntries(nextLabelEntries)
        setAnnotationEntries(nextAnnotationEntries)
        setCreateYamlError(null)
      } catch (error) {
        setCreateYamlError(error instanceof Error ? error.message : t("workspacesDialog.yamlParseFailed"))
        return
      }
    }

    setSubmitError(null)

    const nameError = validateWorkspaceName(nextName, t)
    setCreateNameInvalid(Boolean(nameError))
    setCreateNameError(nameError)
    if (nameError) {
      if (createYamlMode) setCreateYamlError(nameError)
      return
    }

    const ownerError = nextOwner ? null : t("workspacesDialog.ownerRequired")
    setCreateOwnerError(ownerError)
    if (ownerError) {
      if (createYamlMode) setCreateYamlError(ownerError)
      return
    }

    if (isEditMode && editingName && nextName !== editingName) {
      const lockedNameError = t("workspacesDialog.nameLocked")
      setCreateNameInvalid(true)
      setCreateNameError(lockedNameError)
      if (createYamlMode) setCreateYamlError(lockedNameError)
      return
    }

    const labels = nextMetadataEnabled ? metadataEntriesToRecord(nextLabelEntries) : {}
    const annotations = nextMetadataEnabled ? metadataEntriesToRecord(nextAnnotationEntries) : {}

    setSubmitting(true)

    const request = isEditMode && editingName
      ? updateWorkspace(editingName, {
          name: editingName,
          owner: nextOwner,
          description: nextDescription,
          labels,
          annotations,
        })
      : createWorkspace({
          name: nextName,
          owner: nextOwner,
          description: nextDescription,
          labels,
          annotations,
        })

    void request
      .then(async () => {
        setCreateDialogOpen(false)
        resetCreateState()
        await loadRows(false)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : isEditMode ? t("workspacesDialog.saveFailed") : t("workspacesDialog.createFailed")
        setSubmitError(message)
        if (createYamlMode) setCreateYamlError(message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }, [
    annotationEntries,
    createYamlMode,
    createYamlText,
    editingName,
    isEditMode,
    labelEntries,
    loadRows,
    loadingEditData,
    metadataEnabled,
    resetCreateState,
    submitting,
    t,
    workspaceDescription,
    workspaceName,
    workspaceOwner,
  ])

  const enterCreateYamlMode = React.useCallback(() => {
    setCreateYamlText(
      buildWorkspaceYamlText({
        name: workspaceName,
        description: workspaceDescription,
        owner: workspaceOwner,
        metadataEnabled,
        labelEntries,
        annotationEntries,
      })
    )
    setCreateYamlError(null)
    setCreateYamlMode(true)
  }, [annotationEntries, labelEntries, metadataEnabled, workspaceDescription, workspaceName, workspaceOwner])

  const cancelCreateYamlMode = React.useCallback(() => {
    setCreateYamlError(null)
    setCreateYamlMode(false)
  }, [])

  const confirmCreateYamlMode = React.useCallback(() => {
    try {
      const parsed = parseWorkspaceYamlText(createYamlText, t)
      setWorkspaceName(parsed.name)
      setWorkspaceDescription(parsed.description)
      setWorkspaceOwner(parsed.owner)
      setMetadataEnabled(false)
      setLabelEntries(parsed.labelEntries)
      setAnnotationEntries(parsed.annotationEntries)
      setCreateYamlError(null)
      setCreateYamlMode(false)
    } catch (error) {
      setCreateYamlError(error instanceof Error ? error.message : t("workspacesDialog.yamlParseFailed"))
    }
  }, [createYamlText, t])

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  const dialogTitle = isEditMode ? t("workspacesDialog.editTitle") : t("workspacesDialog.createTitle")
  const dialogDescription = isEditMode
    ? t("workspacesDialog.editDesc")
    : t("workspacesDialog.createDesc")

  return (
    <>
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title={t("workspacesDialog.deleteTitle")}
        description={pendingDeleteRow ? t("workspacesDialog.deleteDesc", { name: pendingDeleteRow.name }) : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <MonacoViewerDialog
        title={t("workspacesDialog.viewYamlTitle")}
        subtitle={yamlSubtitle}
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open && (submitting || loadingEditData)) return
          setCreateDialogOpen(open)
          if (!open) resetCreateState()
        }}
      >
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="me-20 flex h-full items-center">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">{t("workspacesDialog.yamlMode")}</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (submitting || loadingEditData) return
                      if (checked) {
                        enterCreateYamlMode()
                        return
                      }
                      cancelCreateYamlMode()
                    }}
                    disabled={submitting || loadingEditData}
                    aria-label={t("workspacesDialog.yamlMode")}
                  />
                </div>
              </div>
            </div>

            {!createYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: t("workspacesDialog.basicInfo"),
                    status: createStep === "basic" ? t("workspacesDialog.current") : t("workspacesDialog.configured"),
                    active: createStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: submitting || loadingEditData,
                    onClick: () => {
                      if (submitting || loadingEditData) return
                      setCreateStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: t("workspacesDialog.advancedSettings"),
                    status:
                      createStep === "advanced"
                        ? t("workspacesDialog.current")
                        : hasUserProvidedMetadata(labelEntries, annotationEntries)
                          ? t("workspacesDialog.configured")
                          : t("workspacesDialog.notConfigured"),
                    active: createStep === "advanced",
                    icon: <IconPencil className="size-4" />,
                    disabled: submitting || loadingEditData,
                    onClick: () => {
                      if (submitting || loadingEditData) return
                      if (createStep === "advanced") return
                      if (createStep === "basic") {
                        handleNextStep()
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
                        if (createOwnerError) setCreateOwnerError(null)
                        if (submitError) setSubmitError(null)
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
                    <h3 className="text-[15px] font-semibold">{t("workspacesDialog.basicInfo")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("workspacesDialog.basicInfoDesc")}</p>
                  </div>
                  <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field data-invalid={createNameInvalid}>
                      <FieldLabel htmlFor="workspace-create-name">{t("workspacesDialog.name")}</FieldLabel>
                      <Input
                        id="workspace-create-name"
                        value={workspaceName}
                        onChange={(event) => {
                          setWorkspaceName(event.target.value)
                          if (createNameInvalid) setCreateNameInvalid(false)
                          if (createNameError) setCreateNameError(null)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder={t("workspacesDialog.namePlaceholder")}
                        autoComplete="off"
                        aria-invalid={createNameInvalid}
                        disabled={submitting || loadingEditData || isEditMode}
                      />
                      {createNameError ? (
                        <FieldError>{createNameError}</FieldError>
                      ) : (
                        <FieldDescription>{t("workspacesDialog.nameRule")}</FieldDescription>
                      )}
                    </Field>

                    <Field data-invalid={Boolean(createOwnerError)}>
                      <FieldLabel htmlFor="workspace-create-owner">{t("workspacesDialog.owner")}</FieldLabel>
                      <Input
                        id="workspace-create-owner"
                        value={workspaceOwner}
                        onChange={(event) => {
                          setWorkspaceOwner(event.target.value)
                          if (createOwnerError) setCreateOwnerError(null)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder={t("workspacesDialog.ownerPlaceholder")}
                        autoComplete="off"
                        aria-invalid={Boolean(createOwnerError)}
                        disabled={submitting || loadingEditData}
                      />
                      {createOwnerError ? (
                        <FieldError>{createOwnerError}</FieldError>
                      ) : (
                        <FieldDescription>{t("workspacesDialog.ownerRule")}</FieldDescription>
                      )}
                    </Field>

                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="workspace-create-description">{t("workspacesDialog.description")}</FieldLabel>
                      <Textarea
                        id="workspace-create-description"
                        value={workspaceDescription}
                        onChange={(event) => {
                          setWorkspaceDescription(event.target.value)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder={t("workspacesDialog.descriptionPlaceholder")}
                        maxLength={256}
                        className="min-h-28"
                        disabled={submitting || loadingEditData}
                      />
                      <FieldDescription>{t("workspacesDialog.descriptionRule")}</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">{t("workspacesDialog.advancedSettings")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{t("workspacesDialog.advancedSettingsDesc")}</p>
                  </div>
                  <ResourceMetadataEditor
                    checked={metadataEnabled}
                    onCheckedChange={setMetadataEnabled}
                    labels={labelEntries}
                    setLabels={setLabelEntries}
                    annotations={annotationEntries}
                    setAnnotations={setAnnotationEntries}
                    description={workspaceDescription}
                    setDescription={setWorkspaceDescription}
                    disabled={submitting || loadingEditData}
                  />
                </div>
              )}
            </div>

            {submitError && !createYamlMode ? (
              <div className="px-6 pb-3 text-sm text-destructive">{submitError}</div>
            ) : null}

            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              {createYamlMode ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button type="button" variant="outline" onClick={cancelCreateYamlMode} disabled={submitting || loadingEditData}>
                    {t("workspacesDialog.cancel")}
                  </Button>
                  <Button type="button" onClick={confirmCreateYamlMode} disabled={submitting || loadingEditData}>
                    {t("workspacesDialog.confirm")}
                  </Button>
                </div>
              ) : createStep === "basic" ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={submitting || loadingEditData}>
                      {t("workspacesDialog.cancel")}
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={submitting || loadingEditData} onClick={handleNextStep}>
                    {t("workspacesDialog.nextStep")}
                  </Button>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button type="button" variant="outline" disabled={submitting || loadingEditData} onClick={() => setCreateStep("basic")}>
                    {t("workspacesDialog.previousStep")}
                  </Button>
                  <Button type="button" onClick={handleCreateSubmit} disabled={submitting || loadingEditData}>
                    {submitting ? (isEditMode ? t("workspacesDialog.saving") : t("workspacesDialog.creating")) : isEditMode ? t("workspacesDialog.save") : t("workspacesDialog.create")}
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
        onCreate={openCreateDialog}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        toolbarEnd={
          <Input
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder={t("workspacesDialog.searchPlaceholder")}
            className="h-9 w-40"
          />
        }
      />
    </>
  )
}
