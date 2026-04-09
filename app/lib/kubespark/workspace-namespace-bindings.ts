import {
  buildResourceCollectionEndpoint,
  deleteResource,
  fetchJsonDeduped,
  fetchResourceCollection,
} from "./common"

type RawWorkspaceNamespaceBinding = {
  metadata?: {
    name?: string
    resourceVersion?: string
  }
  spec?: {
    workspaceRef?: {
      name?: string
    }
    namespaceRef?: {
      name?: string
    }
  }
}

export type WorkspaceNamespaceBinding = {
  name: string
  workspaceName: string
  namespaceName: string
  resourceVersion: string
}

export type CreateWorkspaceNamespaceBindingInput = {
  workspaceName: string
  namespaceName: string
}

const WORKSPACE_NAMESPACE_BINDING_GVR = {
  group: "tanqidi.com",
  version: "v1alpha1",
  resource: "workspacenamespacebindings",
} as const

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function normalizeDnsLabel(value: string, fieldName: string): string {
  const normalized = value.trim().toLowerCase()
  const isValid = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(normalized) && normalized.length <= 63
  if (!isValid) {
    throw new Error(`${fieldName} 不能为空，且必须为 1-63 位小写字母/数字/短横线`)
  }
  return normalized
}

function buildBindingName(namespaceName: string, workspaceName: string): string {
  const raw = `${namespaceName}-${workspaceName}`.toLowerCase()
  const cleaned = raw.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "")
  const limited = cleaned.slice(0, 63).replace(/-+$/g, "")
  return limited || `${namespaceName.slice(0, 31)}-${workspaceName.slice(0, 31)}`.replace(/-+$/g, "")
}

export async function fetchWorkspaceNamespaceBindingByNamespace(
  namespaceName: string
): Promise<WorkspaceNamespaceBinding | null> {
  const targetNamespace = normalizeDnsLabel(namespaceName, "命名空间")
  const { items } = await fetchResourceCollection<RawWorkspaceNamespaceBinding>(
    WORKSPACE_NAMESPACE_BINDING_GVR.group,
    WORKSPACE_NAMESPACE_BINDING_GVR.version,
    WORKSPACE_NAMESPACE_BINDING_GVR.resource
  )

  const matched = items.find(
    (item) => asString(item.spec?.namespaceRef?.name).trim().toLowerCase() === targetNamespace
  )

  if (!matched) return null

  return {
    name: asString(matched.metadata?.name),
    workspaceName: asString(matched.spec?.workspaceRef?.name),
    namespaceName: asString(matched.spec?.namespaceRef?.name),
    resourceVersion: asString(matched.metadata?.resourceVersion),
  }
}

export async function fetchWorkspaceNamespaceBindings(limit = 500): Promise<WorkspaceNamespaceBinding[]> {
  const { items } = await fetchResourceCollection<RawWorkspaceNamespaceBinding>(
    WORKSPACE_NAMESPACE_BINDING_GVR.group,
    WORKSPACE_NAMESPACE_BINDING_GVR.version,
    WORKSPACE_NAMESPACE_BINDING_GVR.resource
  )

  return items.slice(0, limit).map((item, index) => ({
    name: asString(item.metadata?.name, `binding-${index}`),
    workspaceName: asString(item.spec?.workspaceRef?.name),
    namespaceName: asString(item.spec?.namespaceRef?.name),
    resourceVersion: asString(item.metadata?.resourceVersion),
  }))
}

export async function createWorkspaceNamespaceBinding(
  input: CreateWorkspaceNamespaceBindingInput
): Promise<void> {
  const workspaceName = normalizeDnsLabel(input.workspaceName, "企业空间")
  const namespaceName = normalizeDnsLabel(input.namespaceName, "项目")
  const name = buildBindingName(namespaceName, workspaceName)

  const url = buildResourceCollectionEndpoint(
    WORKSPACE_NAMESPACE_BINDING_GVR.group,
    WORKSPACE_NAMESPACE_BINDING_GVR.version,
    WORKSPACE_NAMESPACE_BINDING_GVR.resource
  )
  await fetchJsonDeduped(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiVersion: "tanqidi.com/v1alpha1",
      kind: "WorkspaceNamespaceBinding",
      metadata: {
        name,
      },
      spec: {
        workspaceRef: {
          name: workspaceName,
        },
        namespaceRef: {
          name: namespaceName,
        },
      },
    }),
  })
}

export async function deleteWorkspaceNamespaceBindingsByNamespace(namespaceName: string): Promise<void> {
  const targetNamespace = normalizeDnsLabel(namespaceName, "项目")
  const bindings = await fetchWorkspaceNamespaceBindings(1000)
  const targets = bindings.filter(
    (binding) => binding.namespaceName.trim().toLowerCase() === targetNamespace
  )

  if (targets.length === 0) return

  await Promise.all(
    targets.map((binding) =>
      deleteResource(
        WORKSPACE_NAMESPACE_BINDING_GVR.group,
        WORKSPACE_NAMESPACE_BINDING_GVR.version,
        WORKSPACE_NAMESPACE_BINDING_GVR.resource,
        binding.name
      )
    )
  )
}
