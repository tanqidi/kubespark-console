import { fetchResourceCollection } from "./common"
import {
  parseQuantityCpu,
  parseQuantityMemGi,
  resolveDescriptionFromAnnotations,
  resolveUpdatedAt,
} from "./utils"

export type NodeStatusKey = "ready" | "unschedulable" | "offline"
export type NodeRoleKey = "controlPlane" | "worker" | "unknown"

export type NodeRowApi = {
  id: string
  name: string
  description: string
  ip: string
  status: NodeStatusKey
  role: NodeRoleKey
  cpuTotal: number
  memoryTotal: number
  podsTotal: number
  updatedAt: string
}

export type NodeResourceRow = {
  id: string
  name: string
  description: string
  ip: string
  status: string
  role: string
  cpuUsage: string
  memoryUsage: string
  pods: string
  updatedAt: string
}

type RawNode = {
  metadata?: {
    uid?: string
    name?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    creationTimestamp?: string
    managedFields?: Array<{ time?: string }>
  }
  spec?: { unschedulable?: boolean }
  status?: {
    addresses?: Array<{ type?: string; address?: string }>
    conditions?: Array<{ type?: string; status?: string; lastTransitionTime?: string }>
    capacity?: { cpu?: string; memory?: string }
    allocatable?: { pods?: string }
  }
}

function roleFromLabels(labels?: Record<string, string>): NodeRoleKey {
  if (!labels) return "unknown"
  if ("node-role.kubernetes.io/control-plane" in labels || "node-role.kubernetes.io/master" in labels) {
    return "controlPlane"
  }
  return "worker"
}

function statusFromNode(node: RawNode): NodeStatusKey {
  const ready = node.status?.conditions?.find((c) => c.type === "Ready")?.status === "True"
  if (!ready) return "offline"
  return node.spec?.unschedulable ? "unschedulable" : "ready"
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

export async function fetchNodes(): Promise<NodeRowApi[]> {
  const { items } = await fetchResourceCollection<RawNode>("core", "v1", "nodes")

  return items.map((item) => {
    const metadata = item.metadata || {}
    const status = item.status || {}
    const ip = status.addresses?.find((a) => a.type === "InternalIP")?.address || "-"

    return {
      id: metadata.uid || metadata.name || Math.random().toString(36).slice(2),
      name: metadata.name || "-",
      description: resolveDescriptionFromAnnotations(metadata.annotations),
      ip,
      status: statusFromNode(item),
      role: roleFromLabels(metadata.labels),
      cpuTotal: parseQuantityCpu(status.capacity?.cpu),
      memoryTotal: parseQuantityMemGi(status.capacity?.memory),
      podsTotal: Number(status.allocatable?.pods || 0),
      updatedAt: resolveUpdatedAt(item),
    }
  })
}

export async function fetchNodeResourceRows(): Promise<NodeResourceRow[]> {
  const [nodes, podsResult] = await Promise.all([
    fetchNodes(),
    fetchResourceCollection<{ spec?: { nodeName?: string }; status?: { hostIP?: string } }>(
      "core",
      "v1",
      "pods"
    ),
  ])

  const usedMap = new Map<string, number>()
  const podItems = podsResult.items

  podItems.forEach((item) => {
    const nodeKey = item.spec?.nodeName || item.status?.hostIP
    if (!nodeKey) return
    usedMap.set(nodeKey, (usedMap.get(nodeKey) || 0) + 1)
  })

  return nodes.map((node) => {
    const usedPods = usedMap.get(node.name) || usedMap.get(node.ip) || 0
    return {
      id: node.id,
      name: node.name,
      description: node.description,
      ip: node.ip,
      status: statusLabel(node.status),
      role: roleLabel(node.role),
      cpuUsage: formatCpuUsage(0, node.cpuTotal),
      memoryUsage: formatMemUsage(0, node.memoryTotal),
      pods: node.podsTotal ? `${usedPods}/${node.podsTotal}` : `${usedPods}/-`,
      updatedAt: node.updatedAt,
    }
  })
}
