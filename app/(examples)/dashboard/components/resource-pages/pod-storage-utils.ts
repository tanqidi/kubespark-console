export type JsonObject = Record<string, unknown>

export type PodStorageInput = {
  volumeId?: string
  volumeKind?: "persistent" | "ephemeral" | "hostPath"
  volumeName?: string
  mounts?: Array<{
    containerName: string
    mountMode: "none" | "ro" | "rw"
    mountPath: string
  }>
}

export type PodContainerSpecRef = {
  rawName: string
  resolvedName: string
  spec: JsonObject
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function applyStorageToVolumesAndMounts(
  storage: PodStorageInput | PodStorageInput[] | undefined,
  containerSpecs: PodContainerSpecRef[],
  volumes: JsonObject[]
): void {
  const storageList = Array.isArray(storage) ? storage : storage ? [storage] : []
  storageList.forEach((storageItem) => {
    const storageName = (storageItem.volumeName ?? "").trim()
    const storageId = (storageItem.volumeId ?? "").trim() || storageName
    const storageKind = storageItem.volumeKind
    const resolvedStorageId = storageKind === "ephemeral" ? storageName : storageId
    const storageSource =
      storageName && resolvedStorageId
        ? storageKind === "persistent"
          ? ({ persistentVolumeClaim: { claimName: storageName } } as JsonObject)
          : storageKind === "ephemeral"
            ? ({ emptyDir: {} } as JsonObject)
            : storageKind === "hostPath"
              ? ({ hostPath: { path: storageName, type: "" } } as JsonObject)
              : null
        : null
    if (!storageSource) return

    let hasAppliedStorageMount = false
    const storageMounts = Array.isArray(storageItem?.mounts)
      ? storageItem.mounts
          .map((item) => ({
            containerName: item.containerName.trim(),
            mountMode: item.mountMode,
            mountPath: item.mountPath.trim(),
          }))
          .filter(
            (item) =>
              item.containerName.length > 0 &&
              (item.mountMode === "ro" || item.mountMode === "rw") &&
              item.mountPath.length > 0
          )
      : []

    storageMounts.forEach((mount) => {
      const target =
        containerSpecs.find((item) => item.rawName === mount.containerName) ??
        containerSpecs.find((item) => item.resolvedName === mount.containerName)
      if (!target) return

      const existingMounts = Array.isArray(target.spec.volumeMounts)
        ? (target.spec.volumeMounts as Array<{ name?: string; mountPath?: string }>)
        : []
      const duplicated = existingMounts.some(
        (item) => item.name === resolvedStorageId && item.mountPath === mount.mountPath
      )
      if (duplicated) return

      target.spec.volumeMounts = [
        ...existingMounts,
        {
          name: resolvedStorageId,
          mountPath: mount.mountPath,
          ...(mount.mountMode === "ro" ? { readOnly: true } : {}),
        },
      ]
      hasAppliedStorageMount = true
    })

    if (hasAppliedStorageMount && !volumes.some((item) => asString(item.name) === resolvedStorageId)) {
      volumes.push({
        name: resolvedStorageId,
        ...storageSource,
      })
    }
  })
}

export function parseStorageListFromPodSpec(
  podSpec: JsonObject,
  ignoredVolumeNames?: Set<string>
): PodStorageInput[] {
  const allContainers = [
    ...(Array.isArray(podSpec.containers) ? podSpec.containers : []),
    ...(Array.isArray(podSpec.initContainers) ? podSpec.initContainers : []),
  ].map((entry) => (typeof entry === "object" && entry !== null ? (entry as JsonObject) : {}))

  return (Array.isArray(podSpec.volumes) ? podSpec.volumes : [])
    .map((entry) => (typeof entry === "object" && entry !== null ? (entry as JsonObject) : {}))
    .map((volume) => {
      const volumeId = asString(volume.name).trim()
      const hostPath =
        typeof volume.hostPath === "object" && volume.hostPath !== null
          ? (volume.hostPath as JsonObject)
          : {}
      const pvc =
        typeof volume.persistentVolumeClaim === "object" && volume.persistentVolumeClaim !== null
          ? (volume.persistentVolumeClaim as JsonObject)
          : {}
      const hasEmptyDir = Object.prototype.hasOwnProperty.call(volume, "emptyDir")

      if (!volumeId || ignoredVolumeNames?.has(volumeId)) return null
      if (asString(pvc.claimName).trim()) {
        return {
          volumeId,
          volumeKind: "persistent" as const,
          volumeName: asString(pvc.claimName).trim(),
        }
      }
      if (hasEmptyDir) {
        return {
          volumeId,
          volumeKind: "ephemeral" as const,
          volumeName: volumeId,
        }
      }
      if (asString(hostPath.path).trim()) {
        return {
          volumeId,
          volumeKind: "hostPath" as const,
          volumeName: asString(hostPath.path).trim(),
        }
      }
      return null
    })
    .filter(
      (
        item
      ): item is {
        volumeId: string
        volumeKind: "persistent" | "ephemeral" | "hostPath"
        volumeName: string
      } => Boolean(item)
    )
    .map((storageItem) => {
      const mounts = allContainers
        .flatMap((container) => {
          const containerName = asString(container.name).trim()
          const volumeMounts = Array.isArray(container.volumeMounts) ? container.volumeMounts : []
          return volumeMounts
            .map((mount) => (typeof mount === "object" && mount !== null ? (mount as JsonObject) : {}))
            .filter((mount) => asString(mount.name).trim() === storageItem.volumeId)
            .map((mount) => ({
              containerName,
              mountMode: mount.readOnly === true ? ("ro" as const) : ("rw" as const),
              mountPath: asString(mount.mountPath).trim(),
            }))
        })
        .filter((mount) => mount.containerName.length > 0 && mount.mountPath.length > 0)

      return {
        volumeId: storageItem.volumeId,
        volumeKind: storageItem.volumeKind,
        volumeName: storageItem.volumeName,
        mounts,
      }
    })
}
