import {
  buildResourceItemEndpoint,
  deleteResource,
  fetchResourceCollection,
  fetchResourceItem,
} from "./common"
import { buildResourceDocument } from "./resource-document"
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

function phaseToStatusLabel(phase?: string): string {
  if (!phase) return "Unknown"
  return phase
}

export function podPayloadToEditorText(payload: unknown): string {
  return buildResourceDocument({
    type: "pod",
    payload,
    output: "yaml",
  }).text
}

export function buildNamespacedPodEndpoint(namespace: string, name: string): string {
  return buildResourceItemEndpoint("core", "v1", "pods", name, { namespace })
}

export async function fetchNamespacedPodYaml(namespace: string, name: string): Promise<PodYamlResult> {
  const { requestUrl, payload } = await fetchResourceItem<unknown>(
    "core",
    "v1",
    "pods",
    name,
    { namespace }
  )
  return {
    requestUrl,
    payload,
    text: podPayloadToEditorText(payload),
  }
}

export async function deletePod(namespace: string, name: string): Promise<void> {
  return deleteResource("core", "v1", "pods", name, namespace)
}

export async function fetchPods(): Promise<PodRow[]> {
  const { items } = await fetchResourceCollection<RawPod>("core", "v1", "pods")

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
  const { items } = await fetchResourceCollection<RawPod>("core", "v1", "pods")

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
