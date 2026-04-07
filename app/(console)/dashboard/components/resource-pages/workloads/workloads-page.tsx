"use client"

import * as React from "react"
import { IconEye, IconInfoCircle, IconPencil, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { CreateWorkloadDialog } from "@/app/(console)/dashboard/components/resource-pages/workloads/create-workload-dialog"
import { parseWorkloadPayload } from "@/app/(console)/dashboard/components/resource-pages/workloads/create-workload-dialog.logic"
import type { WorkloadDialogInitialValues } from "@/app/(console)/dashboard/components/resource-pages/workloads/create-workload-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  fetchWorkloadRows,
  type WorkloadResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { deleteWorkload } from "@/app/lib/kubespark/resource-delete"
import { createWorkload, updateWorkload } from "@/app/lib/kubespark/workloads"
import { fetchResourceByName, fetchResourceDescribe } from "@/app/lib/kubespark/common"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import type { ResourceDocumentType } from "@/app/lib/kubespark/resource-document"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type WorkloadRow = WorkloadResourceRow

const workloadColumns: ColumnConfig<WorkloadRow>[] = [
  {
    key: "name",
    label: "\u540d\u79f0",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "status", label: "\u72b6\u6001", render: "status" as const },
  { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
  { key: "desired", label: "\u671f\u671b", align: "right" as const },
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
  const [createNamespaceOptions, setCreateNamespaceOptions] = React.useState<Array<{ id: string; name: string }>>([])
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editKind, setEditKind] = React.useState<WorkloadRow["kind"]>("Deployment")
  const [editInitialValues, setEditInitialValues] = React.useState<WorkloadDialogInitialValues | null>(null)
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [typeFilter, setTypeFilter] = React.useState<WorkloadRow["kind"]>("Deployment")
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("查看 Kubernetes 工作负载的详情内容。")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<WorkloadRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [mapped, namespacesResult] = await Promise.all([
        fetchWorkloadRows(),
        fetchNamespaces().catch(() => []),
      ])
      const namespaces = namespacesResult
      setRows(mapped)
      setCreateNamespaceOptions(
        namespaces
          .map((item) => ({ id: item.name, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "API request failed")
      } else {
        console.error("[Workloads] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const handleViewDescribe = React.useCallback((row: WorkloadRow) => {
    const resource = WORKLOAD_RESOURCE_BY_KIND[row.kind]
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(`查看 Kubernetes ${row.kind}（${row.namespace}/${row.name}）的详情内容。`)

    void fetchResourceDescribe("apps", "v1", resource, row.name, row.namespace)
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

  const handleCreateSubmit = React.useCallback(
    async (payload: Parameters<typeof createWorkload>[0]) => {
      await createWorkload(payload)
      await refreshRows(false)
    },
    [refreshRows]
  )

  const handleEditSubmit = React.useCallback(
    async (payload: Parameters<typeof updateWorkload>[0]) => {
      await updateWorkload(payload)
      await refreshRows(false)
    },
    [refreshRows]
  )

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

  const handleEdit = React.useCallback((row: WorkloadRow) => {
    const resource = WORKLOAD_RESOURCE_BY_KIND[row.kind]
    void fetchResourceByName<unknown>("apps", "v1", resource, row.name, {
      namespace: row.namespace,
    })
      .then(({ payload }) => {
        setEditKind(row.kind)
        setEditInitialValues(parseWorkloadPayload(row.kind, payload))
        setEditDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载工作负载详情失败"
        setError(message)
      })
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
                <IconInfoCircle className="size-4" />
                {"详情"}
              </>
            ),
            onSelect: (row) => {
              handleViewDescribe(row)
            },
          },
          {
            label: (
              <>
                <IconPencil className="size-4" />
                {"编辑"}
              </>
            ),
            onSelect: (row) => {
              handleEdit(row)
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
    [handleEdit, handleViewDescribe, handleViewYaml, requestDelete]
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
      <CreateWorkloadDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        kind={typeFilter}
        namespaceOptions={createNamespaceOptions}
        onSubmit={handleCreateSubmit}
      />
      <CreateWorkloadDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditInitialValues(null)
          }
        }}
        mode="edit"
        kind={editKind}
        namespaceOptions={createNamespaceOptions}
        initialValues={editInitialValues}
        onSubmit={handleEditSubmit}
      />
      <DescribeViewerDialog
        title="查看详情"
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
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
        onCreate={() => setCreateDialogOpen(true)}
        getRowHref={(row) =>
          `/dashboard/workloads/${encodeURIComponent(row.namespace)}/${encodeURIComponent(row.name)}?kind=${encodeURIComponent(row.kind)}`
        }
        toolbarStart={workloadTabs}
        toolbarEnd={workloadFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
