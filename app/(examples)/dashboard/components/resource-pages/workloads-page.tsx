"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

export function WorkloadsPageClient() {
  const [rows, setRows] = React.useState<any[]>([])
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
          const desired = item?.spec?.replicas ?? item?.status?.desiredNumberScheduled ?? 0
          const updated = item?.status?.updatedReplicas ?? item?.status?.updatedNumberScheduled ?? 0
          const available = item?.status?.availableReplicas ?? item?.status?.numberAvailable ?? 0
          const ready = item?.status?.readyReplicas ?? item?.status?.numberReady ?? 0
          return {
            id: index + 1,
            header: item?.metadata?.name ?? "-",
            type: item?.kind ?? "Workload",
            status: ready >= Math.max(1, desired) ? "Done" : "In Process",
            target: String(item?.metadata?.namespace ?? "default"),
            limit: `${ready}/${desired} (u:${updated}, a:${available})`,
            reviewer: formatAge(item?.metadata?.creationTimestamp),
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

  return <DataTable data={rows} columns={createColumns({ header: "名称", type: "类型", status: "状态", target: "名称空间", limit: "值", reviewer: "补充信息" })} />
}
