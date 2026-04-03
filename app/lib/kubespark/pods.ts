import {
  API_PROXY_BASE,
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
  fetchText,
  deleteResource,
  fetchResourceByName,
  fetchResourceCollection,
} from "./common"
import { buildResourceDocument } from "./resource-document"
import {
  asObject,
  buildDescriptionPatch,
  buildMetadata,
  checkNamespacedResourceExists,
  type BaseCreateInput,
  type ExistenceCheckInput,
} from "./create-utils"
import {
  formatAge,
  resolveDescriptionFromAnnotations,
  resolveUpdatedAt,
} from "./utils"
import { applyStorageToPodSpec, type PodStorageItemInput } from "./pod-storage"

export type PodStatusKey = "running" | "pending" | "failed" | "succeeded" | "unknown"

export type PodRow = {
  id: string
  name: string
  namespace: string
  status: PodStatusKey
  node: string
  age: string
}

export type PodResourceRow = {
  id: string
  name: string
  description: string
  status: string
  namespace: string
  node: string
  ip: string
  age: string
  updatedAt: string
}

type RawPod = {
  metadata?: {
    uid?: string
    name?: string
    namespace?: string
    annotations?: Record<string, string>
    creationTimestamp?: string
  }
  status?: {
    phase?: string
    hostIP?: string
    podIP?: string
  }
  spec?: {
    nodeName?: string
  }
}

export type PodYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

export type PodLogsResult = {
  requestUrl: string
  text: string
}

export function buildPodLogsEndpoint(
  namespace: string,
  name: string,
  options?: { container?: string; tailLines?: number; follow?: boolean }
): string {
  const itemUrl = buildResourceItemEndpoint("core", "v1", "pods", name, namespace)
  const [basePath, queryString = ""] = itemUrl.split("?")
  const params = new URLSearchParams(queryString)

  if (options?.container?.trim()) params.set("container", options.container.trim())
  if (typeof options?.tailLines === "number" && Number.isFinite(options.tailLines) && options.tailLines > 0) {
    params.set("tailLines", String(Math.floor(options.tailLines)))
  }
  if (typeof options?.follow === "boolean") {
    params.set("follow", String(options.follow))
  }

  return `${basePath}/log${params.toString() ? `?${params.toString()}` : ""}`
}

export function buildPodExecWsEndpoint(
  namespace: string,
  name: string,
  options?: {
    container?: string
    command?: string[]
    tty?: boolean
    token?: string
  }
): string {
  const params = new URLSearchParams()
  params.set("namespace", namespace)
  if (options?.container?.trim()) params.set("container", options.container.trim())
  if (typeof options?.tty === "boolean") params.set("tty", String(options.tty))
  if (options?.token?.trim()) params.set("token", options.token.trim())
  if (Array.isArray(options?.command)) {
    options.command
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => params.append("command", item))
  }

  const routePath = `/kapis/v1alpha1/resources/core/v1/pods/${encodeURIComponent(name)}/exec`
  const explicitBase = process.env.NEXT_PUBLIC_KUBESPARK_WS_BASE?.trim()
  if (explicitBase) {
    const normalized = explicitBase.endsWith("/") ? explicitBase.slice(0, -1) : explicitBase
    return `${normalized}${routePath}?${params.toString()}`
  }

  if (typeof window !== "undefined") {
    if (/^https?:\/\//.test(API_PROXY_BASE)) {
      try {
        const parsed = new URL(API_PROXY_BASE)
        const protocol = parsed.protocol === "https:" ? "wss" : "ws"
        return `${protocol}://${parsed.host}${routePath}?${params.toString()}`
      } catch {
        // fallback below
      }
    }

    // Dev fallback: frontend usually on :3000, backend on :8080.
    if (window.location.port === "3000") {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws"
      return `${protocol}://${window.location.hostname}:8080${routePath}?${params.toString()}`
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws"
    return `${protocol}://${window.location.host}${routePath}?${params.toString()}`
  }

  return `ws://localhost:8080${routePath}?${params.toString()}`
}

export type CreatePodInput = BaseCreateInput & {
  container?: {
    name?: string
    image: string
    imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
    port?: {
      protocol?: "TCP" | "UDP" | "SCTP"
      name?: string
      containerPort: string
    }
  }
  restartPolicy?: "Never" | "OnFailure"
  podSpec?: Record<string, unknown>
  storageList?: PodStorageItemInput[]
}

export type UpdatePodInput = BaseCreateInput & {
  container?: {
    name?: string
    image: string
    imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
    port?: {
      protocol?: "TCP" | "UDP" | "SCTP"
      name?: string
      containerPort: string
    }
  }
  restartPolicy?: "Never" | "OnFailure"
  podSpec?: Record<string, unknown>
  storageList?: PodStorageItemInput[]
}

function phaseToStatusKey(phase?: string): PodStatusKey {
  switch (phase) {
    case "Running":
      return "running"
    case "Pending":
      return "pending"
    case "Failed":
      return "failed"
    case "Succeeded":
      return "succeeded"
    default:
      return "unknown"
  }
}

function phaseToStatusLabel(phase?: string): string {
  if (!phase) return "Unknown"
  return phase
}

function toDnsLabelFragment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/\.+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized.slice(0, 63)
}

function resolveContainerName(name: string | undefined, image: string): string {
  const fromName = toDnsLabelFragment(name ?? "")
  if (fromName) return fromName

  const raw = image.trim()
  const withoutDigest = raw.includes("@") ? raw.split("@")[0] ?? raw : raw
  const lastSegment = withoutDigest.split("/").filter(Boolean).pop() ?? withoutDigest
  const tagIndex = lastSegment.lastIndexOf(":")
  const withoutTag = tagIndex > 0 ? lastSegment.slice(0, tagIndex) : lastSegment
  const fromImage = toDnsLabelFragment(withoutTag)
  return fromImage || "container-1"
}

function pickContainerPortNumber(value: unknown): number | undefined {
  const text = typeof value === "string" ? value.trim() : ""
  if (!/^\d+$/.test(text)) return undefined
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) return undefined
  return parsed
}

function pickPortProtocol(value: unknown): "TCP" | "UDP" | "SCTP" | undefined {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (normalized === "TCP" || normalized === "UDP" || normalized === "SCTP") return normalized
  return undefined
}

export async function checkPodExists(input: ExistenceCheckInput): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "core",
    version: "v1",
    resource: "pods",
    input,
  })
}

export async function createPod(input: CreatePodInput): Promise<void> {
  const metadata = buildMetadata(input)
  let spec: Record<string, unknown> | null = null

  if (input.podSpec && typeof input.podSpec === "object" && !Array.isArray(input.podSpec)) {
    const parsed = asObject(input.podSpec)
    spec = {
      ...parsed,
      restartPolicy:
        parsed.restartPolicy === "OnFailure" || parsed.restartPolicy === "Never"
          ? parsed.restartPolicy
          : "Never",
    }
  } else if (input.container) {
    const image = input.container.image.trim()
    if (!image) throw new Error("请输入镜像地址")

    const containerName = resolveContainerName(input.container.name, image)
    const parsedPort = pickContainerPortNumber(input.container.port?.containerPort)
    const protocol = pickPortProtocol(input.container.port?.protocol)
    const portName = typeof input.container.port?.name === "string" ? input.container.port.name.trim() : ""
    const ports =
      typeof parsedPort === "number"
        ? [
            {
              containerPort: parsedPort,
              ...(portName ? { name: portName } : {}),
              ...(protocol ? { protocol } : {}),
            },
          ]
        : []

    const containerSpec: Record<string, unknown> = {
      name: containerName,
      image,
      ...(input.container.imagePullPolicy ? { imagePullPolicy: input.container.imagePullPolicy } : {}),
      ...(ports.length > 0 ? { ports } : {}),
    }

    const containerRefs = [
      {
        rawName: containerName,
        resolvedName: containerName,
        spec: containerSpec,
      },
    ]
    const volumes: Array<Record<string, unknown>> = []
    applyStorageToPodSpec(input.storageList, containerRefs, volumes)
    spec = {
      restartPolicy: input.restartPolicy === "OnFailure" ? "OnFailure" : "Never",
      containers: [containerSpec],
      ...(volumes.length > 0 ? { volumes } : {}),
    }
  } else {
    throw new Error("缺少容器配置")
  }

  const requestBody = {
    apiVersion: "v1",
    kind: "Pod",
    metadata,
    spec,
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "pods", {
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

export async function updatePod(input: UpdatePodInput): Promise<void> {
  const metadata = buildMetadata(input)
  const { payload } = await fetchResourceByName<unknown>("core", "v1", "pods", metadata.name, {
    namespace: metadata.namespace,
  })
  const existing = asObject(payload)
  const existingMetadata = asObject(existing.metadata)
  const annotations = Object.fromEntries(
    Object.entries(input.annotations ?? {}).filter(
      ([key, value]) => key.trim().length > 0 && value.trim().length >= 0
    )
  ) as Record<string, string>
  const nextDescription = buildDescriptionPatch(input.description).annotations.description
  if (typeof nextDescription === "string" && nextDescription.trim()) {
    annotations.description = nextDescription.trim()
  } else {
    delete annotations.description
  }
  const labels = Object.fromEntries(
    Object.entries(input.labels ?? {}).filter(
      ([key, value]) => key.trim().length > 0 && value.trim().length >= 0
    )
  ) as Record<string, string>

  let spec: Record<string, unknown> | null = null
  if (input.podSpec && typeof input.podSpec === "object" && !Array.isArray(input.podSpec)) {
    const parsed = asObject(input.podSpec)
    spec = {
      ...parsed,
      restartPolicy:
        parsed.restartPolicy === "OnFailure" || parsed.restartPolicy === "Never"
          ? parsed.restartPolicy
          : "Never",
    }
  } else if (input.container) {
    const image = input.container.image.trim()
    if (!image) throw new Error("请输入镜像地址")
    const containerName = resolveContainerName(input.container.name, image)
    const parsedPort = pickContainerPortNumber(input.container.port?.containerPort)
    const protocol = pickPortProtocol(input.container.port?.protocol)
    const portName = typeof input.container.port?.name === "string" ? input.container.port.name.trim() : ""
    const ports =
      typeof parsedPort === "number"
        ? [
            {
              containerPort: parsedPort,
              ...(portName ? { name: portName } : {}),
              ...(protocol ? { protocol } : {}),
            },
          ]
        : []

    const containerSpec: Record<string, unknown> = {
      name: containerName,
      image,
      ...(input.container.imagePullPolicy ? { imagePullPolicy: input.container.imagePullPolicy } : {}),
      ...(ports.length > 0 ? { ports } : {}),
    }

    const containerRefs = [
      {
        rawName: containerName,
        resolvedName: containerName,
        spec: containerSpec,
      },
    ]
    const volumes: Array<Record<string, unknown>> = []
    applyStorageToPodSpec(input.storageList, containerRefs, volumes)
    spec = {
      restartPolicy: input.restartPolicy === "OnFailure" ? "OnFailure" : "Never",
      containers: [containerSpec],
      ...(volumes.length > 0 ? { volumes } : {}),
    }
  } else {
    throw new Error("缺少容器配置")
  }

  const requestBody = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: {
      name: metadata.name,
      namespace: metadata.namespace,
      resourceVersion:
        typeof existingMetadata.resourceVersion === "string"
          ? existingMetadata.resourceVersion
          : undefined,
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      ...(Object.keys(labels).length > 0 ? { labels } : {}),
    },
    spec,
  }

  const url = buildResourceItemEndpoint("core", "v1", "pods", metadata.name, metadata.namespace)
  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}

export function podPayloadToEditorText(payload: unknown): string {
  return buildResourceDocument({
    type: "pod",
    payload,
    output: "yaml",
  }).text
}

export function buildNamespacedPodEndpoint(namespace: string, name: string): string {
  return buildResourceCollectionEndpoint("core", "v1", "pods", {
    namespace,
    fieldSelector: `metadata.name=${name}`,
  })
}

export async function fetchNamespacedPodYaml(namespace: string, name: string): Promise<PodYamlResult> {
  const { requestUrl, payload } = await fetchResourceByName<unknown>(
    "core",
    "v1",
    "pods",
    name,
    { namespace }
  )
  return {
    requestUrl,
    payload,
    text: podPayloadToEditorText(payload),
  }
}

export async function fetchNamespacedPodLogs(
  namespace: string,
  name: string,
  options?: { container?: string; tailLines?: number }
): Promise<PodLogsResult> {
  const requestUrl = buildPodLogsEndpoint(namespace, name, options)
  const text = await fetchText(requestUrl)

  return { requestUrl, text }
}

export async function deletePod(namespace: string, name: string): Promise<void> {
  return deleteResource("core", "v1", "pods", name, namespace)
}

export async function fetchPods(): Promise<PodRow[]> {
  const { items } = await fetchResourceCollection<RawPod>("core", "v1", "pods")

  return items.map((item, index) => {
    const metadata = item.metadata || {}
    const status = item.status || {}
    const spec = item.spec || {}
    const name = metadata.name || "-"

    return {
      id: metadata.uid || `${name}-${index}`,
      name,
      namespace: metadata.namespace || "default",
      status: phaseToStatusKey(status.phase),
      node: spec.nodeName || status.hostIP || "-",
      age: formatAge(metadata.creationTimestamp),
    }
  })
}

export async function fetchPodResourceRows(limit = 300): Promise<PodResourceRow[]> {
  const { items } = await fetchResourceCollection<RawPod>("core", "v1", "pods")

  return items.slice(0, limit).map((item, index) => {
    const metadata = item.metadata || {}
    const status = item.status || {}
    const spec = item.spec || {}
    const name = metadata.name || "-"

    return {
      id: metadata.uid || `${name}-${index}`,
      name,
      description: resolveDescriptionFromAnnotations(metadata.annotations),
      status: phaseToStatusLabel(status.phase),
      namespace: metadata.namespace || "default",
      node: spec.nodeName || status.hostIP || "-",
      ip: status.podIP || "-",
      age: formatAge(metadata.creationTimestamp),
      updatedAt: resolveUpdatedAt(item),
    }
  })
}
