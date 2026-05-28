"use client"

import * as React from "react"
import { IconEye, IconInfoCircle, IconPencil, IconRefresh, IconTrash } from "@tabler/icons-react"

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
import { createWorkload, rolloutWorkload, updateWorkload } from "@/app/lib/kubespark/workloads"
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
import { useTranslations } from "@/app/lib/i18n"
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"

type WorkloadRow = WorkloadResourceRow

function getWorkloadColumns(t: (key: string) => string): ColumnConfig<WorkloadRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "status", label: t("table.columns.status"), render: "status" as const },
    { key: "namespace", label: t("table.columns.namespace") },
    // { key: "desired", label: "期望" },
    // { key: "ready", label: "就绪" },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

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
  const t = useTranslations()
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
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<WorkloadRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [pendingRolloutRow, setPendingRolloutRow] = React.useState<WorkloadRow | null>(null)
  const [rollingOut, setRollingOut] = React.useState(false)

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
    setDescribeSubtitle(t("workloads.describeSubtitle", { kind: row.kind, namespace: row.namespace, name: row.name }))

    void fetchResourceDescribe("apps", "v1", resource, row.name, row.namespace)
      .then(({ text }) => {
        setDescribeContent(text || t("workloads.noDescribeOutput"))
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("workloads.loadDescribeFailed")
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [t])

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
    setYamlSubtitle(t("workloads.yamlSubtitle", { kind: row.kind, namespace: row.namespace, name: row.name }))

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
        const message = e instanceof Error ? e.message : t("workloads.loadYamlFailed")
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
  }, [t])

  const requestDelete = React.useCallback((row: WorkloadRow) => {
    setPendingDeleteRow(row)
  }, [])

  const requestRollout = React.useCallback((row: WorkloadRow) => {
    setPendingRolloutRow(row)
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
        const message = e instanceof Error ? e.message : t("workloads.loadWorkloadFailed")
        setError(message)
      })
  }, [t])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteWorkload(pendingDeleteRow.kind, pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("workloads.deleteFailed")
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
  }, [deleting, pendingDeleteRow, t])

  const handleConfirmRollout = React.useCallback(() => {
    if (!pendingRolloutRow || rollingOut) return
    setRollingOut(true)

    void rolloutWorkload({
      kind: pendingRolloutRow.kind,
      namespace: pendingRolloutRow.namespace,
      name: pendingRolloutRow.name,
    })
      .then(async () => {
        setPendingRolloutRow(null)
        await refreshRows(false)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("workloads.rolloutFailed")
        setError(message)
        console.error("[Workloads] rollout restart request failed", {
          kind: pendingRolloutRow.kind,
          workload: { name: pendingRolloutRow.name, namespace: pendingRolloutRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setRollingOut(false)
      })
  }, [pendingRolloutRow, refreshRows, rollingOut, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: WorkloadRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deleteWorkload(row.kind, row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : t("workloads.deleteFailed")
      setError(message)
      console.error("[Workloads] bulk delete request failed", e)
    })
  }, [t])

  const columns = React.useMemo(
    () =>
      createColumns<WorkloadRow>({
        columns: getWorkloadColumns(t),
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("actions.viewYaml")}
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
                {t("actions.details")}
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
                {t("actions.edit")}
              </>
            ),
            onSelect: (row) => {
              handleEdit(row)
            },
          },
          {
            label: (
              <>
                <IconRefresh className="size-4" />
                {t("actions.rollout")}
              </>
            ),
            disabled: (row) =>
              rollingOut &&
              pendingRolloutRow?.kind === row.kind &&
              pendingRolloutRow?.namespace === row.namespace &&
              pendingRolloutRow?.name === row.name,
            onSelect: (row) => {
              requestRollout(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("actions.delete")}
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
    [handleEdit, handleViewDescribe, handleViewYaml, pendingRolloutRow, requestDelete, requestRollout, rollingOut, t]
  )

  React.useEffect(() => {
    void refreshRows(false)
  }, [refreshRows])

  useIntervalRefresh(() => refreshRows(true), 3000)

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
          <AlertTitle>{t("actions.loadFailed")}</AlertTitle>
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
        <TabsTrigger value="Deployment">{t("actions.deployment")}</TabsTrigger>
        <TabsTrigger value="StatefulSet">{t("actions.statefulSet")}</TabsTrigger>
        <TabsTrigger value="DaemonSet">{t("actions.daemonSet")}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const workloadFilters = (
    <>
      <FilterCombobox
        options={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={t("table.columns.namespace")}
        emptyText={t("actions.noNamespaceFound")}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={t("table.columns.name")}
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
        title={t("actions.viewDetailsTitle")}
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <MonacoViewerDialog
        title={t("actions.viewYamlTitle")}
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
        title={t("actions.deleteWorkloadTitle")}
        description={
          pendingDeleteRow
            ? t("workloads.deleteConfirm", { name: pendingDeleteRow.name })
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingRolloutRow)}
        onOpenChange={(open) => {
          if (!open && !rollingOut) setPendingRolloutRow(null)
        }}
        title={t("workloads.rolloutTitle")}
        description={
          pendingRolloutRow
            ? t("workloads.rolloutConfirm", { name: pendingRolloutRow.name })
            : ""
        }
        deleting={rollingOut}
        actionLabel={t("actions.rollout")}
        pendingLabel={t("workloads.rollingOut")}
        actionVariant="default"
        onConfirm={handleConfirmRollout}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => setCreateDialogOpen(true)}
        enableRowNavigation
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
