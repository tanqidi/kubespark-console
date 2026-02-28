"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

type Row = {
  id: number
  header: string
  type: string
  status: string
  target: string
  limit: string
  reviewer: string
}

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

const endpointMap: Record<string, string | string[]> = {
  workloads: [`${BASE}/deployments`, `${BASE}/daemonsets`, `${BASE}/statefulsets`],
  jobs: [`${BASE}/jobs`, `${BASE}/cronjobs`],
  pods: `${BASE}/pods`,
  services: `${BASE}/services`,
  routes: `${BASE}/ingresses`,
}

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function mapRows(key: string, items: any[]): Row[] {
  return items.slice(0, 300).map((item, index) => {
    switch (key) {
      case "workloads": {
        const kind = item?.kind ?? "Workload"
        const desired = item?.spec?.replicas ?? item?.status?.desiredNumberScheduled ?? 0
        const ready = item?.status?.readyReplicas ?? item?.status?.numberReady ?? 0
        return {
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: kind,
          status: ready > 0 ? "Done" : "In Process",
          target: String(ready),
          limit: String(desired),
          reviewer: item?.metadata?.namespace ?? "default",
        }
      }
      case "jobs": {
        const succeeded = item?.status?.succeeded ?? 0
        const failed = item?.status?.failed ?? 0
        const active = item?.status?.active ?? 0
        const done = succeeded > 0 || (item?.kind === "CronJob" && active === 0)
        return {
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: item?.kind ?? "Job",
          status: done ? "Done" : "In Process",
          target: String(succeeded || active),
          limit: String(failed),
          reviewer: item?.metadata?.namespace ?? "default",
        }
      }
      case "pods":
        return {
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: "Pod",
          status: item?.status?.phase === "Running" ? "Done" : "In Process",
          target: String(item?.status?.phase ?? "Unknown"),
          limit: String(item?.status?.podIP ?? "-"),
          reviewer: item?.spec?.nodeName ?? "-",
        }
      case "services":
        return {
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: "Service",
          status: "Done",
          target: String(item?.spec?.type ?? "ClusterIP"),
          limit: String(item?.spec?.clusterIP ?? "-"),
          reviewer: item?.metadata?.namespace ?? "default",
        }
      case "routes": {
        const rule = item?.spec?.rules?.[0]
        const path = rule?.http?.paths?.[0]
        return {
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: "Ingress",
          status: "Done",
          target: String(rule?.host ?? "-"),
          limit: String(path?.path ?? "/"),
          reviewer: path?.backend?.service?.name ?? "-",
        }
      }
      default:
        return {
          id: index + 1,
          header: "-",
          type: "-",
          status: "In Process",
          target: "-",
          limit: "-",
          reviewer: "-",
        }
    }
  })
}

export function WorkloadsTableClient({ slugKey }: { slugKey: string }) {
  const [rows, setRows] = React.useState<Row[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const endpoint = endpointMap[slugKey]
    if (!endpoint) {
      setRows([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const run = async () => {
      try {
        const urls = Array.isArray(endpoint) ? endpoint : [endpoint]
        const results = await Promise.all(urls.map((u) => fetchJsonDeduped<any>(u)))
        const merged = results.flatMap((json) => unwrapItems(json))
        if (!cancelled) setRows(mapRows(slugKey, merged))
      } catch (e: any) {
        if (!cancelled) {
          setRows([])
          setError(e?.message || "API request failed")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [slugKey])

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

  return <DataTable data={rows} />
}
