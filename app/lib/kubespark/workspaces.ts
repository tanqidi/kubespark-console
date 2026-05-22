import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  deleteResource,
  fetchJsonDeduped,
  fetchResourceByName,
  fetchResourceCollection,
} from "./common"
import { formatAge, resolveDescriptionFromAnnotations, resolveUpdatedAt } from "./utils"
import { buildResourceDocument } from "./resource-document"

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function normalizeWorkspaceName(name: string): string {
  const value = name.trim().toLowerCase()
  const isValid = /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 63
  if (!isValid) {
    throw new Error("名称必须是 1-63 位小写字母/数字/连字符，且以小写字母开头、以字母或数字结尾")
  }
  return value
}

function normalizeStringRecord(record?: Record<string, string>): Record<string, string> {
  if (!record) return {}
  return Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key.trim(), value?.trim() ?? ""])
      .filter(([key]) => key.length > 0)
  ) as Record<string, string>
}

type RawWorkspace = {
  metadata?: {
    uid?: string
    name?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    creationTimestamp?: string
    resourceVersion?: string
  }
  spec?: {
    owner?: string
  }
  status?: {
    phase?: string
  }
}

export type WorkspaceRow = {
  id: string
  name: string
  owner: string
  status: string
  age: string
  updatedAt: string
  description: string
}

export type WorkspaceDetail = {
  name: string
  owner: string
  description: string
  labels: Record<string, string>
  annotations: Record<string, string>
  resourceVersion: string
}

export type UpsertWorkspaceInput = {
  name: string
  owner: string
  description?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

const WORKSPACE_GVR = {
  group: "tanqidi.com",
  version: "v1alpha1",
  resource: "workspaces",
} as const

export async function fetchWorkspaceRows(limit = 300): Promise<WorkspaceRow[]> {
  const { items } = await fetchResourceCollection<RawWorkspace>(
    WORKSPACE_GVR.group,
    WORKSPACE_GVR.version,
    WORKSPACE_GVR.resource
  )

  return items.slice(0, limit).map((item, index) => {
    const metadata = item.metadata ?? {}
    const name = asString(metadata.name, "workspace")
    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name,
      owner: asString(item.spec?.owner, "-") || "-",
      status: asString(item.status?.phase, "未启用"),
      age: formatAge(metadata.creationTimestamp),
      updatedAt: resolveUpdatedAt(item as unknown as JsonObject),
      description: resolveDescriptionFromAnnotations(metadata.annotations ?? {}),
    }
  })
}

export async function fetchWorkspaceDetail(name: string): Promise<WorkspaceDetail> {
  const targetName = normalizeWorkspaceName(name)
  const { payload } = await fetchResourceByName<RawWorkspace>(
    WORKSPACE_GVR.group,
    WORKSPACE_GVR.version,
    WORKSPACE_GVR.resource,
    targetName
  )

  const metadata = asObject(payload.metadata)
  const labels = normalizeStringRecord(
    asObject(metadata.labels) as Record<string, string>
  )
  const annotations = normalizeStringRecord(
    asObject(metadata.annotations) as Record<string, string>
  )

  return {
    name: asString(metadata.name, targetName),
    owner: asString(asObject(payload.spec).owner, ""),
    description: resolveDescriptionFromAnnotations(annotations),
    labels,
    annotations,
    resourceVersion: asString(metadata.resourceVersion, ""),
  }
}

function buildWorkspaceBody(input: UpsertWorkspaceInput, resourceVersion?: string): JsonObject {
  const name = normalizeWorkspaceName(input.name)
  const owner = input.owner.trim()
  if (!owner) {
    throw new Error("负责人不能为空")
  }

  const labels = normalizeStringRecord(input.labels)
  const annotations = normalizeStringRecord(input.annotations)
  const description = input.description?.trim() ?? ""
  if (description) annotations.description = description
  else delete annotations.description

  return {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "Workspace",
    metadata: {
      name,
      ...(resourceVersion ? { resourceVersion } : {}),
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      owner,
    },
  }
}

export async function createWorkspace(input: UpsertWorkspaceInput): Promise<void> {
  const url = buildResourceCollectionEndpoint(
    WORKSPACE_GVR.group,
    WORKSPACE_GVR.version,
    WORKSPACE_GVR.resource
  )
  const body = buildWorkspaceBody(input)
  await fetchJsonDeduped(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function updateWorkspace(name: string, input: UpsertWorkspaceInput): Promise<void> {
  const targetName = normalizeWorkspaceName(name)
  const detail = await fetchWorkspaceDetail(targetName)
  const body = buildWorkspaceBody(
    {
      ...input,
      name: targetName,
    },
    detail.resourceVersion
  )

  const url = buildResourceItemEndpoint(
    WORKSPACE_GVR.group,
    WORKSPACE_GVR.version,
    WORKSPACE_GVR.resource,
    targetName
  )
  await fetchJsonDeduped(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export async function deleteWorkspace(name: string): Promise<void> {
  const targetName = normalizeWorkspaceName(name)
  return deleteResource(WORKSPACE_GVR.group, WORKSPACE_GVR.version, WORKSPACE_GVR.resource, targetName)
}

export type WorkspaceYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

export async function fetchWorkspaceYaml(name: string): Promise<WorkspaceYamlResult> {
  const targetName = normalizeWorkspaceName(name)
  const { requestUrl, payload } = await fetchResourceByName<RawWorkspace>(
    WORKSPACE_GVR.group,
    WORKSPACE_GVR.version,
    WORKSPACE_GVR.resource,
    targetName
  )
  const { text } = buildResourceDocument({
    type: "workspace",
    payload,
    output: "yaml",
  })
  return {
    requestUrl,
    payload,
    text,
  }
}

