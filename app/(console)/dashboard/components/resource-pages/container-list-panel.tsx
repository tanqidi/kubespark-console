"use client"

import { IconPencil, IconTrash } from "@tabler/icons-react"
import { useTranslations } from "@/app/lib/i18n"
import type { ContainerDraft } from "@/app/(console)/dashboard/components/resource-pages/create-container-dialog.logic"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { cn } from "@/lib/utils"

type ContainerListPanelProps = {
  items: ContainerDraft[]
  isBusy: boolean
  submitError: string | null
  podRequiredMessage: string
  onEdit: (id: string) => void
  onRequestDelete: (id: string) => void
  onAdd: () => void
}

export function ContainerListPanel({
  items,
  isBusy,
  submitError,
  podRequiredMessage,
  onEdit,
  onRequestDelete,
  onAdd,
}: ContainerListPanelProps) {
  const t = useTranslations()
  return (
    <Field>
      <FieldLabel>{t("containerListPanel.container")}</FieldLabel>
      <div className="max-h-[44vh] overflow-y-auto pr-2">
        <div className="flex flex-col gap-0 pb-1">
          {items.length > 0 ? (
            <ItemGroup className="gap-3">
              {items.map((item) => (
                <Item key={item.id} variant="outline" size="sm" className="hover:bg-muted">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="min-w-0 truncate">{item.name.trim() || t("containerListPanel.unnamedContainer")}</ItemTitle>
                    <ItemDescription className="min-w-0 truncate">
                      {item.image.trim()}
                      {" · "}
                      {item.type === "initContainer" ? (
                        <span className="font-semibold text-foreground">{t("containerListPanel.initContainer")}</span>
                      ) : (
                        t("containerListPanel.workContainer")
                      )}
                      {" · "}
                      {item.imagePullPolicy}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(item.id)}
                      disabled={isBusy}
                    >
                      <IconPencil data-icon="inline-start" />
                      {t("containerListPanel.edit")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRequestDelete(item.id)}
                      disabled={isBusy}
                    >
                      <IconTrash data-icon="inline-start" />
                      {t("containerListPanel.delete")}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <div
              className={cn(
                "rounded-lg border border-dashed px-4 py-10 text-center",
                submitError === podRequiredMessage && "border-destructive"
              )}
            >
              <div
                className={cn(
                  "text-sm font-semibold",
                  submitError === podRequiredMessage && "text-destructive"
                )}
              >
                {t("containerListPanel.noContainer")}
              </div>
              <div
                className={cn(
                  "mt-1 text-sm text-muted-foreground",
                  submitError === podRequiredMessage && "text-destructive"
                )}
              >
                {t("containerListPanel.clickAddContainer")}
              </div>
            </div>
          )}

          <button
            type="button"
            className="mt-3 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
            onClick={onAdd}
            disabled={isBusy}
          >
            <span className="text-sm font-semibold">{t("containerListPanel.addContainer")}</span>
            <span className="mt-1 text-sm text-muted-foreground">{t("containerListPanel.addContainerDesc")}</span>
          </button>
        </div>
      </div>
    </Field>
  )
}
