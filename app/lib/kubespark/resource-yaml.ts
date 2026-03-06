import { stringify } from "yaml"

import {
  buildResourceCollectionEndpoint,
  fetchResourceByName,
} from "./common"
import { buildResourceDocument, type ResourceDocumentType } from "./resource-document"

export type NamespacedResourceYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

type NamespacedResourceYamlOptions = {
  documentType?: ResourceDocumentType
  group?: string
  version?: string
}

type ResourceGvr = {
  group: string
  version: string
}

function resolveResourceGvr(
  resource: string,
  options?: Pick<NamespacedResourceYamlOptions, "group" | "version">
): ResourceGvr {
  const group = options?.group?.trim()
  const version = options?.version?.trim()
  if (group && version) return { group, version }
  if (group || version) {
    throw new Error(`Invalid GVR options for ${resource}: group and version are both required`)
  }

  switch (resource) {
    case "services":
    case "pods":
    case "configmaps":
    case "secrets":
    case "persistentvolumeclaims":
      return { group: "core", version: "v1" }
    case "ingresses":
      return { group: "networking.k8s.io", version: "v1" }
    case "jobs":
    case "cronjobs":
      return { group: "batch", version: "v1" }
    case "deployments":
    case "statefulsets":
    case "daemonsets":
      return { group: "apps", version: "v1" }
    default:
      throw new Error(
        `Unknown resource GVR for ${resource}. Please provide group and version in options.`
      )
  }
}

export function buildNamespacedResourceEndpoint(
  resource: string,
  namespace: string,
  name: string,
  options?: Pick<NamespacedResourceYamlOptions, "group" | "version">
): string {
  const { group, version } = resolveResourceGvr(resource, options)
  return buildResourceCollectionEndpoint(group, version, resource, {
    namespace,
    fieldSelector: `metadata.name=${name}`,
  })
}

export async function fetchNamespacedResourceYaml(
  resource: string,
  namespace: string,
  name: string,
  options?: NamespacedResourceYamlOptions
): Promise<NamespacedResourceYamlResult> {
  const { group, version } = resolveResourceGvr(resource, options)
  const { requestUrl, payload } = await fetchResourceByName<unknown>(
    group,
    version,
    resource,
    name,
    { namespace }
  )
  const text = options?.documentType
    ? buildResourceDocument({
        type: options.documentType,
        payload,
        output: "yaml",
      }).text
    : stringify(payload, {
        indent: 2,
        lineWidth: 0,
        sortMapEntries: false,
      })

  return {
    requestUrl,
    payload,
    text,
  }
}
