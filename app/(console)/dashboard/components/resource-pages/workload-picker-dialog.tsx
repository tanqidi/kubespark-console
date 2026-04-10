"use client"

import * as React from "react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  fetchWorkloadRows,
  type WorkloadKind,
  type WorkloadPortItem,
  type WorkloadResourceRow,
  type WorkloadSelectorPair,
} from "@/app/lib/kubespark/resource-rows"
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
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type PickedWorkload = {
  kind: WorkloadKind
  name: string
  namespace: string
  selectors: WorkloadSelectorPair[]
  ports: WorkloadPortItem[]
}

type WorkloadPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  onPick: (value: PickedWorkload) => void
}

const workloadColumns: ColumnConfig<WorkloadResourceRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "status", label: "状态", render: "status" },
  { key: "namespace", label: "命名空间" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function WorkloadPickerDialog({
  open,
  onOpenChange,
  namespace,
  onPick,
}: WorkloadPickerDialogProps) {
  const [rows, setRows] = React.useState<WorkloadResourceRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [kindFilter, setKindFilter] = React.useState<WorkloadKind>("Deployment")
  const [nameQuery, setNameQuery] = React.useState("")

  React.useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchWorkloadRows()
      .then((result) => {
        if (cancelled) return
        setRows(result)
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return
        setError(fetchError instanceof Error ? fetchError.message : "加载工作负载失败")
        setRows([])
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  React.useEffect(() => {
    if (!open) {
      setKindFilter("Deployment")
      setNameQuery("")
      setError(null)
    }
  }, [open])

  const filteredRows = React.useMemo(() => {
    const normalizedQuery = nameQuery.trim().toLowerCase()
    return rows.filter((row) => {
      if (row.kind !== kindFilter) return false
      if (namespace && row.namespace !== namespace) return false
      if (normalizedQuery && !row.name.toLowerCase().includes(normalizedQuery)) return false
      return true
    })
  }, [kindFilter, nameQuery, namespace, rows])

  const handlePick = React.useCallback(
    (row: WorkloadResourceRow) => {
      onPick({
        kind: row.kind,
        name: row.name,
        namespace: row.namespace,
        selectors: row.selectors,
        ports: row.ports,
      })
      onOpenChange(false)
    },
    [onOpenChange, onPick]
  )

  const columns = React.useMemo(
    () =>
      createColumns<WorkloadResourceRow>({
        columns: workloadColumns,
        includeSelect: true,
        includeActions: false,
      }),
    []
  )

  const isBusy = loading

  const toolbarStart = (
    <Tabs value={kindFilter} onValueChange={(value) => setKindFilter(value as WorkloadKind)} className="w-fit">
      <TabsList>
        <TabsTrigger value="Deployment">部署</TabsTrigger>
        <TabsTrigger value="StatefulSet">有状态副本集</TabsTrigger>
        <TabsTrigger value="DaemonSet">守护进程集</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const toolbarEnd = (
    <Input
      value={nameQuery}
      onChange={(event) => setNameQuery(event.target.value)}
      placeholder="名称"
      className="h-9 w-52"
      disabled={isBusy}
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        overlayClassName="!bg-transparent !backdrop-blur-none"
        className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
      >
        <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
          <DialogTitle>指定工作负载</DialogTitle>
          <DialogDescription>点击列表行即可选择并回填标签选择器。</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            data={loading ? [] : filteredRows}
            columns={columns}
            getRowId={(row) => row.id}
            onRowClick={(row) => {
              if (isBusy) return
              handlePick(row)
            }}
            toolbarStart={toolbarStart}
            toolbarEnd={toolbarEnd}
            showColumnCustomizer
          />
          {loading ? (
            <p className="mt-3 text-sm text-muted-foreground">加载中...</p>
          ) : null}

          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
          <div className="flex w-full items-center justify-start gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isBusy}>
                取消
              </Button>
            </DialogClose>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export type { WorkloadSelectorPair, PickedWorkload }
