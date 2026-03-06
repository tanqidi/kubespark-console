import { deleteResource, fetchResourceCollection } from "./common"
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

export type NamespaceYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

export async function fetchNamespaces(): Promise<NamespaceRow[]> {
  const { items } = await fetchResourceCollection<RawNamespace>(
    "core",
    "v1",
    "namespaces"
  )
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

export async function fetchNamespaceYaml(name: string): Promise<NamespaceYamlResult> {
  const targetName = name.trim()
  if (!targetName) {
    throw new Error("Namespace name is required")
  }

  const { requestUrl, items } = await fetchResourceCollection<RawNamespace>(
    "core",
    "v1",
    "namespaces",
    {
      fieldSelector: `metadata.name=${targetName}`,
    }
  )
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
