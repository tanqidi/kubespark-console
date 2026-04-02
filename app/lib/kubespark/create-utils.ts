import { buildResourceCollectionEndpoint, fetchJsonDeduped } from "./common"

export type JsonObject = Record<string, unknown>

export type ResourceMetadata = {
  name: string
  namespace: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export type BaseCreateInput = {
  name: string
  namespace: string
  description?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
}

export type ExistenceCheckInput = {
  name: string
  namespace: string
}

export function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

export function normalizeKubernetesResourceName(name: string): string {
  const value = name.trim().toLowerCase()
  const isValid =
    /^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(value) && value.length <= 253

  if (!isValid) {
    throw new Error(
      "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"
    )
  }

  return value
}

export function buildMetadata(input: BaseCreateInput): ResourceMetadata {
  const name = normalizeKubernetesResourceName(input.name)
  const namespace = input.namespace.trim()

  if (!namespace) {
    throw new Error("请选择项目")
  }

  const description = input.description?.trim() ?? ""
  const labels = Object.fromEntries(
    Object.entries(input.labels ?? {}).filter(
      ([key, value]) => key.trim().length > 0 && value.trim().length >= 0
    )
  ) as Record<string, string>
  const annotations = Object.fromEntries(
    Object.entries(input.annotations ?? {}).filter(
      ([key, value]) => key.trim().length > 0 && value.trim().length >= 0
    )
  ) as Record<string, string>
  if (description) annotations.description = description
  else delete annotations.description

  return {
    name,
    namespace,
    ...(Object.keys(labels).length > 0 ? { labels } : {}),
    ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
  }
}

export function buildDescriptionPatch(description?: string): { annotations: { description: string | null } } {
  const value = description?.trim() ?? ""
  return {
    annotations: {
      description: value || null,
    },
  }
}

export async function checkNamespacedResourceExists(params: {
  group: string
  version: string
  resource: string
  input: ExistenceCheckInput
}): Promise<boolean> {
  const metadata = buildMetadata({
    name: params.input.name,
    namespace: params.input.namespace,
  })

  const fieldSelector = `metadata.name=${metadata.name}`

  const readItems = (payload: unknown): unknown[] => {
    const root = asObject(payload)
    return Array.isArray(root.items) ? root.items : []
  }

  const hasMatchedName = (items: unknown[]): boolean =>
    items.some((item) => {
      const metadataObj = asObject(asObject(item).metadata)
      return typeof metadataObj.name === "string" && metadataObj.name === metadata.name
    })

  const fieldSelectorUrl = buildResourceCollectionEndpoint(
    params.group,
    params.version,
    params.resource,
    {
      namespace: metadata.namespace,
      fieldSelector,
    }
  )

  try {
    const payload = await fetchJsonDeduped<unknown>(fieldSelectorUrl)
    return hasMatchedName(readItems(payload))
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ""
    const canFallback =
      message.includes("状态码 404") ||
      message.includes("not found") ||
      message.includes("fieldselector")

    if (!canFallback) throw error

    const fallbackUrl = buildResourceCollectionEndpoint(
      params.group,
      params.version,
      params.resource,
      {
        namespace: metadata.namespace,
      }
    )
    const fallbackPayload = await fetchJsonDeduped<unknown>(fallbackUrl)
    return hasMatchedName(readItems(fallbackPayload))
  }
}

