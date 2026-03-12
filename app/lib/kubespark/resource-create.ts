import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchResourceCollection,
  fetchResourceByName,
  fetchJsonDeduped,
} from "./common"

function normalizeKubernetesResourceName(name: string): string {
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

type ResourceMetadata = {
  name: string
  namespace: string
  annotations?: Record<string, string>
}

type BaseCreateInput = {
  name: string
  namespace: string
  description?: string
}

export type CreateConfigMapInput = BaseCreateInput & {
  data?: Record<string, string>
}

export type CreateSecretInput = BaseCreateInput & {
  type?: string
  stringData?: Record<string, string>
}

export type UpdateConfigMapInput = BaseCreateInput & {
  data?: Record<string, string>
}

export type UpdateSecretInput = BaseCreateInput & {
  type?: string
  stringData?: Record<string, string>
}

export type CreateServiceInput = BaseCreateInput & {
  internalAccessMode?: "virtual-ip" | "headless"
  enableNodePort?: boolean
  enableSessionAffinity?: boolean
  selectors?: Record<string, string>
  ports?: Array<{
    protocol:
      | "GRPC"
      | "HTTP"
      | "HTTP2"
      | "HTTPS"
      | "MONGO"
      | "REDIS"
      | "TCP"
      | "TLS"
      | "UDP"
      | "SCTP"
    name?: string
    targetPort: number
    servicePort: number
  }>
}

export type UpdateServiceInput = BaseCreateInput & {
  internalAccessMode?: "virtual-ip" | "headless"
  enableNodePort?: boolean
  enableSessionAffinity?: boolean
  selectors?: Record<string, string>
  ports?: Array<{
    protocol:
      | "GRPC"
      | "HTTP"
      | "HTTP2"
      | "HTTPS"
      | "MONGO"
      | "REDIS"
      | "TCP"
      | "TLS"
      | "UDP"
      | "SCTP"
    name?: string
    targetPort: number
    servicePort: number
  }>
}

type ExistenceCheckInput = {
  name: string
  namespace: string
}

function buildMetadata(input: BaseCreateInput): ResourceMetadata {
  const name = normalizeKubernetesResourceName(input.name)
  const namespace = input.namespace.trim()

  if (!namespace) {
    throw new Error("请选择项目")
  }

  const description = input.description?.trim() ?? ""

  return {
    name,
    namespace,
    ...(description
      ? {
          annotations: {
            description,
          },
        }
      : {}),
  }
}

async function checkNamespacedResourceExists(
  resource: "configmaps" | "secrets" | "services",
  input: ExistenceCheckInput
): Promise<boolean> {
  const metadata = buildMetadata({
    name: input.name,
    namespace: input.namespace,
  })

  const { items } = await fetchResourceCollection(
    "core",
    "v1",
    resource,
    {
      namespace: metadata.namespace,
      fieldSelector: `metadata.name=${metadata.name}`,
    }
  )

  return items.length > 0
}

export async function checkConfigMapExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists("configmaps", input)
}

export async function checkSecretExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists("secrets", input)
}

export async function checkServiceExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists("services", input)
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

export async function createService(input: CreateServiceInput): Promise<void> {
  const metadata = buildMetadata(input)
  const internalAccessMode = input.internalAccessMode ?? "virtual-ip"
  const enableNodePort = Boolean(input.enableNodePort) && internalAccessMode !== "headless"
  const enableSessionAffinity = Boolean(input.enableSessionAffinity)
  const selector = input.selectors ?? {}
  const ports = input.ports ?? []

  const requestBody = {
    apiVersion: "v1",
    kind: "Service",
    metadata,
    spec: {
      type: internalAccessMode === "headless" ? "ClusterIP" : enableNodePort ? "NodePort" : "ClusterIP",
      ...(internalAccessMode === "headless" ? { clusterIP: "None" } : {}),
      ...(enableSessionAffinity ? { sessionAffinity: "ClientIP" } : { sessionAffinity: "None" }),
      ...(Object.keys(selector).length > 0 ? { selector } : {}),
      ...(ports.length > 0
        ? {
            ports: ports.map((port) => ({
              protocol: port.protocol,
              ...(port.name ? { name: port.name } : {}),
              port: port.servicePort,
              targetPort: port.targetPort,
            })),
          }
        : {}),
    },
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "services", {
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

export async function updateService(input: UpdateServiceInput): Promise<void> {
  const metadata = buildMetadata(input)
  const internalAccessMode = input.internalAccessMode ?? "virtual-ip"
  const enableNodePort = Boolean(input.enableNodePort) && internalAccessMode !== "headless"
  const enableSessionAffinity = Boolean(input.enableSessionAffinity)
  const selector = input.selectors ?? {}
  const ports = input.ports ?? []

  const { payload } = await fetchResourceByName<unknown>("core", "v1", "services", metadata.name, {
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
    kind: "Service",
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
    spec: {
      type: internalAccessMode === "headless" ? "ClusterIP" : enableNodePort ? "NodePort" : "ClusterIP",
      ...(internalAccessMode === "headless" ? { clusterIP: "None" } : {}),
      ...(enableSessionAffinity ? { sessionAffinity: "ClientIP" } : { sessionAffinity: "None" }),
      ...(Object.keys(selector).length > 0 ? { selector } : {}),
      ...(ports.length > 0
        ? {
            ports: ports.map((port) => ({
              protocol: port.protocol,
              ...(port.name ? { name: port.name } : {}),
              port: port.servicePort,
              targetPort: port.targetPort,
            })),
          }
        : {}),
    },
  }

  const url = buildResourceItemEndpoint("core", "v1", "services", metadata.name, metadata.namespace)
  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}

function buildDescriptionPatch(description?: string): { annotations: { description: string | null } } {
  const value = description?.trim() ?? ""
  return {
    annotations: {
      description: value || null,
    },
  }
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
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
