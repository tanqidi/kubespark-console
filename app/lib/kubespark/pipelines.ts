import { stringify } from "yaml"

import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  deleteResource,
  fetchJsonDeduped,
  fetchResourceByName,
  fetchResourceCollection,
} from "./common"
import { formatAge, formatDateTime, resolveUpdatedAt } from "./utils"

type RawPipeline = {
  metadata?: {
    uid?: string
    name?: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    resourceVersion?: string
    creationTimestamp?: string
    managedFields?: Array<{ time?: string }>
  }
  spec?: Record<string, unknown>
}

type RawPipelineRun = {
  metadata?: {
    uid?: string
    name?: string
    annotations?: Record<string, string>
    creationTimestamp?: string
    managedFields?: Array<{ time?: string }>
  }
  spec?: Record<string, unknown>
  status?: Record<string, unknown>
}

type RawDroneRepo = {
  namespace?: string
  name?: string
  slug?: string
  full_name?: string
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

export type PipelineRunRow = {
  id: string
  name: string
  description: string
  pipeline: string
  phase: string
  buildNumber: string
  branch: string
  buildLink: string
  triggerTime: string
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

export type CreatePipelineRunInput = {
  pipelineName: string
  triggerType?: string
  data?: Record<string, string>
  annotations?: Record<string, string>
}

const PIPELINE_GVR = {
  group: "tanqidi.com",
  version: "v1alpha1",
  resource: "pipelines",
} as const

const PIPELINE_RUN_GVR = {
  group: "tanqidi.com",
  version: "v1alpha1",
  resource: "pipelineruns",
} as const

type PipelineSpec = {
  workspaceRef?: { name: string }
  pipelineProjectRef?: { name: string }
} & Record<string, unknown>

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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function extractDescription(item: RawPipeline): string {
  const metadata = item.metadata ?? {}
  const annotationDescription = readString(metadata.annotations?.description)
  if (annotationDescription) return annotationDescription
  const spec = asRecord(item.spec)
  const specDescription = readString(spec.description)
  return specDescription
}

function extractWorkspace(item: RawPipeline): string {
  const spec = asRecord(item.spec)
  const workspaceRef = asRecord(spec.workspaceRef)
  return readString(workspaceRef.name)
}

function extractPipelineProjectName(item: RawPipeline): string {
  const spec = asRecord(item.spec)
  const pipelineProjectRef = asRecord(spec.pipelineProjectRef)
  return readString(pipelineProjectRef.name)
}

function extractPipelineRunPhase(item: RawPipelineRun): string {
  const drone = parsePipelineRunDroneAnnotation(item)
  const droneStatus = readString(drone.status)
  if (droneStatus) return droneStatus

  const status = asRecord(item.status)
  return readString(status.phase)
}

function extractPipelineRunBuildNumber(item: RawPipelineRun): string {
  const drone = parsePipelineRunDroneAnnotation(item)
  const droneNumber = drone.number
  if (typeof droneNumber === "number" && Number.isFinite(droneNumber)) return String(Math.trunc(droneNumber))
  if (typeof droneNumber === "string" && droneNumber.trim()) return droneNumber.trim()

  const status = asRecord(item.status)
  const value = status.droneBuildNumber
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value))
  if (typeof value === "string") return value.trim()
  return ""
}

function extractPipelineRunBuildLink(item: RawPipelineRun): string {
  const drone = parsePipelineRunDroneAnnotation(item)
  const droneLink = readString(drone.link)
  if (droneLink) return droneLink

  const status = asRecord(item.status)
  return readString(status.droneBuildLink)
}

function extractPipelineRunBranch(item: RawPipelineRun): string {
  const drone = parsePipelineRunDroneAnnotation(item)
  const ref = readString(drone.ref)
  if (ref) {
    if (ref.startsWith("refs/heads/")) return ref.slice("refs/heads/".length)
    if (ref.startsWith("refs/tags/")) return ref.slice("refs/tags/".length)
    return ref
  }

  const source = readString(drone.source)
  if (source) return source
  const target = readString(drone.target)
  if (target) return target

  const spec = asRecord(item.spec)
  const data = asRecord(spec.data)
  const branch = readString(data.branch)
  if (branch) return branch
  return ""
}

function extractPipelineRunDescription(item: RawPipelineRun): string {
  const drone = parsePipelineRunDroneAnnotation(item)
  const message = readString(drone.message)
  if (message) return message

  const metadata = item.metadata ?? {}
  const value = metadata.annotations?.description
  return typeof value === "string" ? value.trim() : ""
}

function parsePipelineRunDroneAnnotation(item: RawPipelineRun): Record<string, unknown> {
  const metadata = item.metadata ?? {}
  const raw = metadata.annotations?.["tanqidi.com/drone"]
  if (typeof raw !== "string" || !raw.trim()) return {}

  try {
    const parsed = JSON.parse(raw) as unknown
    return asRecord(parsed)
  } catch {
    return {}
  }
}

function extractPipelineRunCreatedUnix(item: RawPipelineRun): number {
  const drone = parsePipelineRunDroneAnnotation(item)
  const created = drone.created
  if (typeof created === "number" && Number.isFinite(created) && created > 0) return Math.trunc(created)
  if (typeof created === "string" && created.trim()) {
    const parsed = Number(created)
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }

  const createdAt = item.metadata?.creationTimestamp
  const ms = Date.parse(createdAt ?? "")
  if (Number.isFinite(ms) && ms > 0) return Math.trunc(ms / 1000)
  return 0
}

function extractPipelineRunCreatedRaw(item: RawPipelineRun): string {
  const drone = parsePipelineRunDroneAnnotation(item)
  const created = drone.created
  if (typeof created === "number" && Number.isFinite(created)) return String(Math.trunc(created))
  if (typeof created === "string" && created.trim()) return created.trim()

  const createdAt = item.metadata?.creationTimestamp
  return typeof createdAt === "string" ? createdAt : ""
}

function extractPipelineRunTriggerTimeDisplay(item: RawPipelineRun): string {
  const raw = extractPipelineRunCreatedRaw(item)
  if (!raw) return "-"

  // Drone created is usually unix seconds; fall back to parsing as ISO datetime.
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds > 0) {
      return formatDateTime(new Date(seconds * 1000).toISOString())
    }
  }

  return formatDateTime(raw)
}

function buildSpec(input: CreatePipelineInput, existingSpec?: Record<string, unknown>): PipelineSpec {
  const workspaceName = normalizeOptionalDnsLabel(input.workspaceName)
  const pipelineProjectName = normalizeOptionalDnsLabel(input.pipelineProjectName)
  const base = existingSpec ? asRecord(existingSpec) : {}
  delete base.description

  return {
    ...base,
    ...(workspaceName ? { workspaceRef: { name: workspaceName } } : {}),
    ...(pipelineProjectName ? { pipelineProjectRef: { name: pipelineProjectName } } : {}),
  }
}

function buildAnnotations(input: CreatePipelineInput): Record<string, string> {
  const annotations = normalizeStringRecord(input.annotations)
  const description = input.description?.trim() ?? ""
  if (description) annotations.description = description
  else delete annotations.description
  return annotations
}

async function fetchPipelineRawByName(name: string): Promise<RawPipeline> {
  const normalizedName = normalizePipelineName(name)
  const { payload } = await fetchResourceByName<RawPipeline>(
    PIPELINE_GVR.group,
    PIPELINE_GVR.version,
    PIPELINE_GVR.resource,
    normalizedName
  )
  return payload
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
      const workspace = extractWorkspace(item)
      const description = extractDescription(item)

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
      return extractPipelineProjectName(items[index] ?? {}) === expectedProject
    })
}

function resolveDroneRepoOption(item: RawDroneRepo): string {
  const slug = readString(item.slug)
  if (slug) return slug

  const fullName = readString(item.full_name)
  if (fullName) return fullName

  const namespace = readString(item.namespace)
  const name = readString(item.name)
  if (namespace && name) return `${namespace}/${name}`
  if (name) return name

  return ""
}

export async function fetchDroneRepoOptions(): Promise<string[]> {
  const { items } = await fetchResourceCollection<RawDroneRepo>("drone", "v1", "repos")
  const options = new Set<string>()

  for (const item of items) {
    const option = resolveDroneRepoOption(item)
    if (option) options.add(option)
  }

  return Array.from(options)
}

export async function fetchPipelineDetail(name: string): Promise<PipelineDetail> {
  const normalizedName = normalizePipelineName(name)
  const payload = await fetchPipelineRawByName(normalizedName)

  const metadata = payload.metadata ?? {}

  return {
    name: metadata.name || normalizedName,
    workspace: extractWorkspace(payload),
    pipelineProjectName: extractPipelineProjectName(payload),
    description: extractDescription(payload),
    labels: normalizeStringRecord(metadata.labels),
    annotations: normalizeStringRecord(metadata.annotations),
  }
}

export async function createPipeline(input: CreatePipelineInput): Promise<void> {
  const name = normalizePipelineName(input.name)
  const labels = normalizeStringRecord(input.labels)
  const annotations = buildAnnotations(input)

  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "Pipeline",
    metadata: {
      name,
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: buildSpec(input),
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
  const labels = normalizeStringRecord(input.labels)
  const annotations = buildAnnotations(input)

  const existing = await fetchPipelineRawByName(name)
  const resourceVersion = readString(existing.metadata?.resourceVersion)
  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "Pipeline",
    metadata: {
      name,
      ...(resourceVersion ? { resourceVersion } : {}),
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: buildSpec(input, asRecord(existing.spec)),
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
  const payload = await fetchPipelineRawByName(name)
  const sanitized =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (() => {
          const root = payload as Record<string, unknown>
          const metadata =
            root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata)
              ? ({ ...(root.metadata as Record<string, unknown>) })
              : null
          if (!metadata) return payload
          delete metadata.managedFields
          return {
            ...root,
            metadata,
          }
        })()
      : payload

  return stringify(sanitized, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  })
}

export async function deletePipeline(name: string): Promise<void> {
  const normalizedName = normalizePipelineName(name)
  await deleteResource(PIPELINE_GVR.group, PIPELINE_GVR.version, PIPELINE_GVR.resource, normalizedName)
}

export async function createPipelineRun(input: CreatePipelineRunInput): Promise<void> {
  const pipelineName = normalizePipelineName(input.pipelineName)
  const triggerType = input.triggerType?.trim() || "manual"
  const data = normalizeStringRecord(input.data)
  const annotations = normalizeStringRecord(input.annotations)

  const requestBody = {
    apiVersion: "tanqidi.com/v1alpha1",
    kind: "PipelineRun",
    metadata: {
      generateName: `${pipelineName}-`,
      labels: {
        pipeline: pipelineName,
      },
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      pipelineRef: {
        name: pipelineName,
      },
      trigger: {
        type: triggerType,
      },
      ...(Object.keys(data).length > 0 ? { data } : {}),
    },
  }

  const url = buildResourceCollectionEndpoint(
    PIPELINE_RUN_GVR.group,
    PIPELINE_RUN_GVR.version,
    PIPELINE_RUN_GVR.resource
  )

  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  })
}

export async function fetchPipelineRunRows(pipelineName: string): Promise<PipelineRunRow[]> {
  const normalizedName = normalizePipelineName(pipelineName)
  const { items } = await fetchResourceCollection<RawPipelineRun>(
    PIPELINE_RUN_GVR.group,
    PIPELINE_RUN_GVR.version,
    PIPELINE_RUN_GVR.resource,
    {
      labelSelector: `pipeline=${normalizedName}`,
    }
  )

  return [...items]
    .sort((a, b) => extractPipelineRunCreatedUnix(b) - extractPipelineRunCreatedUnix(a))
    .map((item, index) => {
      const metadata = item.metadata ?? {}
      const phase = extractPipelineRunPhase(item)
      const buildNumber = extractPipelineRunBuildNumber(item)
      const branch = extractPipelineRunBranch(item)
      const buildLink = extractPipelineRunBuildLink(item)
      const description = extractPipelineRunDescription(item)

      return {
        id: metadata.uid || metadata.name || `pipelinerun-${index}`,
        name: metadata.name || "-",
        description: description || "-",
        pipeline: normalizedName,
        phase: phase || "-",
        buildNumber: buildNumber || "-",
        branch: branch || "-",
        buildLink: buildLink || "",
        triggerTime: extractPipelineRunTriggerTimeDisplay(item),
      }
    })
}

export async function deletePipelineRun(name: string): Promise<void> {
	const normalizedName = normalizePipelineName(name)
	await deleteResource(
		PIPELINE_RUN_GVR.group,
		PIPELINE_RUN_GVR.version,
		PIPELINE_RUN_GVR.resource,
		normalizedName
	)
}
