"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { CreateKeyValueResourceDialog } from "@/app/(examples)/dashboard/components/resource-pages/create-key-value-resource-dialog"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  fetchConfigMapRows,
  type ConfigMapResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { createConfigMap } from "@/app/lib/kubespark/resource-create"
import { deleteConfigMap } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

type ConfigMapRow = ConfigMapResourceRow

const configMapColumns: ColumnConfig<ConfigMapRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  { key: "dataItems", label: "数据项", align: "right" },
  { key: "size", label: "大小", align: "right" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function ConfigMapsPageClient() {
  const [rows, setRows] = React.useState<ConfigMapRow[]>([])
  const [namespaceOptions, setNamespaceOptions] = React.useState<
    Array<{ id: string; name: string }>
  >([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<ConfigMapRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const isMountedRef = React.useRef(true)

  const handleViewYaml = React.useCallback((row: ConfigMapRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedResourceYaml("configmaps", row.namespace, row.name, {
      documentType: "configmap",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[ConfigMaps] view yaml response", {
          configmap: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[ConfigMaps] view yaml request failed", {
          configmap: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: ConfigMapRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteConfigMap(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[ConfigMaps] delete request failed", {
          configmap: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: ConfigMapRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deleteConfigMap(row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[ConfigMaps] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<ConfigMapRow>({
        columns: configMapColumns,
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

  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const [mapped, namespaces] = await Promise.all([
        fetchConfigMapRows(),
        fetchNamespaces(),
      ])
      if (!isMountedRef.current) return
      setRows(mapped)
      setNamespaceOptions(
        namespaces
          .map((item) => ({ id: item.name, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setError(null)
    } catch (e: unknown) {
      if (!isMountedRef.current) return
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "API request failed")
      } else {
        console.error("[ConfigMaps] polling refresh failed", e)
      }
    } finally {
      if (!silent && isMountedRef.current) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleCreateSubmit = React.useCallback(
    async (payload: {
      name: string
      namespace: string
      description: string
      items: Array<{ key: string; value: string }>
    }) => {
      await createConfigMap({
        name: payload.name,
        namespace: payload.namespace,
        description: payload.description,
        data: Object.fromEntries(payload.items.map((item) => [item.key, item.value])),
      })
      await refreshRows(false)
    },
    [refreshRows]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      await refreshRows(silent)
      if (cancelled) return
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

  const configMapFilters = (
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
  )

  return (
    <>
      <CreateKeyValueResourceDialog
        kind="configmap"
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        namespaceOptions={namespaceOptions}
        onSubmit={handleCreateSubmit}
      />
      <MonacoViewerDialog
        title="查看YAML"
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
        title="删除配置字典"
        description={
          pendingDeleteRow
            ? `确定删除配置字典 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => setCreateDialogOpen(true)}
        toolbarEnd={configMapFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
