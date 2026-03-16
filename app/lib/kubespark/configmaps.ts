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

export type CreateConfigMapInput = BaseCreateInput & {
  data?: Record<string, string>
}

export type UpdateConfigMapInput = BaseCreateInput & {
  data?: Record<string, string>
}

export type ConfigMapKeyRefOption = {
  name: string
  keys: string[]
}

type RawConfigMapForKeyRef = {
  metadata?: {
    name?: string
  }
  data?: Record<string, unknown>
  binaryData?: Record<string, unknown>
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

export async function fetchConfigMapKeyRefOptions(
  namespace: string
): Promise<ConfigMapKeyRefOption[]> {
  const ns = namespace.trim()
  if (!ns) return []

  const { items } = await fetchResourceCollection<RawConfigMapForKeyRef>("core", "v1", "configmaps", {
    namespace: ns,
  })

  return items
    .map((item) => {
      const metadata = asObject(item.metadata)
      const name = typeof metadata.name === "string" ? metadata.name.trim() : ""
      if (!name) return null

      const dataKeys = Object.keys(asObject(item.data))
      const binaryDataKeys = Object.keys(asObject(item.binaryData))
      return {
        name,
        keys: toSortedUniqueKeys([...dataKeys, ...binaryDataKeys]),
      }
    })
    .filter((item): item is ConfigMapKeyRefOption => Boolean(item))
}

export async function checkConfigMapExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "core",
    version: "v1",
    resource: "configmaps",
    input,
  })
}

export async function createConfigMap(
  input: CreateConfigMapInput
): Promise<void> {
  const metadata = buildMetadata(input)
  const requestBody = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata,
    ...(input.data && Object.keys(input.data).length > 0
      ? { data: input.data }
      : {}),
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "configmaps", {
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

export async function updateConfigMap(input: UpdateConfigMapInput): Promise<void> {
  const metadata = buildMetadata(input)
  const { payload } = await fetchResourceByName<unknown>("core", "v1", "configmaps", metadata.name, {
    namespace: metadata.namespace,
  })
  const existing = asObject(payload)
  const existingMetadata = asObject(existing.metadata)
  const existingAnnotations = asObject(existingMetadata.annotations)
  const mergedAnnotations = {
    ...existingAnnotations,
    ...buildDescriptionPatch(input.description).annotations,
  }
  if (mergedAnnotations.description === null) {
    delete mergedAnnotations.description
  }

  const requestBody = {
    apiVersion: "v1",
    kind: "ConfigMap",
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
    ...(typeof existing.immutable === "boolean" ? { immutable: existing.immutable } : {}),
    data: input.data ?? {},
  }

  const url = buildResourceItemEndpoint("core", "v1", "configmaps", metadata.name, metadata.namespace)

  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}
