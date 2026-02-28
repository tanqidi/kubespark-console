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
  kind: "Deployment" | "StatefulSet" | "DaemonSet"
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
          <AlertTitle>{"加载失败"}</AlertTitle>
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
        <TabsTrigger value="Deployment">Deployment</TabsTrigger>
        <TabsTrigger value="StatefulSet">StatefulSet</TabsTrigger>
        <TabsTrigger value="DaemonSet">DaemonSet</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const workloadFilters = (
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
      toolbarStart={workloadTabs}
      toolbarEnd={workloadFilters}
    />
  )
}
