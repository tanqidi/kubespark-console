"use client"

import * as React from "react"
import { IconPlayerPlay, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  createPipelineRun,
  deletePipelineRun,
  fetchPipelineRunRows,
  type PipelineRunRow,
} from "@/app/lib/kubespark/pipelines"
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

type PipelineRunsPageClientProps = {
  pipelineName: string
}

const pipelineRunColumns: ColumnConfig<PipelineRunRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "triggerType", label: "触发方式" },
  { key: "phase", label: "状态", render: "status" },
  { key: "buildNumber", label: "构建号" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function PipelineRunsPageClient({ pipelineName }: PipelineRunsPageClientProps) {
  const normalizedPipelineName = pipelineName.trim()
  const [rows, setRows] = React.useState<PipelineRunRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const [nameQuery, setNameQuery] = React.useState("")
  const [runDialogOpen, setRunDialogOpen] = React.useState(false)
  const [runNamespace, setRunNamespace] = React.useState("")
  const [runRepo, setRunRepo] = React.useState(normalizedPipelineName)
  const [runError, setRunError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<PipelineRunRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

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

  const handleRun = React.useCallback(() => {
    if (running) return
    const namespace = runNamespace.trim()
    const repo = runRepo.trim()
    if (!namespace) {
      setRunError("请输入仓库命名空间（owner）")
      return
    }
    if (!repo) {
      setRunError("请输入仓库名称（repo）")
      return
    }

    setRunning(true)
    setRunError(null)
    setError(null)
    void createPipelineRun({
        pipelineName: normalizedPipelineName,
        triggerType: "manual",
        data: {
          namespace,
          repo,
        },
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
  }, [loadRows, normalizedPipelineName, runNamespace, runRepo, running])

  const columns = React.useMemo(
    () =>
      createColumns<PipelineRunRow>({
        columns: pipelineRunColumns,
        actionItems: [
          {
            label: "打开构建",
            onSelect: (row) => {
              if (!row.buildLink) return
              window.open(row.buildLink, "_blank", "noopener,noreferrer")
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
    []
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
      <Dialog
        open={runDialogOpen}
        onOpenChange={(open) => {
          if (!open && running) return
          setRunDialogOpen(open)
          if (open) {
            setRunRepo(normalizedPipelineName)
            setRunError(null)
          }
        }}
      >
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>立即运行</DialogTitle>
                <DialogDescription>录入 Drone 仓库信息后，创建一次 PipelineRun。</DialogDescription>
              </DialogHeader>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="mb-4">
                <h3 className="text-[15px] font-semibold">运行参数</h3>
                <p className="mt-1 text-sm text-muted-foreground">用于定位 Drone 仓库（owner/repo）。</p>
              </div>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="pipeline-run-namespace">仓库命名空间（owner）</FieldLabel>
                  <Input
                    id="pipeline-run-namespace"
                    value={runNamespace}
                    onChange={(event) => {
                      setRunNamespace(event.target.value)
                      if (runError) setRunError(null)
                    }}
                    placeholder="tanqidi"
                    autoComplete="off"
                    disabled={running}
                  />
                  <FieldDescription>将写入 `spec.data.namespace`。</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="pipeline-run-repo">仓库名称（repo）</FieldLabel>
                  <Input
                    id="pipeline-run-repo"
                    value={runRepo}
                    onChange={(event) => {
                      setRunRepo(event.target.value)
                      if (runError) setRunError(null)
                    }}
                    placeholder="kubespark"
                    autoComplete="off"
                    disabled={running}
                  />
                  <FieldDescription>将写入 `spec.data.repo`。</FieldDescription>
                </Field>
              </FieldGroup>
              {runError ? <FieldError className="mt-3">{runError}</FieldError> : null}
            </div>
            <DialogFooter className="border-t bg-background px-6 py-5">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={running}>
                    取消
                  </Button>
                </DialogClose>
                <Button type="button" onClick={() => void handleRun()} disabled={running}>
                  {running ? "触发中..." : "立即运行"}
                </Button>
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
