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

export type ServicePortProtocol =
  | "TCP"
  | "UDP"
  | "SCTP"

export type ServicePortInput = {
  protocol: ServicePortProtocol
  name?: string
  targetPort: number
  servicePort: number
}

export type CreateServiceInput = BaseCreateInput & {
  internalAccessMode?: "virtual-ip" | "headless"
  enableNodePort?: boolean
  enableSessionAffinity?: boolean
  selectors?: Record<string, string>
  ports?: ServicePortInput[]
}

export type UpdateServiceInput = BaseCreateInput & {
  internalAccessMode?: "virtual-ip" | "headless"
  enableNodePort?: boolean
  enableSessionAffinity?: boolean
  selectors?: Record<string, string>
  ports?: ServicePortInput[]
}

export async function checkServiceExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "core",
    version: "v1",
    resource: "services",
    input,
  })
}

function buildServiceSpec(input: {
  internalAccessMode?: "virtual-ip" | "headless"
  enableNodePort?: boolean
  enableSessionAffinity?: boolean
  selectors?: Record<string, string>
  ports?: ServicePortInput[]
}) {
  const internalAccessMode = input.internalAccessMode ?? "virtual-ip"
  const enableNodePort = Boolean(input.enableNodePort) && internalAccessMode !== "headless"
  const enableSessionAffinity = Boolean(input.enableSessionAffinity)
  const selector = input.selectors ?? {}
  const ports = input.ports ?? []

  return {
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
  }
}

export async function createService(input: CreateServiceInput): Promise<void> {
  const metadata = buildMetadata(input)
  const requestBody = {
    apiVersion: "v1",
    kind: "Service",
    metadata,
    spec: buildServiceSpec(input),
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
    spec: buildServiceSpec(input),
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
