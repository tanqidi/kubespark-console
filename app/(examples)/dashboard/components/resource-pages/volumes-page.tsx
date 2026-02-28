"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type VolumeRow = {
  id: string
  name: string
  capacity: string
  storageClass: string
  accessMode: string
  reclaimPolicy: string
  status: string
  node: string
}

const columns = createColumns<VolumeRow>({
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

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

export function VolumesPageClient() {
  const [rows, setRows] = React.useState<VolumeRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<any>(`${BASE}/persistentvolumes`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const spec = item?.spec || {}
          const status = item?.status || {}
          const access = Array.isArray(spec.accessModes) && spec.accessModes.length
            ? spec.accessModes.join(",")
            : "-"
          const node = spec.nodeAffinity?.required?.nodeSelectorTerms?.[0]?.matchExpressions?.[0]?.values?.[0] || "-"
          return {
            id: String(metadata.uid ?? `${metadata.name || "pv"}-${index}`),
            name: metadata.name || "-",
            capacity: spec.capacity?.storage || "-",
            storageClass: spec.storageClassName || "-",
            accessMode: access,
            reclaimPolicy: spec.persistentVolumeReclaimPolicy || "-",
            status: status.phase || "-",
            node,
          }
        })
        setRows(mapped)
      })
      .catch((e: any) => {
        if (!cancelled) {
          setRows([])
          setError(e?.message || "API request failed")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <div className="space-y-3 px-4 lg:px-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-48 w-full" /></div>
  if (error) return <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>

  return <DataTable data={rows} columns={columns} />
}
