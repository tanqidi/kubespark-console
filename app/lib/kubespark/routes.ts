import { buildResourceCollectionEndpoint, fetchJsonDeduped } from "./common"
import {
  checkNamespacedResourceExists,
  normalizeKubernetesResourceName,
  type ExistenceCheckInput,
} from "./create-utils"

export type IngressPathType = "Prefix" | "Exact" | "ImplementationSpecific"

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
  ingressClassName?: string
  description?: string
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
  if (!Number.isInteger(servicePort) || servicePort <= 0) {
    throw new Error("服务端口必须是大于 0 的整数")
  }
  return servicePort
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
  const host = normalizeHost(input.host)
  const path = normalizePath(input.path)
  const serviceName = normalizeServiceName(input.serviceName)
  const servicePort = normalizeServicePort(input.servicePort)
  const pathType = input.pathType ?? "ImplementationSpecific"
  const protocol = input.protocol ?? "HTTP"
  const tlsSecretName = input.tlsSecretName?.trim() ?? ""
  const ingressClassName = input.ingressClassName?.trim() ?? ""
  const description = input.description?.trim() ?? ""

  if (protocol === "HTTPS" && !tlsSecretName) {
    throw new Error("请选择 HTTPS 保密字典")
  }

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
      ...(protocol === "HTTPS"
        ? {
            tls: [
              {
                hosts: [host],
                secretName: tlsSecretName,
              },
            ],
          }
        : {}),
      rules: [
        {
          host,
          http: {
            paths: [
              {
                path,
                pathType,
                backend: {
                  service: {
                    name: serviceName,
                    port: {
                      number: servicePort,
                    },
                  },
                },
              },
            ],
          },
        },
      ],
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
