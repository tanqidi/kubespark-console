"use client"

import { IconPencil, IconTrash } from "@tabler/icons-react"
import type { ContainerDraft } from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog.logic"
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
  return (
    <Field>
      <FieldLabel>容器</FieldLabel>
      <div className="max-h-[44vh] overflow-y-auto pr-2">
        <div className="flex flex-col gap-0 pb-1">
          {items.length > 0 ? (
            <ItemGroup className="gap-3">
              {items.map((item) => (
                <Item key={item.id} variant="outline" size="sm" className="hover:bg-muted">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="min-w-0 truncate">{item.name.trim() || "未命名容器"}</ItemTitle>
                    <ItemDescription className="min-w-0 truncate">
                      {item.image.trim()}
                      {" · "}
                      {item.type === "initContainer" ? (
                        <span className="font-semibold text-foreground">初始化容器</span>
                      ) : (
                        "工作容器"
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
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onRequestDelete(item.id)}
                      disabled={isBusy}
                    >
                      <IconTrash data-icon="inline-start" />
                      删除
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
                暂无容器配置
              </div>
              <div
                className={cn(
                  "mt-1 text-sm text-muted-foreground",
                  submitError === podRequiredMessage && "text-destructive"
                )}
              >
                {submitError === podRequiredMessage
                  ? podRequiredMessage
                  : "点击下方“添加容器”录入镜像信息。"}
              </div>
            </div>
          )}

          <button
            type="button"
            className="mt-3 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
            onClick={onAdd}
            disabled={isBusy}
          >
            <span className="text-sm font-semibold">添加容器</span>
            <span className="mt-1 text-sm text-muted-foreground">新增一条容器镜像配置。</span>
          </button>
        </div>
      </div>
    </Field>
  )
}
