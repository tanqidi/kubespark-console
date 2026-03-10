"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns, type ColumnConfig } from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  createNamespace,
  deleteNamespace,
  fetchNamespaceYaml,
  fetchNamespaces,
  type NamespaceRow,
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
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {Input} from "@/components/ui/input"

const projectColumns: ColumnConfig<NamespaceRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => {
      const description = row.description || "-"
      return (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="text-muted-foreground truncate text-sm">{description}</div>
        </div>
      )
    },
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
  const [deleting, setDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createName, setCreateName] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

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

      const nextName = createName.trim()
      const nextDescription = createDescription.trim()
      const validationMessage = validateProjectName(nextName)
      if (validationMessage) {
        setCreateNameInvalid(true)
        setCreateNameError(validationMessage)
        return
      }

      setCreateNameInvalid(false)
      setCreateNameError(null)
      setCreating(true)

      void createNamespace({ name: nextName, description: nextDescription })
        .then(async () => {
          setCreateDialogOpen(false)
          setCreateName("")
          setCreateDescription("")
          const items = await fetchNamespaces()
          setRows(items)
          setError(null)
        })
        .catch((e: unknown) => {
          const message = resolveCreateProjectErrorMessage(e)
          const isNameError = isNameRelatedCreateError(e)
          setCreateNameInvalid(isNameError)
          setCreateNameError(isNameError ? message : null)
        })
        .finally(() => {
          setCreating(false)
        })
    },
    [createDescription, createName, creating]
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
    [handleViewYaml, requestDelete]
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
            setCreateNameInvalid(false)
            setCreateNameError(null)
          }
        }}
      >
        <DialogContent
          className="sm:max-w-xl"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>创建项目</DialogTitle>
              <DialogDescription>
                创建项目以对资源进行分组并控制不同用户的权限。
              </DialogDescription>
            </DialogHeader>

            <FieldGroup className="mt-4">
              <Field data-invalid={createNameInvalid}>
                <FieldLabel htmlFor="project-create-name">名称</FieldLabel>
                <Input
                  id="project-create-name"
                  name="name"
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
                <FieldLabel htmlFor="project-create-description">
                  说明
                </FieldLabel>
                <Textarea
                  id="project-create-description"
                  name="description"
                  value={createDescription}
                  onChange={(event) => setCreateDescription(event.target.value)}
                  placeholder="请输入项目描述（选填）"
                  maxLength={256}
                  className="min-h-20"
                  disabled={creating}
                />
                <FieldDescription>
                  描述可包含任意字符，最长 256 个字符。
                </FieldDescription>
              </Field>
            </FieldGroup>

            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={creating}>
                  取消
                </Button>
              </DialogClose>
              <Button type="submit" disabled={creating}>
                {creating ? "创建中..." : "创建"}
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
        onCreate={() => setCreateDialogOpen(true)}
        toolbarEnd={projectFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
