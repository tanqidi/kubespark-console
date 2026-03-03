"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  fetchVolumeRows,
  type PersistentVolumeClaimResourceRow,
  type PersistentVolumeResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs"

type PersistentVolumeRow = PersistentVolumeResourceRow
type PersistentVolumeClaimRow = PersistentVolumeClaimResourceRow

const persistentVolumeColumns = createColumns<PersistentVolumeRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "capacity", label: "\u5bb9\u91cf", align: "right" },
    { key: "storageClass", label: "\u5b58\u50a8\u7c7b" },
    { key: "accessMode", label: "\u8bbf\u95ee\u6a21\u5f0f" },
    { key: "reclaimPolicy", label: "\u56de\u6536\u7b56\u7565" },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "node", label: "\u8282\u70b9" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

const persistentVolumeClaimColumns = createColumns<PersistentVolumeClaimRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "capacity", label: "\u5bb9\u91cf", align: "right" },
    { key: "storageClass", label: "\u5b58\u50a8\u7c7b" },
    { key: "accessMode", label: "\u8bbf\u95ee\u6a21\u5f0f" },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "boundPV", label: "\u7ed1\u5b9a PV" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
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

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchVolumeRows()
      .then(({ persistentVolumeClaims: pvcRows, persistentVolumes: pvRows }) => {
        if (cancelled) return
        setPersistentVolumeClaims(pvcRows)
        setPersistentVolumes(pvRows)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPersistentVolumeClaims([])
          setPersistentVolumes([])
          setError(resolveErrorMessage(error))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
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
          <AlertTitle>{"\u52a0\u8f7d\u5931\u8d25"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const volumeTabs = (
    <Tabs value={view} onValueChange={(value) => setView(value as "PVC" | "PV")} className="w-fit">
      <TabsList>
        <TabsTrigger value="PVC">{"\u6301\u4e45\u5377\u58f0\u660e"}</TabsTrigger>
        <TabsTrigger value="PV">{"\u6301\u4e45\u5377"}</TabsTrigger>
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
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        emptyText={"\u672a\u627e\u5230\u540d\u79f0\u7a7a\u95f4"}
        className="w-40"
      />
      <Input
        value={pvcNameQuery}
        onChange={(event) => setPvcNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
        className="h-9 w-40"
      />
    </>
  ) : (
    <>
      <FilterCombobox
        options={[]}
        value=""
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        className="w-40"
        disabled
        onValueChange={() => {}}
      />
      <Input
        value={pvNameQuery}
        onChange={(event) => setPvNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
        className="h-9 w-40"
      />
    </>
  )

  return view === "PVC" ? (
    <DataTable
      data={filteredPvcRows}
      columns={persistentVolumeClaimColumns}
      toolbarStart={volumeTabs}
      toolbarEnd={volumeFilters}
    />
  ) : (
    <DataTable
      data={filteredPvRows}
      columns={persistentVolumeColumns}
      toolbarStart={volumeTabs}
      toolbarEnd={volumeFilters}
    />
  )
}
