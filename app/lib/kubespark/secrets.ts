import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
  fetchResourceCollection,
  fetchResourceByName,
} from "./common"
import {
  asObject,
  buildDescriptionPatch,
  buildMetadata,
  checkNamespacedResourceExists,
  type BaseCreateInput,
  type ExistenceCheckInput,
} from "./create-utils"

export type CreateSecretInput = BaseCreateInput & {
  type?: string
  stringData?: Record<string, string>
}

export type UpdateSecretInput = BaseCreateInput & {
  type?: string
  stringData?: Record<string, string>
}

export type SecretKeyRefOption = {
  name: string
  keys: string[]
}

export type SecretEntry = {
  key: string
  value: string
}

type RawSecretForKeyRef = {
  metadata?: {
    name?: string
  }
  data?: Record<string, unknown>
  stringData?: Record<string, unknown>
}

function toSortedUniqueKeys(keys: string[]): string[] {
  return Array.from(
    new Set(
      keys
        .map((key) => key.trim())
        .filter((key) => key.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b))
}

function decodeBase64ToUtf8(value: string): string {
  try {
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const binary = window.atob(value)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    }
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf8")
    }
  } catch {
    return value
  }
  return value
}

function normalizeSecretEntryValue(value: unknown): string {
  if (typeof value === "string") return decodeBase64ToUtf8(value)
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

export async function fetchSecretKeyRefOptions(
  namespace: string
): Promise<SecretKeyRefOption[]> {
  const ns = namespace.trim()
  if (!ns) return []

  const { items } = await fetchResourceCollection<RawSecretForKeyRef>("core", "v1", "secrets", {
    namespace: ns,
  })

  return items
    .map((item) => {
      const metadata = asObject(item.metadata)
      const name = typeof metadata.name === "string" ? metadata.name.trim() : ""
      if (!name) return null

      const dataKeys = Object.keys(asObject(item.data))
      const stringDataKeys = Object.keys(asObject(item.stringData))
      return {
        name,
        keys: toSortedUniqueKeys([...dataKeys, ...stringDataKeys]),
      }
    })
    .filter((item): item is SecretKeyRefOption => Boolean(item))
}

export async function fetchSecretEntries(
  namespace: string,
  name: string
): Promise<SecretEntry[]> {
  const ns = namespace.trim()
  const resourceName = name.trim()
  if (!ns || !resourceName) return []

  const { payload } = await fetchResourceByName<RawSecretForKeyRef>(
    "core",
    "v1",
    "secrets",
    resourceName,
    { namespace: ns }
  )

  const stringData = asObject(payload.stringData)
  const data = asObject(payload.data)
  const keySet = new Set([...Object.keys(stringData), ...Object.keys(data)])

  return Array.from(keySet)
    .map((key) => key.trim())
    .filter((key) => key.length > 0)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => ({
      key,
      value: key in stringData ? String(stringData[key] ?? "") : normalizeSecretEntryValue(data[key]),
    }))
}

function encodeBase64Utf8(value: string): string {
  if (typeof window !== "undefined" && typeof window.btoa === "function") {
    const bytes = new TextEncoder().encode(value)
    let binary = ""
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte)
    })
    return window.btoa(binary)
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64")
  }

  throw new Error("当前环境不支持 Base64 编码")
}

export async function checkSecretExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "core",
    version: "v1",
    resource: "secrets",
    input,
  })
}

export async function createSecret(input: CreateSecretInput): Promise<void> {
  const metadata = buildMetadata(input)
  const secretType = input.type?.trim() || "Opaque"
  const requestBody = {
    apiVersion: "v1",
    kind: "Secret",
    metadata,
    type: secretType,
    ...(input.stringData && Object.keys(input.stringData).length > 0
      ? { stringData: input.stringData }
      : {}),
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "secrets", {
    namespace: metadata.namespace,
  })

  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}

export async function updateSecret(input: UpdateSecretInput): Promise<void> {
  const metadata = buildMetadata(input)
  const secretType = input.type?.trim() || "Opaque"
  const stringData = input.stringData ?? {}
  const encodedData = Object.fromEntries(
    Object.entries(stringData).map(([key, value]) => [key, encodeBase64Utf8(value)])
  ) as Record<string, string>
  const { payload } = await fetchResourceByName<unknown>("core", "v1", "secrets", metadata.name, {
    namespace: metadata.namespace,
  })
  const existing = asObject(payload)
  const existingMetadata = asObject(existing.metadata)
  const existingAnnotations = asObject(existingMetadata.annotations)
  const mergedAnnotationsBase = {
    ...existingAnnotations,
    ...buildDescriptionPatch(input.description).annotations,
  }
  const mergedAnnotations =
    mergedAnnotationsBase.description === null
      ? (({ description: _description, ...rest }) => rest)(mergedAnnotationsBase)
      : mergedAnnotationsBase

  const requestBody = {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: metadata.name,
      namespace: metadata.namespace,
      resourceVersion:
        typeof existingMetadata.resourceVersion === "string"
          ? existingMetadata.resourceVersion
          : undefined,
      ...(Object.keys(mergedAnnotations).length > 0 ? { annotations: mergedAnnotations } : {}),
      ...(typeof existingMetadata.labels === "object" && existingMetadata.labels !== null
        ? { labels: existingMetadata.labels }
        : {}),
    },
    type: secretType,
    ...(typeof existing.immutable === "boolean" ? { immutable: existing.immutable } : {}),
    data: encodedData,
  }

  const url = buildResourceItemEndpoint("core", "v1", "secrets", metadata.name, metadata.namespace)

  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}
