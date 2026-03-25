export type PodStorageItemInput = {
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
  spec: Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function applyStorageToPodSpec(
  storage: PodStorageItemInput | PodStorageItemInput[] | undefined,
  containerSpecs: PodContainerSpecRef[],
  volumes: Array<Record<string, unknown>>
): void {
  const storageList = Array.isArray(storage) ? storage : storage ? [storage] : []

  storageList.forEach((storageItem) => {
    const storageName = asString(storageItem?.volumeName).trim()
    const storageId = asString(storageItem?.volumeId).trim() || storageName
    const storageKind = storageItem?.volumeKind
    const resolvedStorageId = storageKind === "ephemeral" ? storageName : storageId
    const storageSource =
      storageName && resolvedStorageId
        ? storageKind === "persistent"
          ? ({ persistentVolumeClaim: { claimName: storageName } } as Record<string, unknown>)
          : storageKind === "ephemeral"
            ? ({ emptyDir: {} } as Record<string, unknown>)
            : storageKind === "hostPath"
              ? ({ hostPath: { path: storageName, type: "" } } as Record<string, unknown>)
              : null
        : null
    if (!storageSource) return

    let hasAppliedStorageMount = false
    const storageMounts = Array.isArray(storageItem?.mounts)
      ? storageItem.mounts
          .map((item) => ({
            containerName: asString(item.containerName).trim(),
            mountMode: item.mountMode,
            mountPath: asString(item.mountPath).trim(),
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

    if (hasAppliedStorageMount && !volumes.some((item) => item.name === resolvedStorageId)) {
      volumes.push({
        name: resolvedStorageId,
        ...storageSource,
      })
    }
  })
}
