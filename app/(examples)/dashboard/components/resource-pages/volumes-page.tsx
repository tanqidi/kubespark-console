"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  fetchVolumeRows,
  type PersistentVolumeClaimResourceRow,
  type PersistentVolumeResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import {
  deletePersistentVolume,
  deletePersistentVolumeClaim,
} from "@/app/lib/kubespark/resource-delete"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type PersistentVolumeRow = PersistentVolumeResourceRow
type PersistentVolumeClaimRow = PersistentVolumeClaimResourceRow

const persistentVolumeColumns: ColumnConfig<PersistentVolumeRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "capacity", label: "容量", align: "right" },
  { key: "storageClass", label: "存储类" },
  { key: "accessMode", label: "访问模式" },
  { key: "reclaimPolicy", label: "回收策略" },
  { key: "status", label: "状态", render: "status" },
  { key: "node", label: "节点" },
  { key: "updatedAt", label: "更新时间" },
]

const persistentVolumeClaimColumns: ColumnConfig<PersistentVolumeClaimRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  { key: "capacity", label: "容量", align: "right" },
  { key: "storageClass", label: "存储类" },
  { key: "accessMode", label: "访问模式" },
  { key: "status", label: "状态", render: "status" },
  { key: "boundPV", label: "绑定 PV" },
  { key: "updatedAt", label: "更新时间" },
]

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return "API request failed"
}

export function VolumesPageClient() {
  const [persistentVolumes, setPersistentVolumes] = React.useState<PersistentVolumeRow[]>([])
  const [persistentVolumeClaims, setPersistentVolumeClaims] = React.useState<
    PersistentVolumeClaimRow[]
  >([])
  const [view, setView] = React.useState<"PVC" | "PV">("PVC")
  const [pvcNamespaceQuery, setPvcNamespaceQuery] = React.useState("")
  const [pvcNameQuery, setPvcNameQuery] = React.useState("")
  const [pvNameQuery, setPvNameQuery] = React.useState("")
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeletePvcRow, setPendingDeletePvcRow] = React.useState<PersistentVolumeClaimRow | null>(null)
  const [pendingDeletePvRow, setPendingDeletePvRow] = React.useState<PersistentVolumeRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewPvcYaml = React.useCallback((row: PersistentVolumeClaimRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedResourceYaml("persistentvolumeclaims", row.namespace, row.name, {
      documentType: "persistentvolumeclaim",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Volumes] view yaml response", {
          pvc: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Volumes] view yaml request failed", {
          pvc: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const handleViewPvYaml = React.useCallback((row: PersistentVolumeRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedResourceYaml("persistentvolumes", "", row.name, {
      group: "core",
      version: "v1",
      documentType: "persistentvolume",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Volumes] view yaml response", {
          pv: { name: row.name },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Volumes] view yaml request failed", {
          pv: { name: row.name },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDeletePvc = React.useCallback((row: PersistentVolumeClaimRow) => {
    setPendingDeletePvcRow(row)
  }, [])

  const requestDeletePv = React.useCallback((row: PersistentVolumeRow) => {
    setPendingDeletePvRow(row)
  }, [])

  const handleConfirmDeletePvc = React.useCallback(() => {
    if (!pendingDeletePvcRow || deleting) return
    setDeleting(true)
    void deletePersistentVolumeClaim(
      pendingDeletePvcRow.namespace,
      pendingDeletePvcRow.name
    )
      .then(() => {
        setPendingDeletePvcRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Volumes] delete request failed", {
          target: {
            kind: "pvc",
            name: pendingDeletePvcRow.name,
            namespace: pendingDeletePvcRow.namespace,
          },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeletePvcRow])

  const handleConfirmDeletePv = React.useCallback(() => {
    if (!pendingDeletePvRow || deleting) return
    setDeleting(true)
    void deletePersistentVolume(pendingDeletePvRow.name)
      .then(() => {
        setPendingDeletePvRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Volumes] delete request failed", {
          target: {
            kind: "pv",
            name: pendingDeletePvRow.name,
          },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeletePvRow])

  const handleDeleteSelectedPvcRows = React.useCallback(
    (selectedRows: PersistentVolumeClaimRow[]) => {
      if (selectedRows.length === 0) return
      void Promise.all(
        selectedRows.map((row) => deletePersistentVolumeClaim(row.namespace, row.name))
      ).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Volumes] bulk delete request failed", e)
      })
    },
    []
  )

  const handleDeleteSelectedPvRows = React.useCallback((selectedRows: PersistentVolumeRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deletePersistentVolume(row.name))).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Volumes] bulk delete request failed", e)
    })
  }, [])

  const pvcColumns = React.useMemo(
    () =>
      createColumns<PersistentVolumeClaimRow>({
        columns: persistentVolumeClaimColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
              </>
            ),
            onSelect: (row) => {
              handleViewPvcYaml(row)
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
              requestDeletePvc(row)
            },
          },
        ],
      }),
    [handleViewPvcYaml, requestDeletePvc]
  )

  const pvColumns = React.useMemo(
    () =>
      createColumns<PersistentVolumeRow>({
        columns: persistentVolumeColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
              </>
            ),
            onSelect: (row) => {
              handleViewPvYaml(row)
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
              requestDeletePv(row)
            },
          },
        ],
      }),
    [handleViewPvYaml, requestDeletePv]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const { persistentVolumeClaims: pvcRows, persistentVolumes: pvRows } =
          await fetchVolumeRows()
        if (cancelled) return
        setPersistentVolumeClaims(pvcRows)
        setPersistentVolumes(pvRows)
        setError(null)
      } catch (loadError: unknown) {
        if (cancelled) return
        if (!silent) {
          setPersistentVolumeClaims([])
          setPersistentVolumes([])
          setError(resolveErrorMessage(loadError))
        } else {
          console.error("[Volumes] polling refresh failed", loadError)
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
  // if (loading) {
  //   return <ResourceLoadingState />
  // } // kept for potential future use
  const pvcNamespaceOptions = React.useMemo(
    () =>
      Array.from(new Set(persistentVolumeClaims.map((row) => row.namespace)))
        .sort((a, b) => a.localeCompare(b))
        .map((namespace) => ({ id: namespace, name: namespace })),
    [persistentVolumeClaims]
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

  const volumeTabs = (
    <Tabs value={view} onValueChange={(value) => setView(value as "PVC" | "PV")} className="w-fit">
      <TabsList>
        <TabsTrigger value="PVC">{"持久卷声明"}</TabsTrigger>
        <TabsTrigger value="PV">{"持久卷"}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const pvcNsQuery = pvcNamespaceQuery.trim().toLowerCase()
  const pvcNmQuery = pvcNameQuery.trim().toLowerCase()
  const pvNmQuery = pvNameQuery.trim().toLowerCase()

  const filteredPvcRows = persistentVolumeClaims.filter((row) => {
    if (pvcNsQuery && row.namespace.toLowerCase() !== pvcNsQuery) return false
    if (pvcNmQuery && !row.name.toLowerCase().includes(pvcNmQuery)) return false
    return true
  })

  const filteredPvRows = persistentVolumes.filter((row) => {
    if (pvNmQuery && !row.name.toLowerCase().includes(pvNmQuery)) return false
    return true
  })

  const volumeFilters = view === "PVC" ? (
    <>
      <FilterCombobox
        options={pvcNamespaceOptions}
        value={pvcNamespaceQuery}
        onValueChange={setPvcNamespaceQuery}
        placeholder={"命名空间"}
        emptyText={"未找到命名空间"}
        className="w-40"
      />
      <Input
        value={pvcNameQuery}
        onChange={(event) => setPvcNameQuery(event.target.value)}
        placeholder={"名称"}
        className="h-9 w-40"
      />
    </>
  ) : (
    <>
      {/*<FilterCombobox
        options={[]}
        value=""
        placeholder={"命名空间"}
        className="w-40"
        disabled
        onValueChange={() => {}}
      />*/}
      <Input
        value={pvNameQuery}
        onChange={(event) => setPvNameQuery(event.target.value)}
        placeholder={"名称"}
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
        open={Boolean(pendingDeletePvcRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeletePvcRow(null)
        }}
        title="删除持久卷声明"
        description={
          pendingDeletePvcRow ? `确定删除持久卷声明 ${pendingDeletePvcRow.name} 吗？` : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDeletePvc}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeletePvRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeletePvRow(null)
        }}
        title="删除持久卷"
        description={pendingDeletePvRow ? `确定删除持久卷 ${pendingDeletePvRow.name} 吗？` : ""}
        deleting={deleting}
        onConfirm={handleConfirmDeletePv}
      />
      {view === "PVC" ? (
        <DataTable
          data={filteredPvcRows}
          columns={pvcColumns}
          toolbarStart={volumeTabs}
          toolbarEnd={volumeFilters}
          onCreate={() => {}}
          onDeleteSelectedRows={handleDeleteSelectedPvcRows}
        />
      ) : (
        <DataTable
          data={filteredPvRows}
          columns={pvColumns}
          toolbarStart={volumeTabs}
          toolbarEnd={volumeFilters}
          onCreate={() => {}}
          onDeleteSelectedRows={handleDeleteSelectedPvRows}
        />
      )}
    </>
  )
}
