"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, resolveUpdatedAt } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs"

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
  updatedAt: string
  kind: "Deployment" | "StatefulSet" | "DaemonSet"
}

const columns = createColumns<WorkloadRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "desired", label: "\u671f\u671b", align: "right" },
    { key: "updated", label: "\u66f4\u65b0", align: "right" },
    { key: "available", label: "\u53ef\u7528", align: "right" },
    { key: "ready", label: "\u5c31\u7eea", align: "right" },
    { key: "age", label: "\u5e74\u9f84" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
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
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [typeFilter, setTypeFilter] = React.useState<WorkloadRow["kind"]>("Deployment")
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")

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
        const mapped: WorkloadRow[] = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const kind = item?.kind as WorkloadRow["kind"] | undefined
          const resolvedKind =
            kind === "DaemonSet" || kind === "StatefulSet" || kind === "Deployment"
              ? kind
              : "Deployment"
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
            updatedAt: resolveUpdatedAt(item),
            kind: resolvedKind,
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
          <AlertTitle>{"\u52a0\u8f7d\u5931\u8d25"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const nsQuery = namespaceQuery.trim().toLowerCase()
  const nmQuery = nameQuery.trim().toLowerCase()

  const filteredRows = rows.filter((row) => {
    if (row.kind !== typeFilter) return false
    if (nsQuery && !row.namespace.toLowerCase().includes(nsQuery)) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const workloadTabs = (
    <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as WorkloadRow["kind"])} className="w-fit">
      <TabsList>
        <TabsTrigger value="Deployment">部署</TabsTrigger>
        <TabsTrigger value="StatefulSet">有状态副本集</TabsTrigger>
        <TabsTrigger value="DaemonSet">守护进程集</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const workloadFilters = (
    <>
      <Input
        value={namespaceQuery}
        onChange={(event) => setNamespaceQuery(event.target.value)}
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        className="h-9 w-36"
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
      toolbarStart={workloadTabs}
      toolbarEnd={workloadFilters}
    />
  )
}
