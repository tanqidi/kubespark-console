import {
  buildResourceCollectionEndpoint,
  deleteResource,
  fetchJsonDeduped,
  fetchResourceCollection,
} from "./common"
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

export type CreateNamespaceInput = {
  name: string
  description?: string
}

function normalizeKubernetesNamespaceName(name: string): string {
  const value = name.trim().toLowerCase()
  const isValid = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 63
  if (!isValid) {
    throw new Error("名称必须是 1-63 位小写字母/数字/短横线，且不能以短横线开头或结尾")
  }
  return value
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

export async function createNamespace(input: CreateNamespaceInput): Promise<void> {
  const name = normalizeKubernetesNamespaceName(input.name)
  const description = input.description?.trim() ?? ""

  const metadata: {
    name: string
    annotations?: Record<string, string>
  } = { name }

  if (description) {
    metadata.annotations = {
      "description": description,
    }
  }

  const requestBody = {
    apiVersion: "v1",
    kind: "Namespace",
    metadata,
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "namespaces")
  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
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
