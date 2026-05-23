"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  fetchServiceAccountRows,
  type ServiceAccountResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { deleteServiceAccount } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/app/lib/i18n"
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"

type ServiceAccountRow = ServiceAccountResourceRow

function getServiceAccountColumns(t: (key: string) => string): ColumnConfig<ServiceAccountRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "namespace", label: t("table.columns.namespace") },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

export function ServiceAccountsPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<ServiceAccountRow[]>([])
  const [namespaceOptions, setNamespaceOptions] = React.useState<Array<{ id: string; name: string }>>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<ServiceAccountRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: ServiceAccountRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("serviceAccountsDialog.yamlSubtitleWithName", { namespace: row.namespace, name: row.name }))

    void fetchNamespacedResourceYaml("serviceaccounts", row.namespace, row.name, {
      group: "core",
      version: "v1",
    })
      .then(({ text }) => {
        setYamlContent(text)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("serviceAccountsDialog.loadYamlFailed")
        setYamlError(message)
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const requestDelete = React.useCallback((row: ServiceAccountRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteServiceAccount(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("serviceAccountsDialog.deleteFailed")
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: ServiceAccountRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteServiceAccount(row.namespace, row.name))).catch(
      (e: unknown) => {
        const message = e instanceof Error ? e.message : t("serviceAccountsDialog.deleteFailed")
        setError(message)
      }
    )
  }, [t])

  const columns = React.useMemo(
    () =>
      createColumns<ServiceAccountRow>({
        columns: getServiceAccountColumns(t),
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("serviceAccountsDialog.viewYaml")}
              </>
            ),
            onSelect: (row) => {
              handleViewYaml(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("serviceAccountsDialog.delete")}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              requestDelete(row)
            },
          },
        ],
      }),
    [handleViewYaml, requestDelete, t]
  )

  const loadRows = React.useCallback(async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [mapped, namespaces] = await Promise.all([
        fetchServiceAccountRows(),
        fetchNamespaces(),
      ])
      setRows(mapped)
      setNamespaceOptions(
        namespaces
          .map((item) => ({ id: item.name, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "API request failed")
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadRows(false)
  }, [loadRows])

  useIntervalRefresh(() => loadRows(true), 3000)

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{"加载失败"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const nsQuery = namespaceQuery.trim().toLowerCase()
  const nmQuery = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (nsQuery && row.namespace.toLowerCase() !== nsQuery) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  return (
    <>
      <MonacoViewerDialog
        title={t("serviceAccountsDialog.viewYamlTitle")}
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
        title={t("serviceAccountsDialog.deleteTitle")}
        description={pendingDeleteRow ? t("serviceAccountsDialog.deleteDesc", { name: `${pendingDeleteRow.namespace}/${pendingDeleteRow.name}` }) : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        toolbarEnd={
          <>
            <FilterCombobox
              options={namespaceOptions}
              value={namespaceQuery}
              onValueChange={setNamespaceQuery}
              placeholder={t("search.namespacePlaceholder")}
              emptyText={`${t("search.notFound")} ${t("search.namespace")}`}
              className="w-40"
            />
            <Input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder={t("search.namePlaceholder")}
              className="h-9 w-40"
            />
          </>
        }
      />
    </>
  )
}
