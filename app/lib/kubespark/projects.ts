import { API_PROXY_BASE, deleteResource, fetchJsonDeduped } from "./common"
import { buildResourceDocument } from "./resource-document"
import { formatAge, resolveUpdatedAt } from "./utils"

export type NamespaceRow = {
  id: string
  name: string
  status: string
  labels: number
  annotations: number
  age: string
  updatedAt: string
}

type RawNamespace = {
  metadata?: {
    uid?: string
    name?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    creationTimestamp?: string
    managedFields?: Array<{ time?: string }>
  }
  status?: {
    phase?: string
    conditions?: Array<{ lastTransitionTime?: string; lastUpdateTime?: string }>
  }
}

const NAMESPACES_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/namespaces`
const NAMESPACES_RESOURCE_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/resources/core/v1/namespaces`

export type NamespaceYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

function unwrapItems(payload: unknown): RawNamespace[] {
  const root = (payload as { data?: unknown; items?: unknown[] } | null) ?? null
  const container = Array.isArray(root?.items) ? root : ((root?.data ?? payload) as { items?: unknown[] })
  return Array.isArray(container?.items) ? (container.items as RawNamespace[]) : []
}

export async function fetchNamespaces(): Promise<NamespaceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(NAMESPACES_ENDPOINT)
  const items = unwrapItems(payload)
  return items.map((item) => {
    const md = item.metadata || {}
    return {
      id: md.uid || md.name || Math.random().toString(36).slice(2),
      name: md.name || "-",
      status: item.status?.phase || "Unknown",
      labels: Object.keys(md.labels || {}).length,
      annotations: Object.keys(md.annotations || {}).length,
      age: formatAge(md.creationTimestamp),
      updatedAt: resolveUpdatedAt(item),
    }
  })
}

function buildNamespaceFieldSelectorEndpoint(name: string): string {
  const query = new URLSearchParams({
    fieldSelector: `metadata.name=${name}`,
  })
  return `${NAMESPACES_RESOURCE_ENDPOINT}?${query.toString()}`
}

export async function fetchNamespaceYaml(name: string): Promise<NamespaceYamlResult> {
  const targetName = name.trim()
  if (!targetName) {
    throw new Error("Namespace name is required")
  }

  const requestUrl = buildNamespaceFieldSelectorEndpoint(targetName)
  const payload = await fetchJsonDeduped<unknown>(requestUrl)
  const items = unwrapItems(payload)
  const matched = items.find((item) => item.metadata?.name === targetName) ?? items[0]

  if (!matched) {
    throw new Error(`Namespace not found: ${targetName}`)
  }

  return {
    requestUrl,
    payload: matched,
    text: buildResourceDocument({
      type: "namespace",
      payload: matched,
      output: "yaml",
    }).text,
  }
}

export async function deleteNamespace(name: string): Promise<void> {
  return deleteResource("core", "v1", "namespaces", name)
}
