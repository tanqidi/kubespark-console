"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { fetchNodes, type NodeRowApi } from "@/app/lib/kubespark/nodes"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type NodeRow = {
  id: string
  name: string
  ip: string
  status: string
  role: string
  cpuUsage: string
  memoryUsage: string
  pods: string
  updatedAt: string
}

const columns = createColumns<NodeRow>({
  columns: [
    {
      key: "name",
      label: "\u540d\u79f0/IP",
      cellClassName: "font-medium",
      enableHiding: false,
      cell: (_, row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground text-xs">{row.ip}</span>
        </div>
      ),
    },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "role", label: "\u89d2\u8272" },
    { key: "cpuUsage", label: "CPU \u4f7f\u7528\u7387", align: "right" },
    { key: "memoryUsage", label: "\u5185\u5b58\u4f7f\u7528\u7387", align: "right" },
    { key: "pods", label: "\u5bb9\u5668\u7ec4", align: "right" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function statusLabel(status: NodeRowApi["status"]): string {
  if (status === "ready") return "\u5c31\u7eea"
  if (status === "unschedulable") return "\u4e0d\u53ef\u8c03\u5ea6"
  return "\u79bb\u7ebf"
}

function roleLabel(role: NodeRowApi["role"]): string {
  if (role === "controlPlane") return "\u63a7\u5236\u5e73\u9762"
  if (role === "worker") return "\u5de5\u4f5c\u8282\u70b9"
  return "\u672a\u77e5"
}

function formatCpuUsage(used: number, total: number): string {
  if (!total) return "-"
  const percent = Math.round((used / total) * 100)
  return `${percent}% (${used.toFixed(2)}/${total.toFixed(2)} cores)`
}

function formatMemUsage(used: number, total: number): string {
  if (!total) return "-"
  const percent = Math.round((used / total) * 100)
  return `${percent}% (${used.toFixed(2)}/${total.toFixed(2)} GiB)`
}

export function NodesPageClient() {
  const [rows, setRows] = React.useState<NodeRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([
      fetchNodes(),
      fetchJsonDeduped<any>(`${BASE}/pods`),
    ])
      .then(([nodes, podsJson]) => {
        if (cancelled) return
        const podItems = unwrapItems(podsJson)
        const usedMap = new Map<string, number>()

        podItems.forEach((item) => {
          const nodeKey = item?.spec?.nodeName || item?.status?.hostIP
          if (!nodeKey) return
          usedMap.set(nodeKey, (usedMap.get(nodeKey) || 0) + 1)
        })

        const mapped = nodes.map((node) => {
          const usedPods = usedMap.get(node.name) || usedMap.get(node.ip) || 0
          return {
            id: node.id,
            name: node.name,
            ip: node.ip,
            status: statusLabel(node.status),
            role: roleLabel(node.role),
            cpuUsage: formatCpuUsage(0, node.cpuTotal),
            memoryUsage: formatMemUsage(0, node.memoryTotal),
            pods: node.podsTotal ? `${usedPods}/${node.podsTotal}` : `${usedPods}/-`,
            updatedAt: node.updatedAt,
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

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  const nodeFilters = (
    <Input
      value={nameQuery}
      onChange={(event) => setNameQuery(event.target.value)}
      placeholder={"\u540d\u79f0"}
      className="h-9 w-40"
    />
  )

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={nodeFilters} />
}
