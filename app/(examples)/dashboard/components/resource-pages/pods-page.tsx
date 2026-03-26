"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { CreatePodDialog } from "@/app/(examples)/dashboard/components/resource-pages/create-pod-dialog"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
} from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  deletePod,
  createPod,
  fetchNamespacedPodYaml,
  fetchPodResourceRows,
  type PodResourceRow,
} from "@/app/lib/kubespark/pods"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

type PodRow = PodResourceRow

export function PodsPageClient() {
  const [rows, setRows] = React.useState<PodRow[]>([])
  const [createNamespaceOptions, setCreateNamespaceOptions] = React.useState<Array<{ id: string; name: string }>>([])
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<PodRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: PodRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedPodYaml(row.namespace, row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Pods] view yaml response", {
          pod: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Pods] view yaml request failed", {
          pod: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: PodRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deletePod(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Pods] delete request failed", {
          pod: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: PodRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deletePod(row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Pods] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<PodRow>({
        columns: [
          {
            key: "name",
            label: "\u540d\u79f0",
            enableHiding: false,
            cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
          },
          { key: "status", label: "\u72b6\u6001", render: "status" },
          { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
          { key: "node", label: "\u8282\u70b9" },
          { key: "ip", label: "IP" },
          { key: "age", label: "\u8fd0\u884c\u65f6\u95f4" },
          { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
        ],
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"\u67e5\u770b YAML"}
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
                {"\u5220\u9664"}
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
        const [mapped, namespacesResult] = await Promise.all([
          fetchPodResourceRows(),
          fetchNamespaces().catch(() => []),
        ])
        if (cancelled) return
        setRows(mapped)
        setCreateNamespaceOptions(
          namespacesResult
            .map((item) => ({ id: item.name, name: item.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[Pods] polling refresh failed", e)
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

  const namespaceOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.namespace)))
        .sort((a, b) => a.localeCompare(b))
        .map((namespace) => ({ id: namespace, name: namespace })),
    [rows]
  )

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{"\u52a0\u8f7d\u5931\u8d25"}</AlertTitle>
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

  const podFilters = (
    <>
      <FilterCombobox
        options={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        emptyText={"\u672a\u627e\u5230\u540d\u79f0\u7a7a\u95f4"}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
        className="h-9 w-40"
      />
    </>
  )

  return (
    <>
      <CreatePodDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        namespaceOptions={createNamespaceOptions}
        onSubmit={async (payload) => {
          await createPod(payload)
          const [mapped, namespacesResult] = await Promise.all([
            fetchPodResourceRows(),
            fetchNamespaces().catch(() => []),
          ])
          setRows(mapped)
          setCreateNamespaceOptions(
            namespacesResult
              .map((item) => ({ id: item.name, name: item.name }))
              .sort((a, b) => a.name.localeCompare(b.name))
          )
          setError(null)
        }}
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
        title="删除容器组"
        description={
          pendingDeleteRow
            ? `确定删除容器组 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarEnd={podFilters}
        onCreate={() => setCreateDialogOpen(true)}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
