"use client"

import * as React from "react"
import { IconChevronDown, IconLayoutColumns, IconPlus, IconTrash } from "@tabler/icons-react"
import { type Column, type Table } from "@tanstack/react-table"

import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { useTranslations } from "@/app/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

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
  onCreate,
  onDeleteSelected,
  showColumnCustomizer = true,
}: {
  table: Table<TData>
  startContent?: React.ReactNode
  endContent?: React.ReactNode
  onCreate?: () => void
  onDeleteSelected?: () => void
  showColumnCustomizer?: boolean
}) {
  const t = useTranslations()
  const selectedCount = table.getFilteredSelectedRowModel().rows.length
  const showDelete = selectedCount > 0 && Boolean(onDeleteSelected)
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)

  React.useEffect(() => {
    if (!showDelete) setDeleteDialogOpen(false)
  }, [showDelete])

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

          {showColumnCustomizer ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="transition-none">
                  <IconLayoutColumns />
                  <span className="hidden lg:inline">{t("table.customizeColumns")}</span>
                  <span className="lg:hidden">{t("table.customizeColumns")}</span>
                  <IconChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
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
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {onCreate ? (
            <Button
              variant="outline"
              size="sm"
              className="transition-none"
              onClick={onCreate}
              type="button"
            >
              <IconPlus />
              <span className="hidden lg:inline">{t("table.create")}</span>
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "absolute inset-0 flex items-center justify-end px-4 lg:px-6",
          showDelete ? "" : "invisible pointer-events-none"
        )}
        aria-hidden={!showDelete}
      >
        <Button
          variant="destructive"
          size="sm"
          className="transition-none"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <IconTrash />
          <span className="hidden lg:inline">{t("table.delete")}</span>
        </Button>

        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          title={t("table.batchDelete")}
          description={t("table.batchDeleteDesc", { count: String(selectedCount) })}
          onConfirm={() => {
            onDeleteSelected?.()
            setDeleteDialogOpen(false)
          }}
        />
      </div>
    </div>
  )
}
