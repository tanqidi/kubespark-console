"use client"

import * as React from "react"
import {
  IconCircleCheckFilled,
  IconDotsVertical,
  IconLoader,
} from "@tabler/icons-react"
import { type ColumnDef } from "@tanstack/react-table"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"


type ColumnRender = "text" | "badge" | "status" | "input"

export function renderNameDescriptionCell(name: unknown, description?: unknown) {
  const primaryText =
      typeof name === "string" && name.trim().length > 0 ? name : "-"
  const secondaryText =
      typeof description === "string" && description.trim().length > 0
          ? description
          : "-"

  return (
      <div className="min-w-0">
        <div className="truncate font-medium">{primaryText}</div>
        <div className="truncate text-sm text-muted-foreground">{secondaryText}</div>
      </div>
  )
}

export type ColumnConfig<TData> = {
  key: keyof TData & string
  label?: React.ReactNode
  labelKey?: string
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
  includeSelect?: boolean
  includeActions?: boolean
  actionItems?: ActionMenuItem<TData>[]
}

export type ActionMenuItem<TData> = {
  label: React.ReactNode
  variant?: "default" | "destructive"
  withSeparator?: boolean
  onSelect?: (row: TData) => void
  disabled?: boolean | ((row: TData) => boolean)
}

function ActionMenuCell<TData>({
  row,
  actionItems,
}: {
  row: { original: TData; id: string }
  actionItems: ActionMenuItem<TData>[]
}) {
  return (
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
        <DropdownMenuGroup>
          {actionItems.map((item, index) => {
            const isDisabled = typeof item.disabled === "function" 
              ? item.disabled(row.original) 
              : !!item.disabled
            
            return (
              <React.Fragment key={`action-${index}`}>
                {item.withSeparator ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  variant={item.variant}
                  disabled={isDisabled}
                  onSelect={() => item.onSelect?.(row.original)}
                >
                  {item.label}
                </DropdownMenuItem>
              </React.Fragment>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const HEALTHY_STATUS_SET = new Set<string>([
  "done",
  "running",
  "succeeded",
  "success",
  "successful",
  "normal",
  "ready",
  "bound",
  "active",
  "available",
  "healthy",
  "completed",
  "online",
  "true",
  "就绪",
  "正常",
  "运行中",
  "成功",
  "已完成",
  "已绑定",
  "活跃",
  "可用",
  "在线",
])

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
    const normalized = text.trim().toLowerCase()
    const isHealthy = HEALTHY_STATUS_SET.has(normalized)

    const statusClassName = isHealthy
        ? "text-muted-foreground"
        : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"

    return (
        <Badge
            variant="outline"
            className={cn("px-1.5", statusClassName, col.cellClassName)}
        >
          {isHealthy ? (
              <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
          ) : (
              <IconLoader className="text-amber-500 dark:text-amber-300" />
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
    includeSelect = true,
    includeActions = true,
    actionItems,
  } = options
  const visibleActionItems = actionItems?.filter((item) => Boolean(item.label)) ?? []

  const defs: ColumnDef<TData>[] = []

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
        const rawHeader = col.header ?? col.label
        const normalizedHeader =
            rawHeader === null ||
            typeof rawHeader === "undefined" ||
            typeof rawHeader === "boolean"
                ? ""
                : rawHeader
        
        const headerTemplate: ColumnDef<TData>["header"] =
            typeof normalizedHeader === "string"
                ? normalizedHeader
                : () =>
                    col.headerClassName ? (
                        <div className={cn("w-full", col.headerClassName)}>
                          {normalizedHeader}
                        </div>
                    ) : (
                        <>{normalizedHeader}</>
                    )

        return {
          accessorKey: col.key,
          header: headerTemplate,
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
      header: "",
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
              <ActionMenuCell row={row} actionItems={visibleActionItems} />
          ),
      enableSorting: false,
      enableHiding: false,
    })
  }

  return defs
}
