"use client"

import * as React from "react"
import {
  IconCircleCheckFilled,
  IconDotsVertical,
  IconGripVertical,
  IconLoader,
} from "@tabler/icons-react"
import { useSortable } from "@dnd-kit/sortable"
import { type ColumnDef } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Badge } from "@/registry/new-york-v4/ui/badge"
import { Button } from "@/registry/new-york-v4/ui/button"
import { Checkbox } from "@/registry/new-york-v4/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Label } from "@/registry/new-york-v4/ui/label"

type ColumnRender = "text" | "badge" | "status" | "input"

export type ColumnConfig<TData> = {
  key: keyof TData & string
  label: React.ReactNode
  header?: React.ReactNode
  align?: "left" | "center" | "right"
  enableHiding?: boolean
  enableSorting?: boolean
  render?: ColumnRender
  cell?: (value: unknown, row: TData) => React.ReactNode
  headerClassName?: string
  cellClassName?: string
}

type CreateColumnsOptions<TData> = {
  columns: ColumnConfig<TData>[]
  includeDrag?: boolean
  includeSelect?: boolean
  includeActions?: boolean
  actionItems?: ActionMenuItem<TData>[]
}

export type ActionMenuItem<TData> = {
  label: React.ReactNode
  variant?: "default" | "destructive"
  withSeparator?: boolean
  onSelect?: (row: TData) => void
}

function DragHandle({ id }: { id: string }) {
  const { attributes, listeners } = useSortable({ id })
  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-7 hover:bg-transparent"
    >
      <IconGripVertical className="text-muted-foreground size-3" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

function renderCell<TData>(
  col: ColumnConfig<TData>,
  value: unknown,
  row: TData,
  rowId: string
) {
  if (col.cell) return col.cell(value, row)

  if (col.render === "badge") {
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground px-1.5", col.cellClassName)}
      >
        {String(value ?? "-")}
      </Badge>
    )
  }

  if (col.render === "status") {
    const text = String(value ?? "-")
    const lowered = text.toLowerCase()
    const isDone =
      lowered === "done" ||
      lowered === "running" ||
      lowered === "succeeded" ||
      lowered === "success" ||
      lowered === "normal" ||
      lowered === "ready"
    return (
      <Badge
        variant="outline"
        className={cn("text-muted-foreground px-1.5", col.cellClassName)}
      >
        {isDone ? (
          <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
        ) : (
          <IconLoader />
        )}
        {text}
      </Badge>
    )
  }

  if (col.render === "input") {
    const inputId = `${rowId}-${col.key}`
    return (
      <>
        <Label htmlFor={inputId} className="sr-only">
          {typeof col.label === "string" ? col.label : col.key}
        </Label>
        <Input
          className={cn(
            "h-8 w-28 border-transparent bg-transparent",
            col.cellClassName
          )}
          defaultValue={String(value ?? "")}
          id={inputId}
        />
      </>
    )
  }

  return (
    <span className={cn(col.cellClassName)}>
      {String(value ?? "-")}
    </span>
  )
}

export function createColumns<TData extends Record<string, unknown>>(
  options: CreateColumnsOptions<TData>
): ColumnDef<TData>[] {
  const {
    columns,
    includeDrag = true,
    includeSelect = true,
    includeActions = true,
    actionItems,
  } = options
  const visibleActionItems = actionItems?.filter((item) => Boolean(item.label)) ?? []

  const defs: ColumnDef<TData>[] = []

  if (includeDrag) {
    defs.push({
      id: "drag",
      header: () => null,
      cell: ({ row }) => <DragHandle id={row.id} />,
      enableSorting: false,
      enableHiding: false,
    })
  }

  if (includeSelect) {
    defs.push({
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    })
  }

  defs.push(
    ...columns.map((col) => {
      const header = col.header ?? col.label
      const headerNode = col.headerClassName ? (
        <div className={cn("w-full", col.headerClassName)}>{header}</div>
      ) : (
        header
      )

      return {
        accessorKey: col.key,
        header: headerNode,
        cell: ({ row, getValue }) =>
          renderCell(col, getValue(), row.original, row.id),
        enableHiding: col.enableHiding ?? true,
        enableSorting: col.enableSorting ?? true,
        meta: {
          label: typeof col.label === "string" ? col.label : undefined,
        },
      } satisfies ColumnDef<TData>
    })
  )

  if (includeActions) {
    defs.push({
      id: "actions",
      cell: ({ row }) =>
        visibleActionItems.length === 0 ? (
          <Button
            variant="ghost"
            className="flex size-8 text-muted-foreground opacity-0 pointer-events-none"
            size="icon"
            tabIndex={-1}
            aria-hidden
          >
            <IconDotsVertical />
            <span className="sr-only">Open menu</span>
          </Button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex size-8 text-muted-foreground data-[state=open]:bg-muted focus-visible:ring-0 focus-visible:border-transparent"
                size="icon"
              >
                <IconDotsVertical />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {visibleActionItems.map((item, index) => (
                <React.Fragment key={`action-${index}`}>
                  {item.withSeparator ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuItem
                    variant={item.variant}
                    onSelect={() => item.onSelect?.(row.original)}
                  >
                    {item.label}
                  </DropdownMenuItem>
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      enableSorting: false,
      enableHiding: false,
    })
  }

  return defs
}
