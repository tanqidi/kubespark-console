import { stringify } from "yaml"

import { API_PROXY_BASE, fetchJsonDeduped } from "./common"
import { buildResourceDocument, type ResourceDocumentType } from "./resource-document"

const RESOURCE_BASE = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1`

export type NamespacedResourceYamlResult = {
  requestUrl: string
  payload: unknown
  text: string
}

export function buildNamespacedResourceEndpoint(
  resource: string,
  namespace: string,
  name: string
): string {
  return `${RESOURCE_BASE}/namespaces/${encodeURIComponent(namespace)}/${encodeURIComponent(resource)}/${encodeURIComponent(name)}`
}

export async function fetchNamespacedResourceYaml(
  resource: string,
  namespace: string,
  name: string,
  options?: {
    documentType?: ResourceDocumentType
  }
): Promise<NamespacedResourceYamlResult> {
  const requestUrl = buildNamespacedResourceEndpoint(resource, namespace, name)
  const payload = await fetchJsonDeduped<unknown>(requestUrl)
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
