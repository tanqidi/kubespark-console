"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type JobRow = {
  id: string
  name: string
  status: string
  namespace: string
  duration: string
  retry: number
  age: string
}

const columns = createColumns<JobRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "状态", render: "status" },
    { key: "namespace", label: "名称空间" },
    { key: "duration", label: "时长", align: "right" },
    { key: "retry", label: "重试", align: "right" },
    { key: "age", label: "年龄" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function resolveJobStatus(item: any): string {
  const status = item?.status || {}
  if (status.succeeded && status.succeeded > 0) return "Succeeded"
  if (status.active && status.active > 0) return "Running"
  if (status.failed && status.failed > 0) return "Failed"
  return "Pending"
}

function resolveCronJobStatus(item: any): string {
  const status = item?.status || {}
  const activeJobs = Array.isArray(status.active) ? status.active.length : 0
  if (activeJobs > 0) return "Running"
  if (status.lastScheduleTime) return "Succeeded"
  return "Pending"
}

function resolveJobDuration(item: any): string {
  const status = item?.status || {}
  const start = Date.parse(status.startTime ?? "")
  const end = Date.parse(status.completionTime ?? "")
  if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
    const sec = Math.max(1, Math.round((end - start) / 1000))
    return `${sec}s`
  }
  return "-"
}

export function JobsPageClient() {
  const [rows, setRows] = React.useState<JobRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchJsonDeduped<any>(`${BASE}/jobs`),
      fetchJsonDeduped<any>(`${BASE}/cronjobs`),
    ])
      .then((results) => {
        if (cancelled) return
        const items = results.flatMap((json) => unwrapItems(json))
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const status = item?.status || {}
          const name = metadata.name || "-"
          const kind = item?.kind || "Job"
          const isCronJob = kind === "CronJob"
          return {
            id: String(metadata.uid ?? `${kind}-${name}-${index}`),
            name,
            status: isCronJob ? resolveCronJobStatus(item) : resolveJobStatus(item),
            namespace: String(metadata.namespace ?? "default"),
            duration: isCronJob ? "-" : resolveJobDuration(item),
            retry: Number(status.failed) || 0,
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

  if (loading) return <div className="space-y-3 px-4 lg:px-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-48 w-full" /></div>
  if (error) return <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>

  return <DataTable data={rows} columns={columns} />
}
