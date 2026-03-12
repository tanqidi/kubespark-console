"use client"

import * as React from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react"

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
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

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
      setPagination({
        pageIndex: 0,
        pageSize: 10,
      })
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

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pagination.pageSize))
  const maxPageIndex = pageCount - 1
  const pageIndex = Math.min(pagination.pageIndex, maxPageIndex)
  const pageRows = React.useMemo(
    () =>
      filteredRows.slice(
        pageIndex * pagination.pageSize,
        pageIndex * pagination.pageSize + pagination.pageSize
      ),
    [filteredRows, pageIndex, pagination.pageSize]
  )

  React.useEffect(() => {
    setPagination((current) => {
      const nextMaxIndex = Math.max(0, Math.ceil(filteredRows.length / current.pageSize) - 1)
      if (current.pageIndex <= nextMaxIndex) return current
      return { ...current, pageIndex: nextMaxIndex }
    })
  }, [filteredRows.length])

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

  const isBusy = loading

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[84vh] w-[min(92vw,1200px)] flex-col overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b bg-muted/15 px-6 py-4">
          <DialogTitle>指定工作负载</DialogTitle>
          <DialogDescription>点击列表行即可选择并回填标签选择器。</DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2 px-6 py-4">
          <Tabs
            value={kindFilter}
            onValueChange={(value) => {
              setKindFilter(value as WorkloadKind)
              setPagination((current) => ({ ...current, pageIndex: 0 }))
            }}
            className="w-fit"
          >
            <TabsList>
              <TabsTrigger value="Deployment">部署</TabsTrigger>
              <TabsTrigger value="StatefulSet">有状态副本集</TabsTrigger>
              <TabsTrigger value="DaemonSet">守护进程集</TabsTrigger>
            </TabsList>
          </Tabs>

          <Input
            value={nameQuery}
            onChange={(event) => {
              setNameQuery(event.target.value)
              setPagination((current) => ({ ...current, pageIndex: 0 }))
            }}
            placeholder="名称"
            className="h-9 w-52"
            disabled={isBusy}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>命名空间</TableHead>
                  <TableHead>期望</TableHead>
                  <TableHead>更新</TableHead>
                  <TableHead>可用</TableHead>
                  <TableHead>就绪</TableHead>
                  <TableHead>更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : pageRows.length > 0 ? (
                  pageRows.map((row) => {
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => {
                          if (!isBusy) handlePick(row)
                        }}
                      >
                        <TableCell>
                          <div className="min-w-0">
                            <div className="truncate font-medium">{row.name}</div>
                            <div className="truncate text-sm text-muted-foreground">
                              {row.description || "-"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell>{row.namespace}</TableCell>
                        <TableCell>{row.desired}</TableCell>
                        <TableCell>{row.updated}</TableCell>
                        <TableCell>{row.available}</TableCell>
                        <TableCell>{row.ready}</TableCell>
                        <TableCell>{row.updatedAt}</TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      暂无可选工作负载
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <div className="text-sm text-muted-foreground">
            共 {filteredRows.length} 条
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={`${pagination.pageSize}`}
              onValueChange={(value) =>
                setPagination({
                  pageIndex: 0,
                  pageSize: Number(value),
                })
              }
              disabled={isBusy}
            >
              <SelectTrigger size="sm" className="w-24">
                <SelectValue placeholder={pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {[10, 20, 30].map((size) => (
                    <SelectItem key={size} value={`${size}`}>
                      {size}/页
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <div className="text-sm">
              第 {pageIndex + 1} 页，共 {pageCount}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setPagination((current) => ({ ...current, pageIndex: 0 }))}
                disabled={isBusy || pageIndex === 0}
              >
                <IconChevronsLeft />
                <span className="sr-only">第一页</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    pageIndex: Math.max(0, current.pageIndex - 1),
                  }))
                }
                disabled={isBusy || pageIndex === 0}
              >
                <IconChevronLeft />
                <span className="sr-only">上一页</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  setPagination((current) => ({
                    ...current,
                    pageIndex: Math.min(pageCount - 1, current.pageIndex + 1),
                  }))
                }
                disabled={isBusy || pageIndex >= pageCount - 1}
              >
                <IconChevronRight />
                <span className="sr-only">下一页</span>
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() =>
                  setPagination((current) => ({ ...current, pageIndex: pageCount - 1 }))
                }
                disabled={isBusy || pageIndex >= pageCount - 1}
              >
                <IconChevronsRight />
                <span className="sr-only">最后一页</span>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type { WorkloadSelectorPair, PickedWorkload }
