"use client"

import * as React from "react"
import { IconEye, IconInfoCircle, IconTrash } from "@tabler/icons-react"

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
import { deleteCustomResourceDefinition } from "@/app/lib/kubespark/resource-delete"
import { fetchResourceDescribe } from "@/app/lib/kubespark/common"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

type CustomResourceRow = CustomResourceDefinitionRow

const customResourceColumns: ColumnConfig<CustomResourceRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "group", label: "分组" },
  { key: "kind", label: "类型" },
  { key: "scope", label: "作用域" },
  { key: "versions", label: "版本" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function CustomResourcesPageClient() {
  const [rows, setRows] = React.useState<CustomResourceRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [groupQuery, setGroupQuery] = React.useState("")
  const [scopeQuery, setScopeQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("查看 Kubernetes CustomResourceDefinition 的 YAML 内容。")
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("查看 Kubernetes CustomResourceDefinition 的详情内容。")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<CustomResourceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: CustomResourceRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`查看 Kubernetes CustomResourceDefinition（${row.name}）的 YAML 内容。`)

    void fetchNamespacedResourceYaml("customresourcedefinitions", "", row.name, {
      group: "apiextensions.k8s.io",
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

  const handleViewDescribe = React.useCallback((row: CustomResourceRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(`查看 Kubernetes CustomResourceDefinition（${row.name}）的详情内容。`)

    void fetchResourceDescribe("apiextensions.k8s.io", "v1", "customresourcedefinitions", row.name)
      .then(({ text }) => {
        setDescribeContent(text || "(无详情输出)")
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载详情失败"
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [])

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
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: CustomResourceRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteCustomResourceDefinition(row.name))).catch(
      (e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
      }
    )
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<CustomResourceRow>({
        columns: customResourceColumns,
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
                <IconInfoCircle className="size-4" />
                {"查看详情"}
              </>
            ),
            onSelect: (row) => {
              handleViewDescribe(row)
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
    [handleViewDescribe, handleViewYaml, requestDelete]
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
    }, 5000)

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
          <AlertTitle>{"加载失败"}</AlertTitle>
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
        title="查看YAML"
        subtitle={yamlSubtitle}
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DescribeViewerDialog
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        title="查看详情"
        subtitle={describeSubtitle}
        value={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title="删除自定义资源定义"
        description={pendingDeleteRow ? `确定删除自定义资源定义 ${pendingDeleteRow.name} 吗？` : ""}
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
              options={groupOptions}
              value={groupQuery}
              onValueChange={setGroupQuery}
              placeholder={"分组"}
              emptyText={"未找到分组"}
              className="w-40"
            />
            <FilterCombobox
              options={scopeOptions}
              value={scopeQuery}
              onValueChange={setScopeQuery}
              placeholder={"作用域"}
              emptyText={"未找到作用域"}
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
