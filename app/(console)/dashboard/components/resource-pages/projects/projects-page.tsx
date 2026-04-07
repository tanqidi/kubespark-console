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
import {Input} from "@/components/ui/input"

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

const projectColumns: ColumnConfig<NamespaceRow>[] = [
  {
    key: "name",
    label: "名称",
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    enableHiding: false,
  },
  { key: "status", label: "状态", render: "status" },
  { key: "labels", label: "标签", align: "right" },
  { key: "annotations", label: "注解", align: "right" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

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

const PROJECT_NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字和连字符（-），必须以小写字母开头并以小写字母或数字结尾，最长 63 个字符。"

function validateProjectName(name: string): string | null {
  if (!name) return "请输入项目名称"
  if (name.length > 63) return PROJECT_NAME_RULE_MESSAGE
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) {
    return PROJECT_NAME_RULE_MESSAGE
  }
  return null
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

export function ProjectsPageClient() {
  type ProjectDialogStep = "basic" | "advanced"
  const [rows, setRows] = React.useState<NamespaceRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("查看 Kubernetes Namespace 的详情内容。")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<NamespaceRow | null>(null)
  const [editingRow, setEditingRow] = React.useState<NamespaceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
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
  const dialogTitle = isEditMode ? "编辑项目" : "创建项目"
  const dialogDescription = isEditMode
    ? "编辑项目描述信息。"
    : "创建项目以对资源进行分组并控制不同用户的权限。"

  const handleViewYaml = React.useCallback((row: NamespaceRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespaceYaml(row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Projects] view yaml response", {
          namespace: row.name,
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Projects] view yaml request failed", {
          namespace: row.name,
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const handleViewDescribe = React.useCallback((row: NamespaceRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(`查看 Kubernetes Namespace（${row.name}）的详情内容。`)

    void fetchResourceDescribe("core", "v1", "namespaces", row.name)
      .then(({ text }) => {
        setDescribeContent(text || "(无详情输出)")
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载详情失败"
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: NamespaceRow) => {
    setPendingDeleteRow(row)
  }, [])

  const requestEdit = React.useCallback((row: NamespaceRow) => {
    void fetchResourceByName<unknown>("core", "v1", "namespaces", row.name)
      .then(({ payload }) => {
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

        setEditingRow(row)
        setCreateName(row.name)
        setCreateDescription(row.description ?? "")
        setLabelEntries(initialLabels)
        setAnnotationEntries(initialAnnotations)
        setMetadataEnabled(hasUserProvidedMetadata(initialLabels, initialAnnotations))
        setCreateNameInvalid(false)
        setCreateNameError(null)
        setCreateYamlMode(false)
        setCreateYamlText("")
        setCreateYamlError(null)
        setCreateStep("basic")
        setCreateDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载项目详情失败"
        setError(message)
      })
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteNamespace(pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Projects] delete request failed", {
          namespace: pendingDeleteRow.name,
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: NamespaceRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteNamespace(row.name))).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Projects] bulk delete request failed", e)
    })
  }, [])

  const handleCreateSubmit = React.useCallback(
    () => {
      if (creating) return

      let nextName = (editingRow?.name ?? createName).trim()
      let nextDescription = createDescription.trim()
      let nextLabels = metadataEntriesToRecord(labelEntries)
      let nextAnnotations = metadataEntriesToRecord(annotationEntries)

      if (createYamlMode) {
        try {
          const parsed = parseProjectYamlText(createYamlText)
          nextName = isEditMode ? (editingRow?.name ?? "").trim() : parsed.name.trim()
          nextDescription = parsed.description.trim()
          nextLabels = metadataEntriesToRecord(parsed.labels)
          nextAnnotations = metadataEntriesToRecord(parsed.annotations)
          if (!isEditMode) setCreateName(nextName)
          setCreateDescription(nextDescription)
          setLabelEntries(parsed.labels)
          setAnnotationEntries(parsed.annotations)
          setMetadataEnabled(hasUserProvidedMetadata(parsed.labels, parsed.annotations))
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

      setCreateNameInvalid(false)
      setCreateNameError(null)
      setCreateYamlError(null)
      setCreating(true)

      const requestPayload: CreateNamespaceInput = {
        name: nextName,
        description: nextDescription,
        labels: nextLabels,
        annotations: nextAnnotations,
      }
      const request = isEditMode
        ? updateNamespace(requestPayload)
        : createNamespace(requestPayload)

      void request
        .then(async () => {
          setCreateDialogOpen(false)
          setEditingRow(null)
          setCreateName("")
          setCreateDescription("")
          setMetadataEnabled(false)
          setLabelEntries([{ key: "", value: "" }])
          setAnnotationEntries([{ key: "", value: "" }])
          setCreateYamlMode(false)
          setCreateYamlText("")
          setCreateYamlError(null)
          setCreateStep("basic")
          const items = await fetchNamespaces()
          setRows(items)
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
    },
    [
      annotationEntries,
      createDescription,
      createName,
      createYamlMode,
      createYamlText,
      creating,
      editingRow,
      isEditMode,
      labelEntries,
    ]
  )

  const columns = React.useMemo(
    () =>
      createColumns<NamespaceRow>({
        columns: projectColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
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
                {"详情"}
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
                {"编辑"}
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
                {"删除"}
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
    [handleViewDescribe, handleViewYaml, requestDelete, requestEdit]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const items = await fetchNamespaces()
        if (cancelled) return
        setRows(items)
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[Projects] polling refresh failed", e)
        }
      } finally {
        if (!silent && !cancelled) setLoading(false)
      }
    }

    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
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

  const projectFilters = (
    <Input
      value={nameQuery}
      onChange={(event) => setNameQuery(event.target.value)}
      placeholder="名称"
      className="h-9 w-40"
    />
  )

  return (
    <>
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateDialogOpen(open)
          if (!open) {
            setEditingRow(null)
            setCreateName("")
            setCreateDescription("")
            setMetadataEnabled(false)
            setLabelEntries([{ key: "", value: "" }])
            setAnnotationEntries([{ key: "", value: "" }])
            setCreateNameInvalid(false)
            setCreateNameError(null)
            setCreateYamlMode(false)
            setCreateYamlText("")
            setCreateYamlError(null)
            setCreateStep("basic")
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
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (creating) return
                      if (checked) {
                        setCreateYamlText(
                          buildProjectYamlText({
                            name: editingRow?.name ?? createName,
                            description: createDescription,
                            labels: labelEntries,
                            annotations: annotationEntries,
                          })
                        )
                        setCreateYamlError(null)
                        setCreateYamlMode(true)
                        return
                      }

                      try {
                        const parsed = parseProjectYamlText(createYamlText)
                        if (!isEditMode) {
                          setCreateName(parsed.name)
                        }
                        setCreateDescription(parsed.description)
                        setLabelEntries(parsed.labels)
                        setAnnotationEntries(parsed.annotations)
                        setMetadataEnabled(hasUserProvidedMetadata(parsed.labels, parsed.annotations))
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
                        : hasUserProvidedMetadata(labelEntries, annotationEntries)
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
                    <p className="mt-1 text-sm text-muted-foreground">
                      填写项目名称与描述信息。
                    </p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field data-invalid={createNameInvalid}>
                      <FieldLabel htmlFor="project-create-name">名称</FieldLabel>
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
                        placeholder="请输入项目名称"
                        autoComplete="off"
                        aria-invalid={createNameInvalid}
                        disabled={creating || isEditMode}
                      />
                      {createNameError ? (
                        <FieldError>{createNameError}</FieldError>
                      ) : (
                        <FieldDescription>{PROJECT_NAME_RULE_MESSAGE}</FieldDescription>
                      )}
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="project-create-description">
                        描述
                      </FieldLabel>
                      <Textarea
                        id="project-create-description"
                        name="description"
                        value={createDescription}
                        onChange={(event) => setCreateDescription(event.target.value)}
                        placeholder="请输入描述"
                        maxLength={256}
                        className="min-h-28"
                        disabled={creating}
                      />
                      <FieldDescription>
                        描述将写入资源注解 description，最长 256 个字符。
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      补充标签与注解信息，便于检索、分类和后续治理。
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
                        setAnnotations={setAnnotationEntries}
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
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={() => handleCreateSubmit()} disabled={creating}>
                    {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                  </Button>
                </>
              ) : createStep === "basic" ? (
                <>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={creating} onClick={() => setCreateStep("advanced")}>
                    下一步
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateStep("basic")}>
                    上一步
                  </Button>
                  <Button type="button" onClick={() => handleCreateSubmit()} disabled={creating}>
                    {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
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
        description={
          pendingDeleteRow
            ? `确定删除项目 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => {
          setEditingRow(null)
          setCreateName("")
          setCreateDescription("")
          setMetadataEnabled(false)
          setLabelEntries([{ key: "", value: "" }])
          setAnnotationEntries([{ key: "", value: "" }])
          setCreateNameInvalid(false)
          setCreateNameError(null)
          setCreateYamlMode(false)
          setCreateYamlText("")
          setCreateYamlError(null)
          setCreateStep("basic")
          setCreateDialogOpen(true)
        }}
        toolbarEnd={projectFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
