"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { fetchNodes, type NodeRowApi } from "@/app/lib/kubespark/nodes"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"

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
  allocatedCpu: string
  allocatedMemory: string
}

const columns = createColumns<NodeRow>({
  columns: [
    {
      key: "name",
      label: "名称/IP",
      cellClassName: "font-medium",
      enableHiding: false,
      cell: (_, row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground text-xs">{row.ip}</span>
        </div>
      ),
    },
    { key: "status", label: "状态", render: "status" },
    { key: "role", label: "角色" },
    { key: "cpuUsage", label: "CPU 使用率", align: "right" },
    { key: "memoryUsage", label: "内存使用率", align: "right" },
    { key: "pods", label: "Pods", align: "right" },
    { key: "allocatedCpu", label: "已分配CPU", align: "right" },
    { key: "allocatedMemory", label: "已分配内存", align: "right" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function statusLabel(status: NodeRowApi["status"]): string {
  if (status === "ready") return "就绪"
  if (status === "unschedulable") return "不可调度"
  return "离线"
}

function roleLabel(role: NodeRowApi["role"]): string {
  if (role === "controlPlane") return "控制平面"
  if (role === "worker") return "工作节点"
  return "未知"
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

function formatAllocated(used: number, total: number, unit: string): string {
  if (!total) return "-"
  const percent = Math.round((used / total) * 100)
  return `${used.toFixed(2)} ${unit} (${percent}%)`
}

export function NodesPageClient() {
  const [rows, setRows] = React.useState<NodeRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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
            allocatedCpu: formatAllocated(0, node.cpuTotal, "cores"),
            allocatedMemory: formatAllocated(0, node.memoryTotal, "GiB"),
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
  if (error) return <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>

  return <DataTable data={rows} columns={columns} />
}
