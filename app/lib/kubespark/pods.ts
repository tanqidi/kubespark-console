import { API_PROXY_BASE, fetchJsonDeduped } from "./common"
import { formatAge, resolveUpdatedAt } from "./utils"

export type PodStatusKey = "running" | "pending" | "failed" | "succeeded" | "unknown"

export type PodRow = {
  id: string
  name: string
  namespace: string
  status: PodStatusKey
  node: string
  age: string
}

export type PodResourceRow = {
  id: string
  name: string
  status: string
  namespace: string
  node: string
  ip: string
  age: string
  updatedAt: string
}

type RawPod = {
  metadata?: {
    uid?: string
    name?: string
    namespace?: string
    creationTimestamp?: string
  }
  status?: {
    phase?: string
    hostIP?: string
    podIP?: string
  }
  spec?: {
    nodeName?: string
  }
}

export type PodYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

const RESOURCE_BASE = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1`
const PODS_ENDPOINT = `${RESOURCE_BASE}/pods`

function phaseToStatusKey(phase?: string): PodStatusKey {
  switch (phase) {
    case "Running":
      return "running"
    case "Pending":
      return "pending"
    case "Failed":
      return "failed"
    case "Succeeded":
      return "succeeded"
    default:
      return "unknown"
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function unwrapItems(payload: unknown): RawPod[] {
  const root = asRecord(payload)
  const container = Array.isArray(root.items) ? root : asRecord(root.data ?? payload)
  return Array.isArray(container.items) ? (container.items as RawPod[]) : []
}

function phaseToStatusLabel(phase?: string): string {
  if (!phase) return "Unknown"
  return phase
}

export function podPayloadToEditorText(payload: unknown): string {
  if (typeof payload === "string") return payload
  if (payload && typeof payload === "object") return JSON.stringify(payload, null, 2)
  return String(payload ?? "")
}

export function buildNamespacedPodEndpoint(namespace: string, name: string): string {
  return `${RESOURCE_BASE}/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(name)}`
}

export async function fetchNamespacedPodYaml(namespace: string, name: string): Promise<PodYamlResult> {
  const requestUrl = buildNamespacedPodEndpoint(namespace, name)
  const payload = await fetchJsonDeduped<unknown>(requestUrl)
  return {
    requestUrl,
    payload,
    text: podPayloadToEditorText(payload),
  }
}

export async function fetchPods(): Promise<PodRow[]> {
  const payload = await fetchJsonDeduped<unknown>(PODS_ENDPOINT)
  const items = unwrapItems(payload)

  return items.map((item, index) => {
    const metadata = item.metadata || {}
    const status = item.status || {}
    const spec = item.spec || {}
    const name = metadata.name || "-"

    return {
      id: metadata.uid || `${name}-${index}`,
      name,
      namespace: metadata.namespace || "default",
      status: phaseToStatusKey(status.phase),
      node: spec.nodeName || status.hostIP || "-",
      age: formatAge(metadata.creationTimestamp),
    }
  })
}

export async function fetchPodResourceRows(limit = 300): Promise<PodResourceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(PODS_ENDPOINT)
  const items = unwrapItems(payload)

  return items.slice(0, limit).map((item, index) => {
    const metadata = item.metadata || {}
    const status = item.status || {}
    const spec = item.spec || {}
    const name = metadata.name || "-"

    return {
      id: metadata.uid || `${name}-${index}`,
      name,
      status: phaseToStatusLabel(status.phase),
      namespace: metadata.namespace || "default",
      node: spec.nodeName || status.hostIP || "-",
      ip: status.podIP || "-",
      age: formatAge(metadata.creationTimestamp),
      updatedAt: resolveUpdatedAt(item),
    }
  })
}
