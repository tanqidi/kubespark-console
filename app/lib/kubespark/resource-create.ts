import {
  buildResourceCollectionEndpoint,
  fetchResourceCollection,
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
  resource: "configmaps" | "secrets",
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
