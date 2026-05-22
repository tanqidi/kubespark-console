"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  fetchStorageClassRows,
  type StorageClassResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { deleteStorageClass } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/app/lib/i18n"

type StorageClassRow = StorageClassResourceRow

function getStorageClassColumns(t: (key: string) => string): ColumnConfig<StorageClassRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "provisioner", label: t("storageClassesDialog.provisioner") },
    { key: "reclaimPolicy", label: t("storageClassesDialog.reclaimPolicy") },
    { key: "volumeBindingMode", label: t("storageClassesDialog.bindingMode") },
    { key: "isDefault", label: t("storageClassesDialog.isDefault") },
    { key: "allowExpansion", label: t("storageClassesDialog.allowExpansion") },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

export function StorageClassesPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<StorageClassRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState(t("storageClassesDialog.yamlSubtitle"))
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<StorageClassRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: StorageClassRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("storageClassesDialog.yamlSubtitleWithName", { name: row.name }))

    void fetchNamespacedResourceYaml("storageclasses", "", row.name, {
      group: "storage.k8s.io",
      version: "v1",
      documentType: "storageclass",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[StorageClasses] view yaml response", {
          storageClass: row.name,
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("storageClassesDialog.loadYamlFailed")
        setYamlError(message)
        console.error("[StorageClasses] view yaml request failed", {
          storageClass: row.name,
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const requestDelete = React.useCallback((row: StorageClassRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteStorageClass(pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("storageClassesDialog.deleteFailed")
        setError(message)
        console.error("[StorageClasses] delete request failed", {
          storageClass: pendingDeleteRow.name,
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: StorageClassRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteStorageClass(row.name))).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : t("storageClassesDialog.deleteFailed")
      setError(message)
      console.error("[StorageClasses] bulk delete request failed", e)
    })
  }, [t])

  // 先获取翻译的字符串，避免在 React 元素内部直接调用 t 函数
  const viewYamlText = t("actions.viewYaml")
  const deleteText = t("actions.delete")

  // 避免每次渲染重新创建 action items，防止下拉菜单重新挂载
  const actionItems = React.useMemo(() => [
    {
      label: (
        <>
          <IconEye className="size-4" />
          {viewYamlText}
        </>
      ),
      onSelect: (row: StorageClassRow) => {
        handleViewYaml(row)
      },
    },
    {
      label: (
        <>
          <IconTrash className="size-4" />
          {deleteText}
        </>
      ),
      variant: "destructive" as const,
      withSeparator: true,
      onSelect: (row: StorageClassRow) => {
        requestDelete(row)
      },
    },
  ], [handleViewYaml, requestDelete, viewYamlText, deleteText])

  const columns = React.useMemo(
    () =>
      createColumns<StorageClassRow>({
        columns: getStorageClassColumns(t),
        actionItems,
      }),
    [actionItems, t]
  )

  // 提取成 useCallback，避免频繁重新创建导致的死循环
  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const mapped = await fetchStorageClassRows()
      setRows(mapped)
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        const message = e instanceof Error ? e.message : "API request failed"
        setError(message)
      } else {
        console.error("[StorageClasses] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (cancelled) return
      await refreshRows(silent)
    }

    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [refreshRows])
  // if (loading) return <ResourceLoadingState /> // kept for potential future use
  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("storageClassesDialog.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const query = searchQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  const storageClassFilters = (
    <Input
      value={searchQuery}
      onChange={(event) => setSearchQuery(event.target.value)}
      placeholder={t("table.filters.name")}
      className="h-9 w-40"
    />
  )

  return (
    <>
      <MonacoViewerDialog
        title={t("storageClassesDialog.viewYaml")}
        subtitle={yamlSubtitle}
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
        title={t("storageClassesDialog.deleteTitle")}
        description={pendingDeleteRow ? t("storageClassesDialog.deleteDesc", { name: pendingDeleteRow.name }) : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarEnd={storageClassFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
