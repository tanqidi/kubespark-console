"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconPencil, IconSettings2, IconTrash } from "@tabler/icons-react"
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

const WORKSPACE_NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字和连字符（-），必须以小写字母开头并以小写字母或数字结尾，最长 63 个字符。"

const workspaceColumns: ColumnConfig<WorkspaceRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "owner", label: "负责人" },
  { key: "status", label: "状态", render: "badge" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

function validateWorkspaceName(name: string): string | null {
  if (!name) return "请输入企业空间名称"
  if (name.length > 63) return WORKSPACE_NAME_RULE_MESSAGE
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) return WORKSPACE_NAME_RULE_MESSAGE
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

function parseWorkspaceYamlText(yamlText: string): {
  name: string
  description: string
  owner: string
  metadataEnabled: boolean
  labelEntries: MetadataEntry[]
  annotationEntries: MetadataEntry[]
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
  if (kind && kind !== "Workspace") throw new Error("YAML 资源类型必须是 Workspace")

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
    metadataEnabled: hasUserProvidedMetadata(labelEntries, annotationEntries),
    labelEntries,
    annotationEntries,
  }
}

export function WorkspacesPageClient() {
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
        setError(e instanceof Error ? e.message : "加载企业空间失败")
      }
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const run = async (silent: boolean) => {
      if (cancelled) return
      await loadRows(silent)
    }

    void run(false)
    const timer = window.setInterval(() => {
      void run(true)
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [loadRows])

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
      setMetadataEnabled(hasUserProvidedMetadata(labels, annotations))
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "加载企业空间详情失败")
    } finally {
      setLoadingEditData(false)
    }
  }, [resetCreateState])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: WorkspaceRow[]) => {
    if (selectedRows.length === 0) return
    setDeleting(true)

    void Promise.all(selectedRows.map((row) => deleteWorkspace(row.name)))
      .then(async () => {
        await loadRows(false)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [loadRows])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteWorkspace(pendingDeleteRow.name)
      .then(async () => {
        setPendingDeleteRow(null)
        await loadRows(false)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, loadRows, pendingDeleteRow])

  const columns = React.useMemo(
    () =>
      createColumns<WorkspaceRow>({
        columns: workspaceColumns,
        actionItems: [
          {
            label: (
              <>
                <IconPencil className="size-4" />
                编辑
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
    [openEditDialog]
  )

  const isEditMode = dialogMode === "edit"

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
        const parsed = parseWorkspaceYamlText(createYamlText)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextOwner = parsed.owner.trim()
        nextMetadataEnabled = parsed.metadataEnabled
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
        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
        return
      }
    }

    setSubmitError(null)

    const nameError = validateWorkspaceName(nextName)
    setCreateNameInvalid(Boolean(nameError))
    setCreateNameError(nameError)
    if (nameError) {
      if (createYamlMode) setCreateYamlError(nameError)
      return
    }

    const ownerError = nextOwner ? null : "请输入负责人"
    setCreateOwnerError(ownerError)
    if (ownerError) {
      if (createYamlMode) setCreateYamlError(ownerError)
      return
    }

    if (isEditMode && editingName && nextName !== editingName) {
      const lockedNameError = "编辑模式不允许修改名称"
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
        const message = e instanceof Error ? e.message : isEditMode ? "保存失败" : "创建失败"
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
    workspaceDescription,
    workspaceName,
    workspaceOwner,
  ])

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

  const dialogTitle = isEditMode ? "编辑企业空间" : "创建企业空间"
  const dialogDescription = isEditMode
    ? "编辑企业空间并更新基础归属信息。"
    : "创建企业空间并录入基础归属信息。"

  return (
    <>
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title="删除企业空间"
        description={pendingDeleteRow ? `确定删除企业空间 ${pendingDeleteRow.name} 吗？` : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
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
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (submitting || loadingEditData) return
                      if (checked) {
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
                        return
                      }

                      try {
                        const parsed = parseWorkspaceYamlText(createYamlText)
                        setWorkspaceName(parsed.name)
                        setWorkspaceDescription(parsed.description)
                        setWorkspaceOwner(parsed.owner)
                        setMetadataEnabled(parsed.metadataEnabled)
                        setLabelEntries(parsed.labelEntries)
                        setAnnotationEntries(parsed.annotationEntries)
                        setCreateYamlError(null)
                        setCreateYamlMode(false)
                      } catch (error) {
                        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                      }
                    }}
                    disabled={submitting || loadingEditData}
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
                    disabled: submitting || loadingEditData,
                    onClick: () => {
                      if (submitting || loadingEditData) return
                      setCreateStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status:
                      createStep === "advanced"
                        ? "当前"
                        : hasUserProvidedMetadata(labelEntries, annotationEntries)
                          ? "已设置"
                          : "未设置",
                    active: createStep === "advanced",
                    icon: <IconPencil className="size-4" />,
                    disabled: submitting || loadingEditData,
                    onClick: () => {
                      if (submitting || loadingEditData) return
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
                    <h3 className="text-[15px] font-semibold">基本信息</h3>
                    <p className="mt-1 text-sm text-muted-foreground">填写企业空间名称、负责人与描述信息。</p>
                  </div>
                  <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field data-invalid={createNameInvalid}>
                      <FieldLabel htmlFor="workspace-create-name">名称</FieldLabel>
                      <Input
                        id="workspace-create-name"
                        value={workspaceName}
                        onChange={(event) => {
                          setWorkspaceName(event.target.value)
                          if (createNameInvalid) setCreateNameInvalid(false)
                          if (createNameError) setCreateNameError(null)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder="请输入企业空间名称"
                        autoComplete="off"
                        aria-invalid={createNameInvalid}
                        disabled={submitting || loadingEditData || isEditMode}
                      />
                      {createNameError ? (
                        <FieldError>{createNameError}</FieldError>
                      ) : (
                        <FieldDescription>{WORKSPACE_NAME_RULE_MESSAGE}</FieldDescription>
                      )}
                    </Field>

                    <Field data-invalid={Boolean(createOwnerError)}>
                      <FieldLabel htmlFor="workspace-create-owner">负责人</FieldLabel>
                      <Input
                        id="workspace-create-owner"
                        value={workspaceOwner}
                        onChange={(event) => {
                          setWorkspaceOwner(event.target.value)
                          if (createOwnerError) setCreateOwnerError(null)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder="请输入负责人"
                        autoComplete="off"
                        disabled={submitting || loadingEditData}
                      />
                      {createOwnerError ? <FieldError>{createOwnerError}</FieldError> : null}
                    </Field>

                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="workspace-create-description">描述</FieldLabel>
                      <Textarea
                        id="workspace-create-description"
                        value={workspaceDescription}
                        onChange={(event) => {
                          setWorkspaceDescription(event.target.value)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder="请输入描述"
                        maxLength={256}
                        className="min-h-28"
                        disabled={submitting || loadingEditData}
                      />
                      <FieldDescription>描述将写入资源注解 description，最长 256 个字符。</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">配置企业空间标签与注解。</p>
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
                    titleText="统一管理企业空间的标签与注解信息。"
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
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={submitting || loadingEditData}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={handleCreateSubmit} disabled={submitting || loadingEditData}>
                    {submitting ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                  </Button>
                </div>
              ) : createStep === "basic" ? (
                <div className="flex w-full items-center justify-between gap-3">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={submitting || loadingEditData}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={submitting || loadingEditData} onClick={() => setCreateStep("advanced")}>
                    下一步
                  </Button>
                </div>
              ) : (
                <div className="flex w-full items-center justify-between gap-3">
                  <Button type="button" variant="outline" disabled={submitting || loadingEditData} onClick={() => setCreateStep("basic")}>
                    上一步
                  </Button>
                  <Button type="button" onClick={handleCreateSubmit} disabled={submitting || loadingEditData}>
                    {submitting ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
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
            placeholder="名称"
            className="h-9 w-40"
          />
        }
      />
    </>
  )
}
