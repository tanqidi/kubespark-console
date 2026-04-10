import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  deleteResource,
  fetchJsonDeduped,
  fetchResourceByName,
  fetchResourceCollection,
} from "./common"
import { formatAge, resolveUpdatedAt } from "./utils"

type RawPipelineProject = {
  metadata?: {
    uid?: string
    name?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    creationTimestamp?: string
    managedFields?: Array<{ time?: string }>
  }
  spec?: {
    workspaceRef?: {
      name?: string
    }
    displayName?: string
    description?: string
  }
}

export type PipelineProjectRow = {
  id: string
  name: string
  workspace: string
  description: string
  labels: number
  annotations: number
  age: string
  updatedAt: string
}

export type CreatePipelineProjectInput = {
  name: string
  workspaceName: string
  description?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export type UpdatePipelineProjectInput = CreatePipelineProjectInput

export type PipelineProjectDetail = {
  name: string
  workspace: string
  description: string
  labels: Record<string, string>
  annotations: Record<string, string>
}

const PIPELINE_PROJECT_GVR = {
  group: "tanqidi.com",
  version: "v1alpha1",
  resource: "pipelineprojects",
} as const

function normalizePipelineProjectName(name: string): string {
  const value = name.trim().toLowerCase()
  const isValid = /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 63
  if (!isValid) {
    throw new Error("名称必须是 1-63 位小写字母/数字/连字符，且以小写字母开头、以字母或数字结尾")
  }
  return value
}

function normalizeWorkspaceName(name: string): string {
  const value = name.trim().toLowerCase()
  const isValid = /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 63
  if (!isValid) {
    throw new Error("企业空间名称必须是 1-63 位小写字母/数字/连字符，且以小写字母开头、以字母或数字结尾")
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

export async function fetchPipelineProjectRows(workspaceName?: string): Promise<PipelineProjectRow[]> {
  const { items } = await fetchResourceCollection<RawPipelineProject>(
    PIPELINE_PROJECT_GVR.group,
    PIPELINE_PROJECT_GVR.version,
    PIPELINE_PROJECT_GVR.resource
  )

  const expectedWorkspace = workspaceName?.trim()
  return items
    .map((item, index) => {
      const metadata = item.metadata ?? {}
      const spec = item.spec ?? {}
      const workspace = (spec.workspaceRef?.name ?? "").trim()
      const description = (spec.description ?? metadata.annotations?.description ?? "").trim()

      return {
        id: metadata.uid || metadata.name || `pipeline-project-${index}`,
        name: metadata.name || "-",
        workspace: workspace || "-",
        description: description || "-",
        labels: Object.keys(metadata.labels || {}).length,
        annotations: Object.keys(metadata.annotations || {}).length,
        age: formatAge(metadata.creationTimestamp),
        updatedAt: resolveUpdatedAt(item),
      }
    })
    .filter((row) => (expectedWorkspace ? row.workspace === expectedWorkspace : true))
}

export async function createPipelineProject(input: CreatePipelineProjectInput): Promise<void> {
  const name = normalizePipelineProjectName(input.name)
  const workspaceName = normalizeWorkspaceName(input.workspaceName)
  const description = input.description?.trim() ?? ""
  const labels = normalizeStringRecord(input.labels)
  const annotations = normalizeStringRecord(input.annotations)
  if (description) annotations.description = description
  else delete annotations.description

  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "PipelineProject",
    metadata: {
      name,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      workspaceRef: {
        name: workspaceName,
      },
      ...(description ? { description } : {}),
    },
  }

  const url = buildResourceCollectionEndpoint(
    PIPELINE_PROJECT_GVR.group,
    PIPELINE_PROJECT_GVR.version,
    PIPELINE_PROJECT_GVR.resource
  )
  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
}

export async function fetchPipelineProjectDetail(name: string): Promise<PipelineProjectDetail> {
  const normalizedName = normalizePipelineProjectName(name)
  const { payload } = await fetchResourceByName<RawPipelineProject>(
    PIPELINE_PROJECT_GVR.group,
    PIPELINE_PROJECT_GVR.version,
    PIPELINE_PROJECT_GVR.resource,
    normalizedName
  )

  const metadata = payload.metadata ?? {}
  const spec = payload.spec ?? {}
  const workspace = (spec.workspaceRef?.name ?? "").trim()
  const description = (spec.description ?? metadata.annotations?.description ?? "").trim()
  const labels = normalizeStringRecord(metadata.labels)
  const annotations = normalizeStringRecord(metadata.annotations)

  return {
    name: metadata.name || normalizedName,
    workspace: workspace || "",
    description: description || "",
    labels,
    annotations,
  }
}

export async function updatePipelineProject(input: UpdatePipelineProjectInput): Promise<void> {
  const name = normalizePipelineProjectName(input.name)
  const workspaceName = normalizeWorkspaceName(input.workspaceName)
  const description = input.description?.trim() ?? ""
  const labels = normalizeStringRecord(input.labels)
  const annotations = normalizeStringRecord(input.annotations)
  if (description) annotations.description = description
  else delete annotations.description

  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "PipelineProject",
    metadata: {
      name,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      workspaceRef: {
        name: workspaceName,
      },
      ...(description ? { description } : {}),
    },
  }

  const url = buildResourceItemEndpoint(
    PIPELINE_PROJECT_GVR.group,
    PIPELINE_PROJECT_GVR.version,
    PIPELINE_PROJECT_GVR.resource,
    name
  )
  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
}

export async function deletePipelineProject(name: string): Promise<void> {
  const normalizedName = normalizePipelineProjectName(name)
  await deleteResource(
    PIPELINE_PROJECT_GVR.group,
    PIPELINE_PROJECT_GVR.version,
    PIPELINE_PROJECT_GVR.resource,
    normalizedName
  )
}
