"use client"

import * as React from "react"
import { IconEye, IconInfoCircle, IconPencil, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  CreateServiceDialog,
  type ServiceDialogInitialValues,
} from "@/app/(console)/dashboard/components/resource-pages/services/create-service-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { fetchResourceByName, fetchResourceDescribe } from "@/app/lib/kubespark/common"
import {
  fetchServiceRows,
  type ServiceResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { deleteService } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/app/lib/i18n"

type ServiceRow = ServiceResourceRow

function getServiceColumns(t: (key: string) => string): ColumnConfig<ServiceRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "namespace", label: t("table.columns.namespace") },
    {
      key: "internalAccess",
      label: t("table.columns.internalAccess"),
      cell: (_value, row) =>
        // renderNameDescriptionCell(row.internalAccess, row.internalAccessType),
        renderNameDescriptionCell(row.internalAccess, null),
    },
    {
      key: "externalAccess",
      label: t("table.columns.externalAccess"),
      cell: (_value, row) =>
        // renderNameDescriptionCell(row.externalAccess, row.externalAccessType),
        renderNameDescriptionCell(row.externalAccess, null),
    },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

export function ServicesPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<ServiceRow[]>([])
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editInitialValues, setEditInitialValues] = React.useState<ServiceDialogInitialValues | null>(null)
  const [createNamespaceOptions, setCreateNamespaceOptions] = React.useState<
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
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<ServiceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: ServiceRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("serviceDialog.yamlSubtitleWithName", { namespace: row.namespace, name: row.name }))

    void fetchNamespacedResourceYaml("services", row.namespace, row.name, {
      documentType: "service",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Services] view yaml response", {
          service: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("serviceDialog.loadYamlFailed")
        setYamlError(message)
        console.error("[Services] view yaml request failed", {
          service: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const handleViewDescribe = React.useCallback((row: ServiceRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(t("serviceDialog.describeSubtitleWithName", { namespace: row.namespace, name: row.name }))

    void fetchResourceDescribe("core", "v1", "services", row.name, row.namespace)
      .then(({ text }) => {
        setDescribeContent(text || t("serviceDialog.describeNoContent"))
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("serviceDialog.loadDetailsFailed")
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [t])

  const requestDelete = React.useCallback((row: ServiceRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleEdit = React.useCallback((row: ServiceRow) => {
    void fetchResourceByName<unknown>("core", "v1", "services", row.name, {
      namespace: row.namespace,
    })
      .then(({ payload }) => {
        const resource =
          typeof payload === "object" && payload !== null && !Array.isArray(payload)
            ? (payload as Record<string, unknown>)
            : {}
        const metadata =
          typeof resource.metadata === "object" &&
          resource.metadata !== null &&
          !Array.isArray(resource.metadata)
            ? (resource.metadata as Record<string, unknown>)
            : {}
        const annotations =
          typeof metadata.annotations === "object" &&
          metadata.annotations !== null &&
          !Array.isArray(metadata.annotations)
            ? (metadata.annotations as Record<string, unknown>)
            : {}
        const labels =
          typeof metadata.labels === "object" &&
          metadata.labels !== null &&
          !Array.isArray(metadata.labels)
            ? (metadata.labels as Record<string, unknown>)
            : {}
        const spec =
          typeof resource.spec === "object" && resource.spec !== null && !Array.isArray(resource.spec)
            ? (resource.spec as Record<string, unknown>)
            : {}
        const selector =
          typeof spec.selector === "object" &&
          spec.selector !== null &&
          !Array.isArray(spec.selector)
            ? (spec.selector as Record<string, unknown>)
            : {}

        const rawPorts = Array.isArray(spec.ports) ? spec.ports : []
        const ports = rawPorts
          .map((rawPort) => {
            const portObj =
              typeof rawPort === "object" && rawPort !== null && !Array.isArray(rawPort)
                ? (rawPort as Record<string, unknown>)
                : {}
            const protocol = typeof portObj.protocol === "string" ? portObj.protocol.toUpperCase() : "TCP"
            const targetPort =
              typeof portObj.targetPort === "number"
                ? String(portObj.targetPort)
                : typeof portObj.targetPort === "string"
                  ? portObj.targetPort
                  : ""
            const servicePort =
              typeof portObj.port === "number"
                ? String(portObj.port)
                : typeof portObj.port === "string"
                  ? portObj.port
                  : ""
            const nodePort =
              typeof portObj.nodePort === "number"
                ? String(portObj.nodePort)
                : typeof portObj.nodePort === "string"
                  ? portObj.nodePort
                  : ""
            return {
              protocol: [
                "TCP",
                "UDP",
                "SCTP",
              ].includes(protocol)
                ? (protocol as
                    | "TCP"
                    | "UDP"
                    | "SCTP")
                : "TCP",
              name: typeof portObj.name === "string" ? portObj.name : "",
              targetPort,
              servicePort,
              nodePort,
            }
          })
          .filter((item) => item.targetPort || item.servicePort || item.name)

        setEditInitialValues({
          name: typeof metadata.name === "string" ? metadata.name : row.name,
          namespace: typeof metadata.namespace === "string" ? metadata.namespace : row.namespace,
          description: typeof annotations.description === "string" ? annotations.description : "",
          labels: Object.fromEntries(
            Object.entries(labels).filter(([, value]) => typeof value === "string")
          ) as Record<string, string>,
          annotations: Object.fromEntries(
            Object.entries(annotations).filter(([, value]) => typeof value === "string")
          ) as Record<string, string>,
          internalAccessMode: spec.clusterIP === "None" ? "headless" : "virtual-ip",
          selectors: Object.entries(selector).map(([key, value]) => ({
            key,
            value: typeof value === "string" ? value : String(value ?? ""),
          })),
          ports,
          enableNodePort:
            spec.clusterIP !== "None" && typeof spec.type === "string" && spec.type.toUpperCase() === "NODEPORT",
          enableSessionAffinity:
            typeof spec.sessionAffinity === "string" &&
            spec.sessionAffinity.toUpperCase() === "CLIENTIP",
        })
        setEditDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载服务详情失败"
        setError(message)
      })
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteService(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Services] delete request failed", {
          service: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: ServiceRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deleteService(row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Services] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<ServiceRow>({
        columns: getServiceColumns(t),
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
    [handleEdit, handleViewDescribe, handleViewYaml, requestDelete, t]
  )

  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [mapped, namespaces] = await Promise.all([
        fetchServiceRows(),
        fetchNamespaces(),
      ])
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
        console.error("[Services] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

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

  const serviceFilters = (
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
  )

  return (
    <>
      <CreateServiceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        namespaceOptions={createNamespaceOptions}
        onSubmitted={() => void refreshRows(false)}
      />
      <CreateServiceDialog
        mode="edit"
        open={editDialogOpen}
        onOpenChange={(nextOpen) => {
          setEditDialogOpen(nextOpen)
          if (!nextOpen) setEditInitialValues(null)
        }}
        initialValues={editInitialValues}
        namespaceOptions={createNamespaceOptions}
        onSubmitted={() => void refreshRows(false)}
      />
      <DescribeViewerDialog
        title={t("serviceDialog.viewDetailsTitle")}
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <MonacoViewerDialog
        title={t("serviceDialog.viewYamlTitle")}
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
        title="删除服务"
        description={
          pendingDeleteRow
            ? `确定删除服务 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => setCreateDialogOpen(true)}
        toolbarEnd={serviceFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}

