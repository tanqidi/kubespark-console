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

type ServiceAccountRow = ServiceAccountResourceRow

const serviceAccountColumns: ColumnConfig<ServiceAccountRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  // { key: "secrets", label: "Secrets"},
  // { key: "imagePullSecrets", label: "拉取凭据"},
  // { key: "automountToken", label: "自动挂载令牌" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function ServiceAccountsPageClient() {
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
  const [yamlSubtitle, setYamlSubtitle] = React.useState("查看 Kubernetes ServiceAccount 的 YAML 内容。")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<ServiceAccountRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: ServiceAccountRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`查看 Kubernetes ServiceAccount（${row.namespace}/${row.name}）的 YAML 内容。`)

    void fetchNamespacedResourceYaml("serviceaccounts", row.namespace, row.name, {
      group: "core",
      version: "v1",
    })
      .then(({ text }) => {
        setYamlContent(text)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

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
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: ServiceAccountRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteServiceAccount(row.namespace, row.name))).catch(
      (e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
      }
    )
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<ServiceAccountRow>({
        columns: serviceAccountColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
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
                {"删除"}
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
    [handleViewYaml, requestDelete]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const [mapped, namespaces] = await Promise.all([
          fetchServiceAccountRows(),
          fetchNamespaces(),
        ])
        if (cancelled) return
        setRows(mapped)
        setNamespaceOptions(
          namespaces
            .map((item) => ({ id: item.name, name: item.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
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
        title="查看YAML"
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
        title="删除服务账号"
        description={pendingDeleteRow ? `确定删除服务账号 ${pendingDeleteRow.namespace}/${pendingDeleteRow.name} 吗？` : ""}
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
              placeholder={"命名空间"}
              emptyText={"未找到命名空间"}
              className="w-40"
            />
            <Input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder={"名称"}
              className="h-9 w-40"
            />
          </>
        }
      />
    </>
  )
}
