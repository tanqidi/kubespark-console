import { buildResourceCollectionEndpoint, fetchJsonDeduped } from "./common"

type AccessMode = "ReadWriteOnce" | "ReadOnlyMany" | "ReadWriteMany" | "ReadWriteOncePod"
type VolumeMode = "Filesystem" | "Block"

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
