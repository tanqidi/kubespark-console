import { stringify } from "yaml"

export type ResourceDocumentType =
  | "pod"
  | "service"
  | "deployment"
  | "statefulset"
  | "daemonset"
  | "namespace"
export type ResourceDocumentOutput = "yaml" | "json"
export type ResourceDocumentLanguage = "yaml" | "json"

export type ResourceDocumentResult = {
  normalized: unknown
  text: string
  language: ResourceDocumentLanguage
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function normalizeManifestMetadata(value: unknown): JsonObject {
  const metadata = { ...asObject(value) }
  delete metadata.uid
  delete metadata.resourceVersion
  delete metadata.generation
  delete metadata.creationTimestamp
  delete metadata.deletionTimestamp
  delete metadata.deletionGracePeriodSeconds
  delete metadata.managedFields
  delete metadata.ownerReferences
  delete metadata.selfLink
  return metadata
}

function normalizePodDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = { ...asObject(root.metadata) }
  delete metadata.ownerReferences
  delete metadata.managedFields

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Pod",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if ("metadata" in root) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeServiceDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Service",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeDeploymentDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Deployment",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "apps/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeStatefulSetDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "StatefulSet",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "apps/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeDaemonSetDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "DaemonSet",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "apps/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeNamespaceDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Namespace",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeDocumentByType(type: ResourceDocumentType, payload: unknown): unknown {
  if (type === "pod") return normalizePodDocument(payload)
  if (type === "service") return normalizeServiceDocument(payload)
  if (type === "deployment") return normalizeDeploymentDocument(payload)
  if (type === "statefulset") return normalizeStatefulSetDocument(payload)
  if (type === "daemonset") return normalizeDaemonSetDocument(payload)
  if (type === "namespace") return normalizeNamespaceDocument(payload)
  return payload
}

export function buildResourceDocument(params: {
  type: ResourceDocumentType
  payload: unknown
  output?: ResourceDocumentOutput
}): ResourceDocumentResult {
  const { type, payload, output = "yaml" } = params
  const normalized = normalizeDocumentByType(type, payload)

  if (output === "json") {
    return {
      normalized,
      text: JSON.stringify(normalized, null, 2),
      language: "json",
    }
  }

  return {
    normalized,
    text: stringify(normalized, {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }),
    language: "yaml",
  }
}
