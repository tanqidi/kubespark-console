"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconEye, IconPencil, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
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
  type NamespaceRow,
  updateNamespace,
} from "@/app/lib/kubespark/projects"
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

function buildProjectYamlText(params: { name: string; description: string }): string {
  return stringify(
    {
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(params.description.trim()
          ? { annotations: { description: params.description.trim() } }
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

function parseProjectYamlText(yamlText: string): { name: string; description: string } {
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

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
  }
}

export function ProjectsPageClient() {
  const [rows, setRows] = React.useState<NamespaceRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<NamespaceRow | null>(null)
  const [editingRow, setEditingRow] = React.useState<NamespaceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
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

  const requestDelete = React.useCallback((row: NamespaceRow) => {
    setPendingDeleteRow(row)
  }, [])

  const requestEdit = React.useCallback((row: NamespaceRow) => {
    setEditingRow(row)
    setCreateName(row.name)
    setCreateDescription(row.description ?? "")
    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateDialogOpen(true)
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
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (creating) return

      let nextName = (editingRow?.name ?? createName).trim()
      let nextDescription = createDescription.trim()

      if (createYamlMode) {
        try {
          const parsed = parseProjectYamlText(createYamlText)
          nextName = isEditMode ? (editingRow?.name ?? "").trim() : parsed.name.trim()
          nextDescription = parsed.description.trim()
          if (!isEditMode) setCreateName(nextName)
          setCreateDescription(nextDescription)
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

      const request = isEditMode
        ? updateNamespace({ name: nextName, description: nextDescription })
        : createNamespace({ name: nextName, description: nextDescription })

      void request
        .then(async () => {
          setCreateDialogOpen(false)
          setEditingRow(null)
          setCreateName("")
          setCreateDescription("")
          setCreateYamlMode(false)
          setCreateYamlText("")
          setCreateYamlError(null)
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
    [createDescription, createName, createYamlMode, createYamlText, creating, editingRow, isEditMode]
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
    [handleViewYaml, requestDelete, requestEdit]
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
            setCreateNameInvalid(false)
            setCreateNameError(null)
            setCreateYamlMode(false)
            setCreateYamlText("")
            setCreateYamlError(null)
          }
        }}
      >
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <form onSubmit={handleCreateSubmit} className="flex min-h-0 flex-1 flex-col">
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
                    status: "当前",
                    active: true,
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => {},
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
              ) : (
                <div className="border-b p-6">
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
                        placeholder="请输入描述（选填）"
                        maxLength={256}
                        className="min-h-28"
                        disabled={creating}
                      />
                      <FieldDescription>
                        描述将写入资源注解 `description`，最长 256 个字符。
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-background px-6 py-5">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={creating}>
                  取消
                </Button>
              </DialogClose>
              <Button type="submit" disabled={creating}>
                {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
          setCreateNameInvalid(false)
          setCreateNameError(null)
          setCreateYamlMode(false)
          setCreateYamlText("")
          setCreateYamlError(null)
          setCreateDialogOpen(true)
        }}
        toolbarEnd={projectFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
