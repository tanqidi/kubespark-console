import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
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
  const mergedAnnotations = {
    ...existingAnnotations,
    ...buildDescriptionPatch(input.description).annotations,
  }
  if (mergedAnnotations.description === null) {
    delete mergedAnnotations.description
  }

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

