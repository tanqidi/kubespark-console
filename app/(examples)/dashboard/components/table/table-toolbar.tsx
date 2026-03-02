"use client"

import { IconChevronDown, IconLayoutColumns, IconPlus, IconTrash } from "@tabler/icons-react"
import { type Column, type Table } from "@tanstack/react-table"
import { type ReactNode } from "react"

import { cn } from "@/lib/utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/registry/new-york-v4/ui/dropdown-menu"

type ColumnMeta = {
  label?: string
}

function resolveColumnLabel<TData>(column: Column<TData, unknown>): string {
  const meta = column.columnDef.meta as ColumnMeta | undefined
  return meta?.label ?? column.id
}

export function TableToolbar<TData>({
  table,
  startContent,
  endContent,
  onDeleteSelected,
}: {
  table: Table<TData>
  startContent?: ReactNode
  endContent?: ReactNode
  onDeleteSelected?: () => void
}) {
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const showDelete = selectedCount > 0

  return (
    <div className="relative min-h-9">
      <div
        className={cn(
          "flex items-center px-4 lg:px-6",
          startContent || endContent ? "justify-between gap-2" : "justify-end",
          showDelete ? "invisible pointer-events-none" : ""
        )}
        aria-hidden={showDelete}
      >
        {startContent ? (
          <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {startContent}
          </div>
        ) : null}

        <div className="ml-auto flex min-w-0 shrink items-center gap-2">
          {endContent ? (
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              {endContent}
            </div>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">自定义列</span>
                <span className="lg:hidden">自定义列</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  const label = resolveColumnLabel(column)
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm">
            <IconPlus />
            <span className="hidden lg:inline">创建</span>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 flex items-center justify-end px-4 lg:px-6",
          showDelete ? "" : "invisible pointer-events-none"
        )}
        aria-hidden={!showDelete}
      >
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <IconTrash />
              <span className="hidden lg:inline">删除</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>批量删除容器组</AlertDialogTitle>
              <AlertDialogDescription>
                此操作不可撤销，将删除已选中的 {selectedCount} 条数据。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDeleteSelected}>
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
