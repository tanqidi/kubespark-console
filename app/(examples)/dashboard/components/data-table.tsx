"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react"
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"

import { TableToolbar } from "@/app/(examples)/dashboard/components/table/table-toolbar"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Label } from "@/registry/new-york-v4/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/registry/new-york-v4/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/registry/new-york-v4/ui/table"

type DataTableProps<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  getRowId?: (row: TData, index: number) => string
  getRowHref?: (row: TData) => string | null | undefined
  toolbarStart?: React.ReactNode
  toolbarEnd?: React.ReactNode
  onCreate?: () => void
  onDeleteSelectedRows?: (rows: TData[]) => void | Promise<void>
}

function DraggableRow<TData>({
  row,
  href,
  primaryColumnId,
  onNavigate,
}: {
  row: Row<TData>
  href: string | null
  primaryColumnId: string | null
  onNavigate: (href: string) => void
}) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.id,
  })

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
    >
      {row.getVisibleCells().map((cell) => {
        const content = flexRender(cell.column.columnDef.cell, cell.getContext())
        const isPrimaryClickableCell =
          primaryColumnId !== null && cell.column.id === primaryColumnId

        return (
          <TableCell key={cell.id}>
            {href && isPrimaryClickableCell ? (
              <span
                role="link"
                tabIndex={0}
                onClick={() => onNavigate(href)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onNavigate(href)
                  }
                }}
                className="inline-flex max-w-full cursor-pointer text-left hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {content}
              </span>
            ) : (
              content
            )}
          </TableCell>
        )
      })}
    </TableRow>
  )
}

export function DataTable<TData extends Record<string, unknown>>({
  data: initialData,
  columns,
  getRowId,
  getRowHref,
  toolbarStart,
  toolbarEnd,
  onCreate,
  onDeleteSelectedRows,
}: DataTableProps<TData>) {
  const router = useRouter()
  const pathname = usePathname()
  const [data, setData] = React.useState(() => initialData)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const resolveRowId = React.useCallback(
    (row: TData, index: number) => {
      if (getRowId) return getRowId(row, index)
      const fallback = (row as { id?: string | number })?.id
      return typeof fallback === "number" || typeof fallback === "string"
        ? String(fallback)
        : String(index)
    },
    [getRowId]
  )

  const resolveRowHref = React.useCallback(
    (row: TData) => {
      if (getRowHref) return getRowHref(row) ?? null

      const name = (row as { name?: unknown }).name
      if (typeof name !== "string" || !name.trim()) return null

      const namespace = (row as { namespace?: unknown }).namespace
      const segments = [pathname, encodeURIComponent(name.trim())]

      const namespaceText =
        typeof namespace === "string" ? namespace.trim() : ""
      const normalizedNamespace = namespaceText.toLowerCase()
      const hasValidNamespace =
        namespaceText.length > 0 &&
        normalizedNamespace !== "-" &&
        normalizedNamespace !== "n/a" &&
        normalizedNamespace !== "<none>"

      if (hasValidNamespace) {
        segments.splice(1, 0, encodeURIComponent(namespaceText))
      }

      return segments.join("/")
    },
    [getRowHref, pathname]
  )

  const handleNavigate = React.useCallback(
    (href: string) => {
      router.push(href)
    },
    [router]
  )

  React.useEffect(() => {
    setData(initialData)
    setPagination((prev) => {
      const pageCount = Math.max(1, Math.ceil(initialData.length / prev.pageSize))
      const maxPageIndex = pageCount - 1
      if (prev.pageIndex <= maxPageIndex) return prev
      return { ...prev, pageIndex: maxPageIndex }
    })
  }, [initialData])

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data.map((row, index) => resolveRowId(row, index)),
    [data, resolveRowId]
  )

  const primaryColumnId = React.useMemo(() => {
    const firstAccessorColumn = columns.find((column) => {
      const accessorKey = (column as { accessorKey?: unknown }).accessorKey
      return typeof accessorKey === "string" && accessorKey.length > 0
    }) as { accessorKey?: string } | undefined

    return firstAccessorColumn?.accessorKey ?? null
  }, [columns])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row, index) => resolveRowId(row, index),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  const handleDeleteSelected = React.useCallback(() => {
    const selectedRows = table
      .getFilteredSelectedRowModel()
      .rows.map((row) => row.original)
    if (selectedRows.length === 0) return
    if (!onDeleteSelectedRows) {
      setRowSelection({})
      return
    }

    void Promise.resolve(onDeleteSelectedRows(selectedRows))
      .catch((error) => {
        console.error("[DataTable] bulk delete failed", error)
      })
      .finally(() => {
        setRowSelection({})
      })
  }, [onDeleteSelectedRows, table])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!active || !over || active.id === over.id) return
    const oldIndex = dataIds.indexOf(active.id)
    const newIndex = dataIds.indexOf(over.id)
    if (oldIndex < 0 || newIndex < 0) return
    setData((current) => arrayMove(current, oldIndex, newIndex))
  }

  return (
    <div className="flex w-full flex-col justify-start gap-6">
      <TableToolbar
        table={table}
        startContent={toolbarStart}
        endContent={toolbarEnd}
        onCreate={onCreate}
        onDeleteSelected={onDeleteSelectedRows ? handleDeleteSelected : undefined}
      />
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext
                    items={dataIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow
                        key={row.id}
                        row={row}
                        href={resolveRowHref(row.original)}
                        primaryColumnId={primaryColumnId}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      暂无数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            已选中 {table.getFilteredSelectedRowModel().rows.length} /{" "}
            {table.getFilteredRowModel().rows.length} 条。
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                每页行数
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              第 {table.getState().pagination.pageIndex + 1} 页，共{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden size-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">转到第一页</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">转到上一页</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">转到下一页</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">转到最后一页</span>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


