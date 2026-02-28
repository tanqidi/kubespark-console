"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, formatDateTime } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type PodRow = {
  id: string
  name: string
  status: string
  namespace: string
  node: string
  ip: string
  age: string
  updatedAt: string
}

const columns = createColumns<PodRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "状态", render: "status" },
    { key: "namespace", label: "名称空间" },
    { key: "node", label: "节点" },
    { key: "ip", label: "IP" },
    { key: "age", label: "年龄" },
    { key: "updatedAt", label: "更新时间" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function resolvePodStatus(phase?: string): string {
  if (!phase) return "Unknown"
  return phase
}

export function PodsPageClient() {
  const [rows, setRows] = React.useState<PodRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<any>(`${BASE}/pods`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const status = item?.status || {}
          const spec = item?.spec || {}
          const name = metadata.name || "-"
          return {
            id: String(metadata.uid ?? `${name}-${index}`),
            name,
            status: resolvePodStatus(status.phase),
            namespace: String(metadata.namespace ?? "default"),
            node: String(spec.nodeName ?? status.hostIP ?? "-"),
            ip: String(status.podIP ?? "-"),
            age: formatAge(metadata.creationTimestamp),
            updatedAt: formatDateTime(status.startTime ?? metadata.creationTimestamp),
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
