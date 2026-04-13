import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  deleteResource,
  fetchJsonDeduped,
  fetchResourceByName,
  fetchResourceCollection,
} from "./common"
import { formatAge, resolveUpdatedAt } from "./utils"

type RawPipeline = {
  metadata?: {
    uid?: string
    name?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    creationTimestamp?: string
    managedFields?: Array<{ time?: string }>
  }
  spec?: {
    description?: string
    workspaceRef?: {
      name?: string
    }
    pipelineProjectRef?: {
      name?: string
    }
  }
}

export type PipelineRow = {
  id: string
  name: string
  workspace: string
  description: string
  labels: number
  annotations: number
  age: string
  updatedAt: string
}

export type PipelineDetail = {
  name: string
  workspace: string
  pipelineProjectName: string
  description: string
  labels: Record<string, string>
  annotations: Record<string, string>
}

export type CreatePipelineInput = {
  name: string
  description?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  workspaceName?: string
  pipelineProjectName?: string
}

export type UpdatePipelineInput = CreatePipelineInput

const PIPELINE_GVR = {
  group: "tanqidi.com",
  version: "v1alpha1",
  resource: "pipelines",
} as const

function normalizePipelineName(name: string): string {
  const value = name.trim().toLowerCase()
  const isValid = /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 63
  if (!isValid) {
    throw new Error("名称必须是 1-63 位小写字母/数字/连字符，且以小写字母开头、以字母或数字结尾")
  }
  return value
}

function normalizeOptionalDnsLabel(name?: string): string {
  if (!name) return ""
  const value = name.trim().toLowerCase()
  if (!value) return ""
  const isValid = /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 63
  if (!isValid) {
    throw new Error("关联名称必须是 1-63 位小写字母/数字/连字符，且以小写字母开头、以字母或数字结尾")
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

function resolvePipelineProjectName(spec?: RawPipeline["spec"]): string {
  return (spec?.pipelineProjectRef?.name ?? "").trim()
}

export async function fetchPipelineRows(pipelineProjectName?: string): Promise<PipelineRow[]> {
  const { items } = await fetchResourceCollection<RawPipeline>(
    PIPELINE_GVR.group,
    PIPELINE_GVR.version,
    PIPELINE_GVR.resource
  )

  const expectedProject = pipelineProjectName?.trim()
  return items
    .map((item, index) => {
      const metadata = item.metadata ?? {}
      const spec = item.spec ?? {}
      const workspace = (spec.workspaceRef?.name ?? "").trim()
      const description = (spec.description ?? metadata.annotations?.description ?? "").trim()

      return {
        id: metadata.uid || metadata.name || `pipeline-${index}`,
        name: metadata.name || "-",
        workspace: workspace || "-",
        description: description || "-",
        labels: Object.keys(metadata.labels || {}).length,
        annotations: Object.keys(metadata.annotations || {}).length,
        age: formatAge(metadata.creationTimestamp),
        updatedAt: resolveUpdatedAt(item),
      }
    })
    .filter((row, index) => {
      if (!expectedProject) return true
      const item = items[index]
      const project = resolvePipelineProjectName(item?.spec)
      return project === expectedProject
    })
}

export async function fetchPipelineDetail(name: string): Promise<PipelineDetail> {
  const normalizedName = normalizePipelineName(name)
  const { payload } = await fetchResourceByName<RawPipeline>(
    PIPELINE_GVR.group,
    PIPELINE_GVR.version,
    PIPELINE_GVR.resource,
    normalizedName
  )

  const metadata = payload.metadata ?? {}
  const spec = payload.spec ?? {}
  const workspace = (spec.workspaceRef?.name ?? "").trim()
  const pipelineProjectName = resolvePipelineProjectName(spec)
  const description = (spec.description ?? metadata.annotations?.description ?? "").trim()

  return {
    name: metadata.name || normalizedName,
    workspace,
    pipelineProjectName,
    description,
    labels: normalizeStringRecord(metadata.labels),
    annotations: normalizeStringRecord(metadata.annotations),
  }
}

export async function createPipeline(input: CreatePipelineInput): Promise<void> {
  const name = normalizePipelineName(input.name)
  const workspaceName = normalizeOptionalDnsLabel(input.workspaceName)
  const pipelineProjectName = normalizeOptionalDnsLabel(input.pipelineProjectName)
  const description = input.description?.trim() ?? ""
  const labels = normalizeStringRecord(input.labels)
  const annotations = normalizeStringRecord(input.annotations)
  if (description) annotations.description = description
  else delete annotations.description

  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "Pipeline",
    metadata: {
      name,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      ...(description ? { description } : {}),
      ...(workspaceName
        ? {
            workspaceRef: {
              name: workspaceName,
            },
          }
        : {}),
      ...(pipelineProjectName
        ? {
            pipelineProjectRef: {
              name: pipelineProjectName,
            },
          }
        : {}),
    },
  }

  const url = buildResourceCollectionEndpoint(
    PIPELINE_GVR.group,
    PIPELINE_GVR.version,
    PIPELINE_GVR.resource
  )
  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
}

export async function updatePipeline(input: UpdatePipelineInput): Promise<void> {
  const name = normalizePipelineName(input.name)
  const workspaceName = normalizeOptionalDnsLabel(input.workspaceName)
  const pipelineProjectName = normalizeOptionalDnsLabel(input.pipelineProjectName)
  const description = input.description?.trim() ?? ""
  const labels = normalizeStringRecord(input.labels)
  const annotations = normalizeStringRecord(input.annotations)
  if (description) annotations.description = description
  else delete annotations.description

  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "Pipeline",
    metadata: {
      name,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      ...(description ? { description } : {}),
      ...(workspaceName
        ? {
            workspaceRef: {
              name: workspaceName,
            },
          }
        : {}),
      ...(pipelineProjectName
        ? {
            pipelineProjectRef: {
              name: pipelineProjectName,
            },
          }
        : {}),
    },
  }

  const url = buildResourceItemEndpoint(
    PIPELINE_GVR.group,
    PIPELINE_GVR.version,
    PIPELINE_GVR.resource,
    name
  )
  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
}

export async function fetchPipelineYaml(name: string): Promise<string> {
  const normalizedName = normalizePipelineName(name)
  const { payload } = await fetchResourceByName<Record<string, unknown>>(
    PIPELINE_GVR.group,
    PIPELINE_GVR.version,
    PIPELINE_GVR.resource,
    normalizedName
  )
  return stringify(payload, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  })
}

export async function deletePipeline(name: string): Promise<void> {
  const normalizedName = normalizePipelineName(name)
  await deleteResource(PIPELINE_GVR.group, PIPELINE_GVR.version, PIPELINE_GVR.resource, normalizedName)
}
