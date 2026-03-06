"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns, type ColumnConfig } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  fetchWorkloadRows,
  type WorkloadResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { deleteWorkload } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import type { ResourceDocumentType } from "@/app/lib/kubespark/resource-document"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs"

type WorkloadRow = WorkloadResourceRow

const workloadColumns: ColumnConfig<WorkloadRow>[] = [
  { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
  { key: "status", label: "\u72b6\u6001", render: "status" as const },
  { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
  { key: "desired", label: "\u671f\u671b", align: "right" as const },
  { key: "updated", label: "\u66f4\u65b0", align: "right" as const },
  { key: "available", label: "\u53ef\u7528", align: "right" as const },
  { key: "ready", label: "\u5c31\u7eea", align: "right" as const },
  { key: "age", label: "\u8fd0\u884c\u65f6\u95f4" },
  { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
]

const WORKLOAD_RESOURCE_BY_KIND: Record<WorkloadRow["kind"], string> = {
  Deployment: "deployments",
  StatefulSet: "statefulsets",
  DaemonSet: "daemonsets",
}

const WORKLOAD_DOCUMENT_BY_KIND: Record<WorkloadRow["kind"], ResourceDocumentType> = {
  Deployment: "deployment",
  StatefulSet: "statefulset",
  DaemonSet: "daemonset",
}

export function WorkloadsPageClient() {
  const [rows, setRows] = React.useState<WorkloadRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [typeFilter, setTypeFilter] = React.useState<WorkloadRow["kind"]>("Deployment")
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<WorkloadRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: WorkloadRow) => {
    const resource = WORKLOAD_RESOURCE_BY_KIND[row.kind]
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedResourceYaml(resource, row.namespace, row.name, {
      documentType: WORKLOAD_DOCUMENT_BY_KIND[row.kind],
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Workloads] view yaml response", {
          kind: row.kind,
          resource,
          workload: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Workloads] view yaml request failed", {
          kind: row.kind,
          resource,
          workload: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: WorkloadRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteWorkload(pendingDeleteRow.kind, pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Workloads] delete request failed", {
          kind: pendingDeleteRow.kind,
          workload: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: WorkloadRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deleteWorkload(row.kind, row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Workloads] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<WorkloadRow>({
        columns: workloadColumns,
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
        const mapped = await fetchWorkloadRows()
        if (cancelled) return
        setRows(mapped)
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[Workloads] polling refresh failed", e)
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
    if (row.kind !== typeFilter) return false
    if (nsQuery && row.namespace.toLowerCase() !== nsQuery) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const workloadTabs = (
    <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as WorkloadRow["kind"])} className="w-fit">
      <TabsList>
        <TabsTrigger value="Deployment">{"\u90e8\u7f72"}</TabsTrigger>
        <TabsTrigger value="StatefulSet">{"\u6709\u72b6\u6001\u526f\u672c\u96c6"}</TabsTrigger>
        <TabsTrigger value="DaemonSet">{"\u5b88\u62a4\u8fdb\u7a0b\u96c6"}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const workloadFilters = (
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
        title="删除工作负载"
        description={
          pendingDeleteRow
            ? `确定删除工作负载 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarStart={workloadTabs}
        toolbarEnd={workloadFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
