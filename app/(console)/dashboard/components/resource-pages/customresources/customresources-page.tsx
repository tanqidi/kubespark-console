"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"
import { stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  fetchCustomResourceDefinitionRows,
  type CustomResourceDefinitionRow,
} from "@/app/lib/kubespark/resource-rows"
import { fetchResourceByName } from "@/app/lib/kubespark/common"
import { deleteCustomResourceDefinition } from "@/app/lib/kubespark/resource-delete"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { useTranslations } from "@/app/lib/i18n"

type CustomResourceRow = CustomResourceDefinitionRow

function getCustomResourceColumns(t: (key: string) => string): ColumnConfig<CustomResourceRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "group", label: t("table.columns.group") },
    { key: "kind", label: t("table.columns.kind") },
    { key: "scope", label: t("table.columns.scope") },
    { key: "versions", label: t("table.columns.versions") },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

function sanitizeCustomResourceDefinitionYamlPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const root = payload as Record<string, unknown>
  const metadata =
    root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata)
      ? ({ ...(root.metadata as Record<string, unknown>) })
      : null

  if (!metadata) {
    const fallback = { ...root }
    delete fallback.status
    return fallback
  }

  const annotations =
    metadata.annotations && typeof metadata.annotations === "object" && !Array.isArray(metadata.annotations)
      ? ({ ...(metadata.annotations as Record<string, unknown>) })
      : null
  if (annotations) {
    delete annotations["kubectl.kubernetes.io/last-applied-configuration"]
    if (Object.keys(annotations).length > 0) metadata.annotations = annotations
    else delete metadata.annotations
  }

  delete metadata.uid
  delete metadata.resourceVersion
  delete metadata.generation
  delete metadata.creationTimestamp
  delete metadata.managedFields
  delete metadata.selfLink

  const normalized: Record<string, unknown> = {
    ...root,
    metadata,
  }
  delete normalized.status
  return normalized
}

export function CustomResourcesPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<CustomResourceRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [groupQuery, setGroupQuery] = React.useState("")
  const [scopeQuery, setScopeQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<CustomResourceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlSubtitle, setYamlSubtitle] = React.useState(t("customResourcesDialog.yamlSubtitle"))

  // 先获取翻译的字符串，避免在 React 元素内直接调用 t 函数导致下拉菜单问题
  const viewYamlText = t("actions.viewYaml")
  const deleteText = t("actions.delete")

  const requestDelete = React.useCallback((row: CustomResourceRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteCustomResourceDefinition(pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("customResourcesDialog.deleteFailed")
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: CustomResourceRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteCustomResourceDefinition(row.name))).catch(
      (e: unknown) => {
        const message = e instanceof Error ? e.message : t("customResourcesDialog.deleteFailed")
        setError(message)
      }
    )
  }, [t])

  // 将 handleViewYaml 提取出来，避免在 actionItems 内联定义导致每次渲染重新创建
  const handleViewYaml = React.useCallback((row: CustomResourceRow) => {
    const name = row.name.trim()
    if (!name || name === "-") return

    setYamlOpen(true)
    setYamlLoading(true)
    setYamlError(null)
    setYamlContent("")
    setYamlSubtitle(t("customResourcesDialog.yamlSubtitleWithName", { name }))

    void fetchResourceByName<unknown>(
      "apiextensions.k8s.io",
      "v1",
      "customresourcedefinitions",
      name
    )
      .then(({ payload }) => {
        const sanitizedPayload = sanitizeCustomResourceDefinitionYamlPayload(payload)
        setYamlContent(
          stringify(sanitizedPayload, {
            indent: 2,
            lineWidth: 0,
            sortMapEntries: false,
          })
        )
      })
      .catch((e: unknown) => {
        setYamlError(e instanceof Error ? e.message : t("customResourcesDialog.loadYamlFailed"))
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  // 单独提取 actionItems，避免下拉菜单重新挂载
  const actionItems = React.useMemo(() => [
    {
      label: (
        <>
          <IconEye className="size-4" />
          {viewYamlText}
        </>
      ),
      onSelect: (row: CustomResourceRow) => handleViewYaml(row),
    },
    {
      label: (
        <>
          <IconTrash className="size-4" />
          {deleteText}
        </>
      ),
      variant: "destructive" as const,
      onSelect: (row: CustomResourceRow) => requestDelete(row),
    },
  ], [handleViewYaml, requestDelete, viewYamlText, deleteText])

  const columns = React.useMemo(
    () =>
      createColumns<CustomResourceRow>({
        columns: getCustomResourceColumns(t),
        actionItems,
      }),
    [actionItems, t]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const mapped = await fetchCustomResourceDefinitionRows()
        if (cancelled) return
        setRows(mapped)
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
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

  const groupOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.group)))
        .sort((a, b) => a.localeCompare(b))
        .map((group) => ({ id: group, name: group })),
    [rows]
  )
  const scopeOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.scope)))
        .sort((a, b) => a.localeCompare(b))
        .map((scope) => ({ id: scope, name: scope })),
    [rows]
  )

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("table.alerts.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const groupFilter = groupQuery.trim().toLowerCase()
  const scopeFilter = scopeQuery.trim().toLowerCase()
  const nameFilter = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (groupFilter && row.group.toLowerCase() !== groupFilter) return false
    if (scopeFilter && row.scope.toLowerCase() !== scopeFilter) return false
    if (nameFilter && !row.name.toLowerCase().includes(nameFilter)) return false
    return true
  })

  return (
    <>
      <MonacoViewerDialog
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        title={t("dialogs.viewYaml.title")}
        subtitle={yamlSubtitle}
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
        title={t("dialogs.deleteConfirm.customResource.title")}
        description={pendingDeleteRow ? t("dialogs.deleteConfirm.customResource.description", { name: pendingDeleteRow.name }) : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        enableRowNavigation
        getRowHref={(row) => `/dashboard/customresources/${encodeURIComponent(row.name)}`}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        toolbarEnd={
          <>
            <FilterCombobox
              options={groupOptions}
              value={groupQuery}
              onValueChange={setGroupQuery}
              placeholder={t("table.filters.group")}
              emptyText={t("table.filters.noGroupFound")}
              className="w-40"
            />
            <FilterCombobox
              options={scopeOptions}
              value={scopeQuery}
              onValueChange={setScopeQuery}
              placeholder={t("table.filters.scope")}
              emptyText={t("table.filters.noScopeFound")}
              className="w-40"
            />
            <Input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder={t("table.filters.name")}
              className="h-9 w-40"
            />
          </>
        }
      />
    </>
  )
}
