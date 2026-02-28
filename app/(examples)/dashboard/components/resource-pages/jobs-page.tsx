"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type JobRow = {
  id: string
  name: string
  status: string
  namespace: string
  duration: string
  retry: number
  age: string
  kind: "Job" | "CronJob"
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
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [jobType, setJobType] = React.useState<JobRow["kind"]>("Job")
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")

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
        const mapped: JobRow[] = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const status = item?.status || {}
          const name = metadata.name || "-"
          const kind = item?.kind === "CronJob" ? "CronJob" : "Job"
          return {
            id: String(metadata.uid ?? `${kind}-${name}-${index}`),
            name,
            status: kind === "CronJob" ? resolveCronJobStatus(item) : resolveJobStatus(item),
            namespace: String(metadata.namespace ?? "default"),
            duration: kind === "CronJob" ? "-" : resolveJobDuration(item),
            retry: Number(status.failed) || 0,
            age: formatAge(metadata.creationTimestamp),
            kind,
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
    if (row.kind !== jobType) return false
    if (nsQuery && !row.namespace.toLowerCase().includes(nsQuery)) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const jobTabs = (
    <Tabs value={jobType} onValueChange={(value) => setJobType(value as JobRow["kind"])} className="w-fit">
      <TabsList>
        <TabsTrigger value="Job">Job</TabsTrigger>
        <TabsTrigger value="CronJob">CronJob</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const jobFilters = (
    <>
      <Input
        value={namespaceQuery}
        onChange={(event) => setNamespaceQuery(event.target.value)}
        placeholder="名称空间"
        className="h-9 w-36"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder="名称"
        className="h-9 w-40"
      />
    </>
  )

  return (
    <DataTable
      data={filteredRows}
      columns={columns}
      toolbarStart={jobTabs}
      toolbarEnd={jobFilters}
    />
  )
}
