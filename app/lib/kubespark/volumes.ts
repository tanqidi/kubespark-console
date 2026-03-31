import { buildResourceCollectionEndpoint, fetchJsonDeduped } from "./common"
import { checkNamespacedResourceExists, type ExistenceCheckInput } from "./create-utils"

type AccessMode = "ReadWriteOnce" | "ReadOnlyMany" | "ReadWriteMany" | "ReadWriteOncePod"
type VolumeMode = "Filesystem" | "Block"
type PersistentVolumeReclaimPolicy = "Retain" | "Delete"

export type CreatePersistentVolumeClaimInput = {
  name: string
  namespace: string
  description?: string
  accessMode: AccessMode
  storageRequest: string
  storageClassName?: string
  volumeMode?: VolumeMode
  volumeName?: string
}

export type CreatePersistentVolumeInput = {
  name: string
  description?: string
  accessMode: AccessMode
  storageRequest: string
  storageClassName?: string
  volumeMode?: VolumeMode
  reclaimPolicy?: PersistentVolumeReclaimPolicy
  hostPath: string
  nodeNames?: string[]
}

export async function checkPersistentVolumeClaimExists(
  input: ExistenceCheckInput
): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "core",
    version: "v1",
    resource: "persistentvolumeclaims",
    input,
  })
}

function normalizeResourceName(name: string): string {
  const value = name.trim().toLowerCase()
  const valid = /^[a-z0-9]([-.a-z0-9]*[a-z0-9])?$/.test(value) && value.length <= 253
  if (!valid) {
    throw new Error("名称只能包含小写字母、数字、短横线（-）和点（.），长度不超过 253。")
  }
  return value
}

function normalizeNamespace(namespace: string): string {
  const value = namespace.trim()
  if (!value) throw new Error("请选择项目")
  return value
}

export async function createPersistentVolumeClaim(
  input: CreatePersistentVolumeClaimInput
): Promise<void> {
  const name = normalizeResourceName(input.name)
  const namespace = normalizeNamespace(input.namespace)
  const requestStorage = input.storageRequest.trim()
  if (!requestStorage) {
    throw new Error("请输入申请容量")
  }

  const metadata: {
    name: string
    namespace: string
    annotations?: Record<string, string>
  } = {
    name,
    namespace,
  }

  const description = input.description?.trim() ?? ""
  if (description) {
    metadata.annotations = {
      description,
    }
  }

  const requestBody = {
    apiVersion: "v1",
    kind: "PersistentVolumeClaim",
    metadata,
    spec: {
      accessModes: [input.accessMode],
      resources: {
        requests: {
          storage: requestStorage,
        },
      },
      ...(input.storageClassName?.trim()
        ? { storageClassName: input.storageClassName.trim() }
        : {}),
      ...(input.volumeMode ? { volumeMode: input.volumeMode } : {}),
      ...(input.volumeName?.trim() ? { volumeName: input.volumeName.trim() } : {}),
    },
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "persistentvolumeclaims", {
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

export async function checkPersistentVolumeExists(name: string): Promise<boolean> {
  const normalizedName = normalizeResourceName(name)
  const fieldSelector = `metadata.name=${normalizedName}`
  const readItems = (payload: unknown): unknown[] => {
    if (!payload || typeof payload !== "object") return []
    const root = payload as Record<string, unknown>
    const items = (root.data as Record<string, unknown> | undefined)?.items ?? root.items
    return Array.isArray(items) ? items : []
  }

  const hasMatchedName = (items: unknown[]): boolean =>
    items.some((item) => {
      if (!item || typeof item !== "object") return false
      const metadata = (item as Record<string, unknown>).metadata
      if (!metadata || typeof metadata !== "object") return false
      return (metadata as Record<string, unknown>).name === normalizedName
    })

  const fieldSelectorUrl = buildResourceCollectionEndpoint("core", "v1", "persistentvolumes", {
    fieldSelector,
  })

  try {
    const payload = await fetchJsonDeduped<unknown>(fieldSelectorUrl)
    return hasMatchedName(readItems(payload))
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : ""
    const canFallback =
      message.includes("状态码 404") ||
      message.includes("not found") ||
      message.includes("fieldselector")

    if (!canFallback) throw error

    const fallbackUrl = buildResourceCollectionEndpoint("core", "v1", "persistentvolumes")
    const fallbackPayload = await fetchJsonDeduped<unknown>(fallbackUrl)
    return hasMatchedName(readItems(fallbackPayload))
  }
}

export async function createPersistentVolume(input: CreatePersistentVolumeInput): Promise<void> {
  const name = normalizeResourceName(input.name)
  const requestStorage = input.storageRequest.trim()
  const hostPath = input.hostPath.trim()

  if (!requestStorage) {
    throw new Error("请输入申请容量")
  }

  if (!hostPath) {
    throw new Error("请输入主机路径")
  }

  const metadata: {
    name: string
    annotations?: Record<string, string>
  } = { name }

  const description = input.description?.trim() ?? ""
  if (description) {
    metadata.annotations = {
      description,
    }
  }

  const nodeNames = Array.isArray(input.nodeNames)
    ? input.nodeNames
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    : []

  const requestBody = {
    apiVersion: "v1",
    kind: "PersistentVolume",
    metadata,
    spec: {
      capacity: {
        storage: requestStorage,
      },
      accessModes: [input.accessMode],
      persistentVolumeReclaimPolicy: input.reclaimPolicy ?? "Retain",
      ...(input.storageClassName?.trim()
        ? { storageClassName: input.storageClassName.trim() }
        : {}),
      ...(input.volumeMode ? { volumeMode: input.volumeMode } : {}),
      hostPath: {
        path: hostPath,
        type: "DirectoryOrCreate",
      },
      ...(nodeNames.length > 0
        ? {
            nodeAffinity: {
              required: {
                nodeSelectorTerms: [
                  {
                    matchExpressions: [
                      {
                        key: "kubernetes.io/hostname",
                        operator: "In",
                        values: nodeNames,
                      },
                    ],
                  },
                ],
              },
            },
          }
        : {}),
    },
  }

  const url = buildResourceCollectionEndpoint("core", "v1", "persistentvolumes")

  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}
