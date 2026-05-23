"use client"

import { IconPencil, IconTrash } from "@tabler/icons-react"
import { useTranslations } from "@/app/lib/i18n"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"

type StorageVolumeListItem = {
  volumeId: string
  volumeName: string
  volumeKind: "persistent" | "ephemeral" | "hostPath"
  mounts: Array<{
    containerName: string
    mountMode: "none" | "ro" | "rw"
    mountPath: string
  }>
}

type StorageVolumeListProps = {
  items: StorageVolumeListItem[]
  onEdit: (index: number) => void
  onRequestDelete: (index: number) => void
  onAdd: () => void
  disabled?: boolean
}

export function StorageVolumeList({
  items,
  onEdit,
  onRequestDelete,
  onAdd,
  disabled = false,
}: StorageVolumeListProps) {
  const t = useTranslations()
  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        items.map((storageItem, storageIndex) => {
          const mountedContainerCount = storageItem.mounts.filter(
            (item) => item.mountMode !== "none" && item.mountPath.trim().length > 0
          ).length
          const storageDisplayName =
            storageItem.volumeId.trim() || storageItem.volumeName.trim() || t("storageVolumeList.unnamedVolume")

          return (
            <Item
              key={`${storageItem.volumeId}-${storageItem.volumeName}-${storageIndex}`}
              variant="outline"
              size="sm"
              className="group/item hover:bg-muted"
            >
              <ItemContent className="min-w-0">
                <ItemTitle className="min-w-0 truncate">{storageDisplayName}</ItemTitle>
                <ItemDescription className="min-w-0 truncate">
                  {(storageItem.volumeKind === "persistent"
                    ? t("storageVolumeList.persistentVolume")
                    : storageItem.volumeKind === "ephemeral"
                      ? t("storageVolumeList.ephemeralVolume")
                      : t("storageVolumeList.hostPathVolume")) +
                    " · " +
                    t("storageVolumeList.mountedContainers", { count: mountedContainerCount })}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation()
                    onEdit(storageIndex)
                  }}
                  disabled={disabled}
                >
                  <IconPencil data-icon="inline-start" />
                  {t("storageVolumeList.edit")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRequestDelete(storageIndex)
                  }}
                  disabled={disabled}
                >
                  <IconTrash data-icon="inline-start" />
                  {t("storageVolumeList.delete")}
                </Button>
              </ItemActions>
            </Item>
          )
        })
      ) : (
        <div className="rounded-lg border border-dashed px-4 py-10 text-center">
          <div className="text-sm font-semibold">{t("storageVolumeList.noMountVolumes")}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {t("storageVolumeList.addMountVolumeHint")}
          </div>
        </div>
      )}

      <button
        type="button"
        className="flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
        onClick={onAdd}
        disabled={disabled}
      >
        <span className="text-sm font-semibold">{t("storageVolumeList.addMountVolume")}</span>
        <span className="mt-1 text-sm text-muted-foreground">{t("storageVolumeList.addMountVolumeDesc")}</span>
      </button>
    </div>
  )
}
