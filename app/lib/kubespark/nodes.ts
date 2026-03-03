import { API_PROXY_BASE, fetchJsonDeduped } from "./common"
import { parseQuantityCpu, parseQuantityMemGi, resolveUpdatedAt } from "./utils"

export type NodeStatusKey = "ready" | "unschedulable" | "offline"
export type NodeRoleKey = "controlPlane" | "worker" | "unknown"

export type NodeRowApi = {
  id: string
  name: string
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

const NODES_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/nodes`
const PODS_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/pods`

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

function unwrapItems(payload: unknown): RawNode[] {
  const root = (payload as { data?: unknown; items?: unknown[] } | null) ?? null
  const container = Array.isArray(root?.items) ? root : ((root?.data ?? payload) as { items?: unknown[] })
  return Array.isArray(container?.items) ? (container.items as RawNode[]) : []
}

function unwrapPodItems(payload: unknown): Array<{ spec?: { nodeName?: string }; status?: { hostIP?: string } }> {
  const root = (payload as { data?: unknown; items?: unknown[] } | null) ?? null
  const container = Array.isArray(root?.items) ? root : ((root?.data ?? payload) as { items?: unknown[] })
  return Array.isArray(container?.items)
    ? (container.items as Array<{ spec?: { nodeName?: string }; status?: { hostIP?: string } }>)
    : []
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
  const payload = await fetchJsonDeduped<unknown>(NODES_ENDPOINT)
  const items = unwrapItems(payload)

  return items.map((item) => {
    const metadata = item.metadata || {}
    const status = item.status || {}
    const ip = status.addresses?.find((a) => a.type === "InternalIP")?.address || "-"

    return {
      id: metadata.uid || metadata.name || Math.random().toString(36).slice(2),
      name: metadata.name || "-",
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
  const [nodes, podsPayload] = await Promise.all([
    fetchNodes(),
    fetchJsonDeduped<unknown>(PODS_ENDPOINT),
  ])

  const usedMap = new Map<string, number>()
  const podItems = unwrapPodItems(podsPayload)

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
