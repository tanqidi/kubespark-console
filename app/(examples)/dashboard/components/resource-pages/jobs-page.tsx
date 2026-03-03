"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { PresetSelector } from "@/components/ui/preset-selector"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, resolveUpdatedAt } from "@/app/lib/kubespark/utils"
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
  updatedAt: string
  kind: "Job" | "CronJob"
}

const columns = createColumns<JobRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "duration", label: "\u65f6\u957f", align: "right" },
    { key: "retry", label: "\u91cd\u8bd5", align: "right" },
    { key: "age", label: "运行时间" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
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
            updatedAt: resolveUpdatedAt(item),
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

  const namespaceOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.namespace)))
        .sort((a, b) => a.localeCompare(b))
        .map((namespace) => ({ id: namespace, name: namespace })),
    [rows]
  )

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
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

  const nsQuery = namespaceQuery.trim().toLowerCase()
  const nmQuery = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (row.kind !== jobType) return false
    if (nsQuery && row.namespace.toLowerCase() !== nsQuery) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const jobTabs = (
    <Tabs value={jobType} onValueChange={(value) => setJobType(value as JobRow["kind"])} className="w-fit">
      <TabsList>
        <TabsTrigger value="Job">任务</TabsTrigger>
        <TabsTrigger value="CronJob">定时任务</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const jobFilters = (
    <>
      <PresetSelector
        presets={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        searchPlaceholder={"\u641c\u7d22\u540d\u79f0\u7a7a\u95f4..."}
        emptyText={"\u672a\u627e\u5230\u540d\u79f0\u7a7a\u95f4"}
        groupLabel={"\u540d\u79f0\u7a7a\u95f4"}
        showClear
        clearText={"\u5168\u90e8\u540d\u79f0\u7a7a\u95f4"}
        triggerClassName="h-9 w-36 justify-between"
        popoverClassName="w-[320px] p-0"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
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
