import { stringify } from "yaml"

export type ResourceDocumentType =
  | "pod"
  | "service"
  | "configmap"
  | "secret"
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

function decodeBase64ToUtf8(value: string): string | null {
  const normalized = value.replace(/\s+/g, "")
  if (!normalized) return null

  const padding = normalized.length % 4
  const base64 = padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`

  try {
    if (typeof atob === "function") {
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(base64, "base64").toString("utf8")
    }
  } catch {
    return null
  }

  return null
}

function isReadableText(value: string): boolean {
  if (!value) return true
  if (value.includes("\u0000")) return false

  let controlCount = 0
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    const allowedControl = code === 0x09 || code === 0x0a || code === 0x0d
    if (code < 0x20 && !allowedControl) controlCount += 1
  }

  return controlCount / value.length < 0.05
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

function normalizeConfigMapDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "ConfigMap",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("data" in root) normalized.data = root.data
  if ("binaryData" in root) normalized.binaryData = root.binaryData
  if ("immutable" in root) normalized.immutable = root.immutable

  Object.keys(root).forEach((key) => {
    if (
      key === "kind" ||
      key === "apiVersion" ||
      key === "metadata" ||
      key === "data" ||
      key === "binaryData" ||
      key === "immutable" ||
      key === "status"
    ) {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeSecretDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)
  const data = asObject(root.data)
  const decodedStringData: Record<string, string> = {}
  const remainingData: Record<string, string> = {}

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value !== "string") return
    const decoded = decodeBase64ToUtf8(value)
    if (decoded !== null && isReadableText(decoded)) {
      decodedStringData[key] = decoded
    } else {
      remainingData[key] = value
    }
  })

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Secret",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("type" in root) normalized.type = root.type
  if (Object.keys(remainingData).length > 0) normalized.data = remainingData
  if (Object.keys(decodedStringData).length > 0) normalized.stringData = decodedStringData
  if ("stringData" in root) {
    normalized.stringData = {
      ...asObject(normalized.stringData),
      ...asObject(root.stringData),
    }
  }
  if ("immutable" in root) normalized.immutable = root.immutable

  Object.keys(root).forEach((key) => {
    if (
      key === "kind" ||
      key === "apiVersion" ||
      key === "metadata" ||
      key === "type" ||
      key === "data" ||
      key === "stringData" ||
      key === "immutable" ||
      key === "status"
    ) {
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
  if (type === "configmap") return normalizeConfigMapDocument(payload)
  if (type === "secret") return normalizeSecretDocument(payload)
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
