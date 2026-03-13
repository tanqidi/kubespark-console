"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type ContainerType = "container" | "initContainer"

type ContainerDraft = {
  id: string
  name: string
  type: ContainerType
  image: string
  imagePullPolicy: "Always" | "IfNotPresent" | "Never"
}

type CreateContainerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  container: ContainerDraft | null
  imageError: string | null
  isBusy: boolean
  onChange: (field: "name" | "type" | "image" | "imagePullPolicy", value: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function CreateContainerDialog({
  open,
  onOpenChange,
  container,
  imageError,
  isBusy,
  onChange,
  onCancel,
  onConfirm,
}: CreateContainerDialogProps) {
  if (!container) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel()
          return
        }
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="w-[min(90vw,130vh)] sm:max-w-270">
        <DialogHeader>
          <DialogTitle>录入容器</DialogTitle>
          <DialogDescription>填写镜像、容器名称、容器类型和拉取策略。</DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <FieldGroup className="flex flex-col gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Field data-invalid={Boolean(imageError)}>
                <FieldLabel htmlFor={`${container.id}-image`}>镜像</FieldLabel>
                <Input
                  id={`${container.id}-image`}
                  value={container.image}
                  onChange={(event) => onChange("image", event.target.value)}
                  placeholder="例如：nginx:1.27"
                  aria-invalid={Boolean(imageError)}
                  autoComplete="off"
                  disabled={isBusy}
                />
                {imageError ? (
                  <FieldError>{imageError}</FieldError>
                ) : (
                  <FieldDescription>请输入完整镜像地址，例如 `repo/name:tag`。</FieldDescription>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor={`${container.id}-pull-policy`}>镜像拉取策略</FieldLabel>
                <Select
                  value={container.imagePullPolicy}
                  onValueChange={(value) => {
                    if (value === "Always" || value === "IfNotPresent" || value === "Never") {
                      onChange("imagePullPolicy", value)
                    }
                  }}
                  disabled={isBusy}
                >
                  <SelectTrigger id={`${container.id}-pull-policy`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="IfNotPresent">IfNotPresent</SelectItem>
                      <SelectItem value="Always">Always</SelectItem>
                      <SelectItem value="Never">Never</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`${container.id}-name`}>容器名称</FieldLabel>
                <Input
                  id={`${container.id}-name`}
                  value={container.name}
                  onChange={(event) => onChange("name", event.target.value)}
                  placeholder="例如：worker"
                  autoComplete="off"
                  disabled={isBusy}
                />
                <FieldDescription>选填。留空时系统会按规则自动生成容器名称。</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor={`${container.id}-type`}>容器类型</FieldLabel>
                <Select
                  value={container.type}
                  onValueChange={(value) => {
                    if (value === "container" || value === "initContainer") {
                      onChange("type", value)
                    }
                  }}
                  disabled={isBusy}
                >
                  <SelectTrigger id={`${container.id}-type`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="container">工作容器</SelectItem>
                      <SelectItem value="initContainer">初始化容器</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isBusy}>
              取消
            </Button>
            <Button type="button" onClick={onConfirm} disabled={isBusy}>
              确认保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
