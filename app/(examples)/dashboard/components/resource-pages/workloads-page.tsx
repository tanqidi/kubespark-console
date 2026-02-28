"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type WorkloadRow = {
  id: string
  name: string
  status: string
  namespace: string
  desired: number
  updated: number
  available: number
  ready: number
  age: string
}

const columns = createColumns<WorkloadRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "状态", render: "status" },
    { key: "namespace", label: "名称空间" },
    { key: "desired", label: "期望", align: "right" },
    { key: "updated", label: "更新", align: "right" },
    { key: "available", label: "可用", align: "right" },
    { key: "ready", label: "就绪", align: "right" },
    { key: "age", label: "年龄" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function resolveWorkloadStatus(desired: number, updated: number, available: number, ready: number): string {
  if (ready >= Math.max(1, desired) || available >= desired) return "Normal"
  if (ready > 0 || updated > 0) return "Updating"
  return "Abnormal"
}

export function WorkloadsPageClient() {
  const [rows, setRows] = React.useState<WorkloadRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchJsonDeduped<any>(`${BASE}/deployments`),
      fetchJsonDeduped<any>(`${BASE}/daemonsets`),
      fetchJsonDeduped<any>(`${BASE}/statefulsets`),
    ])
      .then((results) => {
        if (cancelled) return
        const items = results.flatMap((json) => unwrapItems(json))
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const desired = item?.spec?.replicas ?? item?.status?.desiredNumberScheduled ?? 0
          const updated = item?.status?.updatedReplicas ?? item?.status?.updatedNumberScheduled ?? 0
          const available = item?.status?.availableReplicas ?? item?.status?.numberAvailable ?? 0
          const ready = item?.status?.readyReplicas ?? item?.status?.numberReady ?? 0
          const name = metadata.name || "-"
          return {
            id: String(metadata.uid ?? `${name}-${index}`),
            name,
            status: resolveWorkloadStatus(desired, updated, available, ready),
            namespace: String(metadata.namespace ?? "default"),
            desired,
            updated,
            available,
            ready,
            age: formatAge(metadata.creationTimestamp),
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

  if (loading) {
    return (
      <div className="space-y-3 px-4 lg:px-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return <DataTable data={rows} columns={columns} />
}
