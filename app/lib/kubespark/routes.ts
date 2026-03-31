import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
  fetchResourceByName,
} from "./common"
import {
  checkNamespacedResourceExists,
  normalizeKubernetesResourceName,
  type ExistenceCheckInput,
} from "./create-utils"

export type IngressPathType = "Prefix" | "Exact" | "ImplementationSpecific"

export type IngressRuleInput = {
  host: string
  path: string
  serviceName: string
  servicePort: number
  pathType?: IngressPathType
  protocol?: "HTTP" | "HTTPS"
  tlsSecretName?: string
}

export type CreateIngressInput = {
  name: string
  namespace: string
  host: string
  path: string
  serviceName: string
  servicePort: number
  pathType?: IngressPathType
  protocol?: "HTTP" | "HTTPS"
  tlsSecretName?: string
  rules?: IngressRuleInput[]
  ingressClassName?: string
  description?: string
}

export type UpdateIngressInput = CreateIngressInput

export type IngressFormValues = {
  name: string
  namespace: string
  description: string
  host: string
  path: string
  serviceName: string
  servicePort: string
  pathType: IngressPathType
  protocol: "HTTP" | "HTTPS"
  tlsSecretName: string
  rules: Array<{
    host: string
    path: string
    serviceName: string
    servicePort: string
    pathType: IngressPathType
    protocol: "HTTP" | "HTTPS"
    tlsSecretName: string
  }>
  ingressClassName: string
}

function normalizeNamespace(namespace: string): string {
  const value = namespace.trim()
  if (!value) throw new Error("请选择项目")
  return value
}

function normalizeHost(host: string): string {
  const value = host.trim()
  if (!value) throw new Error("请输入域名")
  return value
}

function normalizePath(path: string): string {
  const value = path.trim()
  if (!value) throw new Error("请输入路径")
  if (!value.startsWith("/")) throw new Error("路径必须以 / 开头")
  return value
}

function normalizeServiceName(serviceName: string): string {
  const value = serviceName.trim()
  if (!value) throw new Error("请选择服务")
  return value
}

function normalizeServicePort(servicePort: number): number {
  if (!Number.isInteger(servicePort) || servicePort < 1 || servicePort > 65535) {
    throw new Error("服务端口必须是 1-65535 的整数")
  }
  return servicePort
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function buildIngressSpec(input: CreateIngressInput) {
  const sourceRules: IngressRuleInput[] =
    input.rules && input.rules.length > 0
      ? input.rules
      : [
          {
            host: input.host,
            path: input.path,
            serviceName: input.serviceName,
            servicePort: input.servicePort,
            pathType: input.pathType,
            protocol: input.protocol,
            tlsSecretName: input.tlsSecretName,
          },
        ]

  const normalizedRules = sourceRules.map((item) => {
    const host = normalizeHost(item.host)
    const path = normalizePath(item.path)
    const serviceName = normalizeServiceName(item.serviceName)
    const servicePort = normalizeServicePort(item.servicePort)
    const pathType = item.pathType ?? "ImplementationSpecific"
    const protocol = item.protocol ?? "HTTP"
    const tlsSecretName = item.tlsSecretName?.trim() ?? ""
    if (protocol === "HTTPS" && !tlsSecretName) {
      throw new Error("请选择 HTTPS 保密字典")
    }
    return {
      host,
      path,
      serviceName,
      servicePort,
      pathType,
      protocol,
      tlsSecretName,
    }
  })

  const tlsMap = new Map<string, Set<string>>()
  normalizedRules.forEach((rule) => {
    if (rule.protocol !== "HTTPS") return
    const secret = rule.tlsSecretName
    const hosts = tlsMap.get(secret) ?? new Set<string>()
    hosts.add(rule.host)
    tlsMap.set(secret, hosts)
  })

  return {
    ...(tlsMap.size > 0
      ? {
          tls: Array.from(tlsMap.entries()).map(([secretName, hosts]) => ({
            secretName,
            hosts: Array.from(hosts),
          })),
        }
      : {}),
    rules: normalizedRules.map((rule) => ({
      host: rule.host,
      http: {
        paths: [
          {
            path: rule.path,
            pathType: rule.pathType,
            backend: {
              service: {
                name: rule.serviceName,
                port: {
                  number: rule.servicePort,
                },
              },
            },
          },
        ],
      },
    })),
  }
}

export async function checkIngressExists(input: ExistenceCheckInput): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "networking.k8s.io",
    version: "v1",
    resource: "ingresses",
    input,
  })
}

export async function createIngress(input: CreateIngressInput): Promise<void> {
  const name = normalizeKubernetesResourceName(input.name)
  const namespace = normalizeNamespace(input.namespace)
  const spec = buildIngressSpec(input)
  const ingressClassName = input.ingressClassName?.trim() ?? ""
  const description = input.description?.trim() ?? ""

  const annotations: Record<string, string> = {}
  if (description) annotations.description = description

  const requestBody = {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name,
      namespace,
      ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
    },
    spec: {
      ...(ingressClassName ? { ingressClassName } : {}),
      ...spec,
    },
  }

  const url = buildResourceCollectionEndpoint("networking.k8s.io", "v1", "ingresses", {
    namespace,
  })

  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}

export async function fetchIngressFormValues(name: string, namespace: string): Promise<IngressFormValues> {
  const { payload } = await fetchResourceByName<unknown>("networking.k8s.io", "v1", "ingresses", name, {
    namespace,
  })

  const root = asObject(payload)
  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
  const spec = asObject(root.spec)
  const tlsEntries = Array.isArray(spec.tls) ? spec.tls : []
  const tlsSecretByHost = new Map<string, string>()
  tlsEntries.forEach((entry) => {
    const tlsEntry = asObject(entry)
    const secretName = asString(tlsEntry.secretName).trim()
    if (!secretName) return
    const hosts = Array.isArray(tlsEntry.hosts) ? tlsEntry.hosts : []
    hosts.forEach((host) => {
      const hostValue = asString(host).trim()
      if (hostValue) tlsSecretByHost.set(hostValue, secretName)
    })
  })

  const specRules = Array.isArray(spec.rules) ? spec.rules : []
  const rules: IngressFormValues["rules"] = []
  specRules.forEach((rule) => {
    const ruleObj = asObject(rule)
    const host = asString(ruleObj.host)
    const http = asObject(ruleObj.http)
    const paths = Array.isArray(http.paths) ? http.paths : []
    paths.forEach((pathItem) => {
      const pathObj = asObject(pathItem)
      const backend = asObject(pathObj.backend)
      const service = asObject(backend.service)
      const port = asObject(service.port)
      const servicePort = asNumber(port.number)
      const pathTypeRaw = pathObj.pathType
      const pathType: IngressPathType =
        pathTypeRaw === "Exact" || pathTypeRaw === "ImplementationSpecific" || pathTypeRaw === "Prefix"
          ? pathTypeRaw
          : "ImplementationSpecific"
      const tlsSecretName = tlsSecretByHost.get(host) ?? ""
      rules.push({
        host,
        path: asString(pathObj.path),
        serviceName: asString(service.name),
        servicePort: servicePort && servicePort > 0 ? String(servicePort) : "",
        pathType,
        protocol: tlsSecretName ? "HTTPS" : "HTTP",
        tlsSecretName,
      })
    })
  })

  const firstRule = rules[0] ?? {
    host: "",
    path: "/",
    serviceName: "",
    servicePort: "",
    pathType: "ImplementationSpecific" as IngressPathType,
    protocol: "HTTP" as const,
    tlsSecretName: "",
  }

  return {
    name: asString(metadata.name),
    namespace: asString(metadata.namespace),
    description: asString(annotations.description),
    host: firstRule.host,
    path: firstRule.path,
    serviceName: firstRule.serviceName,
    servicePort: firstRule.servicePort,
    pathType: firstRule.pathType,
    protocol: firstRule.protocol,
    tlsSecretName: firstRule.tlsSecretName,
    rules,
    ingressClassName: asString(spec.ingressClassName),
  }
}

export async function updateIngress(input: UpdateIngressInput): Promise<void> {
  const name = normalizeKubernetesResourceName(input.name)
  const namespace = normalizeNamespace(input.namespace)
  const spec = buildIngressSpec(input)
  const ingressClassName = input.ingressClassName?.trim() ?? ""
  const description = input.description?.trim() ?? ""

  const { payload } = await fetchResourceByName<unknown>("networking.k8s.io", "v1", "ingresses", name, {
    namespace,
  })
  const existing = asObject(payload)
  const existingMetadata = asObject(existing.metadata)
  const existingAnnotations = asObject(existingMetadata.annotations)
  const nextAnnotations: Record<string, string> = Object.fromEntries(
    Object.entries(existingAnnotations).filter(([, value]) => typeof value === "string")
  ) as Record<string, string>
  if (description) nextAnnotations.description = description
  else delete nextAnnotations.description

  const requestBody = {
    apiVersion: "networking.k8s.io/v1",
    kind: "Ingress",
    metadata: {
      name,
      namespace,
      resourceVersion:
        typeof existingMetadata.resourceVersion === "string"
          ? existingMetadata.resourceVersion
          : undefined,
      ...(Object.keys(nextAnnotations).length > 0 ? { annotations: nextAnnotations } : {}),
      ...(typeof existingMetadata.labels === "object" && existingMetadata.labels !== null
        ? { labels: existingMetadata.labels }
        : {}),
    },
    spec: {
      ...(ingressClassName ? { ingressClassName } : {}),
      ...spec,
    },
  }

  const url = buildResourceItemEndpoint("networking.k8s.io", "v1", "ingresses", name, namespace)
  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}
