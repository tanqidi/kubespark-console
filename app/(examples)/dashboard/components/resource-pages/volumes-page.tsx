"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type JsonObject = Record<string, unknown>

type PersistentVolumeRow = {
  id: string
  name: string
  capacity: string
  storageClass: string
  accessMode: string
  reclaimPolicy: string
  status: string
  node: string
}

type PersistentVolumeClaimRow = {
  id: string
  name: string
  namespace: string
  capacity: string
  storageClass: string
  accessMode: string
  status: string
  boundPV: string
}

const persistentVolumeColumns = createColumns<PersistentVolumeRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "capacity", label: "容量", align: "right" },
    { key: "storageClass", label: "存储类" },
    { key: "accessMode", label: "访问模式" },
    { key: "reclaimPolicy", label: "回收策略" },
    { key: "status", label: "状态", render: "status" },
    { key: "node", label: "节点" },
  ],
})

const persistentVolumeClaimColumns = createColumns<PersistentVolumeClaimRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "名称空间" },
    { key: "capacity", label: "容量", align: "right" },
    { key: "storageClass", label: "存储类" },
    { key: "accessMode", label: "访问模式" },
    { key: "status", label: "状态", render: "status" },
    { key: "boundPV", label: "绑定 PV" },
  ],
})

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asObject(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

function asString(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

function unwrapItems(payload: unknown): unknown[] {
  const root = asObject(payload)
  const container = root.data ?? payload
  const items = asObject(container).items
  return Array.isArray(items) ? items : []
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (isObject(error) && typeof error.message === "string") return error.message
  return "API request failed"
}

function mapPersistentVolumes(items: unknown[]): PersistentVolumeRow[] {
  return items.slice(0, 300).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const status = asObject(resource.status)

    const accessModes = asStringList(spec.accessModes)
    const accessMode = accessModes.length ? accessModes.join(",") : "-"

    const nodeAffinity = asObject(spec.nodeAffinity)
    const required = asObject(nodeAffinity.required)
    const selectorTerms = Array.isArray(required.nodeSelectorTerms) ? required.nodeSelectorTerms : []
    const firstTerm = selectorTerms[0]
    const matchExpressions = Array.isArray(asObject(firstTerm).matchExpressions)
      ? (asObject(firstTerm).matchExpressions as unknown[])
      : []
    const firstExpression = matchExpressions[0]
    const values = asStringList(asObject(firstExpression).values)
    const node = values[0] ?? "-"

    const capacity = asObject(spec.capacity)

    return {
      id: asString(metadata.uid, `${asString(metadata.name, "pv")}-${index}`),
      name: asString(metadata.name),
      capacity: asString(capacity.storage),
      storageClass: asString(spec.storageClassName),
      accessMode,
      reclaimPolicy: asString(spec.persistentVolumeReclaimPolicy),
      status: asString(status.phase),
      node,
    }
  })
}

function mapPersistentVolumeClaims(items: unknown[]): PersistentVolumeClaimRow[] {
  return items.slice(0, 300).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const status = asObject(resource.status)

    const accessModes = asStringList(spec.accessModes)
    const accessMode = accessModes.length ? accessModes.join(",") : "-"

    const specResources = asObject(spec.resources)
    const requests = asObject(specResources.requests)
    const capacity = asString(asObject(status.capacity).storage, asString(requests.storage))

    return {
      id: asString(
        metadata.uid,
        `${asString(metadata.namespace, "default")}-${asString(metadata.name, "pvc")}-${index}`
      ),
      name: asString(metadata.name),
      namespace: asString(metadata.namespace, "default"),
      capacity,
      storageClass: asString(spec.storageClassName),
      accessMode,
      status: asString(status.phase),
      boundPV: asString(spec.volumeName),
    }
  })
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

    Promise.all([
      fetchJsonDeduped<unknown>(`${BASE}/persistentvolumeclaims`),
      fetchJsonDeduped<unknown>(`${BASE}/persistentvolumes`),
    ])
      .then(([pvcJson, pvJson]) => {
        if (cancelled) return
        setPersistentVolumeClaims(mapPersistentVolumeClaims(unwrapItems(pvcJson)))
        setPersistentVolumes(mapPersistentVolumes(unwrapItems(pvJson)))
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
        <TabsTrigger value="PVC">PVC</TabsTrigger>
        <TabsTrigger value="PV">PV</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const pvcNsQuery = pvcNamespaceQuery.trim().toLowerCase()
  const pvcNmQuery = pvcNameQuery.trim().toLowerCase()
  const pvNmQuery = pvNameQuery.trim().toLowerCase()

  const filteredPvcRows = persistentVolumeClaims.filter((row) => {
    if (pvcNsQuery && !row.namespace.toLowerCase().includes(pvcNsQuery)) return false
    if (pvcNmQuery && !row.name.toLowerCase().includes(pvcNmQuery)) return false
    return true
  })

  const filteredPvRows = persistentVolumes.filter((row) => {
    if (pvNmQuery && !row.name.toLowerCase().includes(pvNmQuery)) return false
    return true
  })

  const volumeFilters = view === "PVC" ? (
    <>
      <Input
        value={pvcNamespaceQuery}
        onChange={(event) => setPvcNamespaceQuery(event.target.value)}
        placeholder="名称空间"
        className="h-9 w-36"
      />
      <Input
        value={pvcNameQuery}
        onChange={(event) => setPvcNameQuery(event.target.value)}
        placeholder="名称"
        className="h-9 w-40"
      />
    </>
  ) : (
    <>
      <Input
        value=""
        readOnly
        disabled
        placeholder="名称空间"
        className="h-9 w-36"
      />
      <Input
        value={pvNameQuery}
        onChange={(event) => setPvNameQuery(event.target.value)}
        placeholder="名称"
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
