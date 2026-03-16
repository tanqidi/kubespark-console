"use client"

import * as React from "react"
import {
  resolveFirstContainerEditorErrorFieldId,
  type ContainerPortFieldErrors,
  scrollAndFocusFieldById,
} from "@/app/lib/kubespark/form-validation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export type ContainerType = "container" | "initContainer"
export type ContainerPortProtocol =
  | "GRPC"
  | "HTTP"
  | "HTTP2"
  | "HTTPS"
  | "MONGO"
  | "REDIS"
  | "TCP"
  | "TLS"
  | "UDP"
  | "SCTP"

export type ContainerPortDraft = {
  id: string
  protocol: ContainerPortProtocol
  name: string
  containerPort: string
}

export type ContainerDraft = {
  id: string
  name: string
  type: ContainerType
  image: string
  imagePullPolicy: "Always" | "IfNotPresent" | "Never"
  command: string
  args: string
  syncHostTimezone: boolean
  cpuRequest: string
  cpuLimit: string
  memoryRequestMi: string
  memoryLimitMi: string
  ports: ContainerPortDraft[]
}

type CreateContainerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  container: ContainerDraft | null
  imageError: string | null
  portFieldErrors: ContainerPortFieldErrors
  isBusy: boolean
  onChange: (
    field:
      | "name"
      | "type"
      | "image"
      | "imagePullPolicy"
      | "command"
      | "args"
      | "syncHostTimezone"
      | "cpuRequest"
      | "cpuLimit"
      | "memoryRequestMi"
      | "memoryLimitMi",
    value: string | boolean
  ) => void
  onAddPort: () => void
  onUpdatePort: (
    portId: string,
    field: "protocol" | "name" | "containerPort",
    value: string
  ) => void
  onRemovePort: (portId: string) => void
  onCancel: () => void
  onConfirm: () => void
}

type ContainerExtensionOptionKey =
  | "healthCheck"
  | "lifecycle"
  | "startupCommand"
  | "env"
  | "securityContext"
  | "syncHostTimezone"

const CONTAINER_EXTENSION_OPTIONS: Array<{
  key: ContainerExtensionOptionKey
  title: string
  description: string
}> = [
  {
    key: "healthCheck",
    title: "健康检查",
    description: "添加探针以定时检查容器健康状态。",
  },
  {
    key: "lifecycle",
    title: "生命周期管理",
    description: "设置容器启动后或终止前需要执行的动作，以进行环境检查或体面终止。",
  },
  {
    key: "startupCommand",
    title: "启动命令",
    description: "自定义容器启动时运行的命令。默认情况下，容器启动将运行镜像默认命令。",
  },
  {
    key: "env",
    title: "环境变量",
    description: "为容器添加环境变量。",
  },
  {
    key: "securityContext",
    title: "容器安全上下文",
    description: "自定义容器的权限设置。",
  },
  {
    key: "syncHostTimezone",
    title: "同步主机时区",
    description: "同步容器与主机的时区。",
  },
]

function createDefaultExtensionState(): Record<ContainerExtensionOptionKey, boolean> {
  return {
    healthCheck: false,
    lifecycle: false,
    startupCommand: false,
    env: false,
    securityContext: false,
    syncHostTimezone: false,
  }
}

function normalizeCpuInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, "")
  if (!sanitized) return ""
  const [integerPart, ...fractionParts] = sanitized.split(".")
  if (fractionParts.length === 0) return integerPart
  return `${integerPart}.${fractionParts.join("")}`
}

function normalizeMemoryInput(value: string): string {
  return value.replace(/\D+/g, "")
}

function normalizePortInput(value: string): string {
  const digits = value.replace(/\D+/g, "")
  if (!digits) return ""
  const parsed = Number(digits)
  if (!Number.isFinite(parsed)) return ""
  if (parsed > 65535) return "65535"
  if (parsed < 0) return "0"
  return String(parsed)
}

function resolveImagePullPolicyDescription(value: "Always" | "IfNotPresent" | "Never"): string {
  if (value === "Always") {
    return "在容器组创建及更新时，每次都尝试拉取新的镜像。"
  }
  if (value === "Never") {
    return "仅使用本地镜像。如果本地不存在所需的镜像，则会导致容器异常。"
  }
  return "如果本地存在所需的镜像，则优先使用本地镜像。"
}

export function CreateContainerDialog({
  open,
  onOpenChange,
  container,
  imageError,
  portFieldErrors,
  isBusy,
  onChange,
  onAddPort,
  onUpdatePort,
  onRemovePort,
  onCancel,
  onConfirm,
}: CreateContainerDialogProps) {
  const [extensionState, setExtensionState] = React.useState<Record<ContainerExtensionOptionKey, boolean>>(
    createDefaultExtensionState
  )
  const containerId = container?.id ?? null
  const syncHostTimezoneEnabled = container?.syncHostTimezone ?? false
  const startupCommandEnabled = (container?.command.trim().length ?? 0) > 0 || (container?.args.trim().length ?? 0) > 0

  const firstErrorFieldId = React.useMemo(() => {
    if (!container) return null
    return resolveFirstContainerEditorErrorFieldId({
      containerId: container.id,
      imageError,
      ports: container.ports,
      portFieldErrors,
    })
  }, [container, imageError, portFieldErrors])

  React.useEffect(() => {
    if (!firstErrorFieldId) return
    scrollAndFocusFieldById(firstErrorFieldId)
  }, [firstErrorFieldId])

  React.useEffect(() => {
    if (!containerId) return
    setExtensionState({
      ...createDefaultExtensionState(),
      startupCommand: startupCommandEnabled,
      syncHostTimezone: syncHostTimezoneEnabled,
    })
  }, [containerId, startupCommandEnabled, syncHostTimezoneEnabled])

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
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        className="flex max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
      >
        <DialogHeader className="shrink-0 border-b bg-muted/15 px-6 py-5 pr-20">
          <DialogTitle>录入容器</DialogTitle>
          <DialogDescription>填写镜像、容器名称、容器类型和拉取策略。</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <FieldGroup className="flex flex-col gap-5">
            <div className="rounded-md border bg-card">
              <div className="border-b bg-muted/80 px-4 py-3">
                <div className="text-sm font-semibold">基础信息</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  填写容器的基础信息，包括镜像、容器名称、类型和拉取策略。
                </div>
              </div>
              <div className="grid gap-5 p-4">
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
                          <SelectItem value="IfNotPresent">优先使用本地镜像</SelectItem>
                          <SelectItem value="Always">每次都拉取镜像</SelectItem>
                          <SelectItem value="Never">仅使用本地镜像</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {resolveImagePullPolicyDescription(container.imagePullPolicy)}
                    </FieldDescription>
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
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <div className="border-b bg-muted/80 px-4 py-3">
                <div className="text-sm font-semibold">资源设置</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  设置容器的资源上限与资源预留，调度时会优先参考这些值。
                </div>
              </div>
              <div className="grid gap-5 p-4 md:grid-cols-2">
                <div className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor={`${container.id}-cpu-request`}>CPU 预留</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`${container.id}-cpu-request`}
                        value={container.cpuRequest}
                        onChange={(event) => onChange("cpuRequest", normalizeCpuInput(event.target.value))}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="无预留"
                        disabled={isBusy}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>Core</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`${container.id}-cpu-limit`}>CPU 限制</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`${container.id}-cpu-limit`}
                        value={container.cpuLimit}
                        onChange={(event) => onChange("cpuLimit", normalizeCpuInput(event.target.value))}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="无上限"
                        disabled={isBusy}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>Core</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </div>

                <div className="flex flex-col gap-3">
                  <Field>
                    <FieldLabel htmlFor={`${container.id}-memory-request`}>内存预留</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`${container.id}-memory-request`}
                        value={container.memoryRequestMi}
                        onChange={(event) =>
                          onChange("memoryRequestMi", normalizeMemoryInput(event.target.value))
                        }
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="无预留"
                        disabled={isBusy}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>Mi</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor={`${container.id}-memory-limit`}>内存上限</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={`${container.id}-memory-limit`}
                        value={container.memoryLimitMi}
                        onChange={(event) =>
                          onChange("memoryLimitMi", normalizeMemoryInput(event.target.value))
                        }
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="无上限"
                        disabled={isBusy}
                      />
                      <InputGroupAddon align="inline-end">
                        <InputGroupText>Mi</InputGroupText>
                      </InputGroupAddon>
                    </InputGroup>
                  </Field>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <div className="border-b bg-muted/80 px-4 py-3">
                <div className="text-sm font-semibold">端口设置</div>
                <div className="mt-1 text-sm text-muted-foreground">设置用于访问容器的端口。</div>
              </div>
              <div className="p-4">
                <FieldGroup className="flex flex-col gap-3">
                  {container.ports.length > 0
                    ? container.ports.map((item) => {
                      const fieldError = portFieldErrors[item.id]
                      return (
                        <div key={item.id} className="grid items-start gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                          <Select
                            value={item.protocol}
                            onValueChange={(value) => onUpdatePort(item.id, "protocol", value)}
                            disabled={isBusy}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="协议" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="GRPC">GRPC</SelectItem>
                                <SelectItem value="HTTP">HTTP</SelectItem>
                                <SelectItem value="HTTP2">HTTP2</SelectItem>
                                <SelectItem value="HTTPS">HTTPS</SelectItem>
                                <SelectItem value="MONGO">MONGO</SelectItem>
                                <SelectItem value="REDIS">REDIS</SelectItem>
                                <SelectItem value="TCP">TCP</SelectItem>
                                <SelectItem value="TLS">TLS</SelectItem>
                                <SelectItem value="UDP">UDP</SelectItem>
                                <SelectItem value="SCTP">SCTP</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <div className="flex flex-col gap-1">
                            <Input
                              id={`${container.id}-port-${item.id}-name`}
                              value={item.name}
                              onChange={(event) => onUpdatePort(item.id, "name", event.target.value)}
                              placeholder="名称"
                              aria-invalid={Boolean(fieldError?.name)}
                              disabled={isBusy}
                            />
                            {fieldError?.name ? (
                              <p className="text-xs text-destructive">{fieldError.name}</p>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-1">
                            <Input
                              id={`${container.id}-port-${item.id}-container-port`}
                              value={item.containerPort}
                              onChange={(event) =>
                                onUpdatePort(
                                  item.id,
                                  "containerPort",
                                  normalizePortInput(event.target.value)
                                )
                              }
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={5}
                              placeholder="容器端口"
                              aria-invalid={Boolean(fieldError?.containerPort)}
                              disabled={isBusy}
                            />
                            {fieldError?.containerPort ? (
                              <p className="text-xs text-destructive">{fieldError.containerPort}</p>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onRemovePort(item.id)}
                            disabled={isBusy}
                          >
                            删除
                          </Button>
                        </div>
                      )
                    })
                    : null}

                  <div className="flex justify-end">
                    <Button type="button" variant="outline" onClick={onAddPort} disabled={isBusy}>
                      添加端口
                    </Button>
                  </div>
                </FieldGroup>
              </div>
            </div>

            <div className="rounded-md border bg-card">
              <div className="border-b bg-muted/80 px-4 py-3">
                <div className="text-sm font-semibold">扩展配置</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  通过开关启用容器扩展能力，具体参数配置后续逐步开放。
                </div>
              </div>
              <div className="p-4">
                <ItemGroup className="gap-3">
                  {CONTAINER_EXTENSION_OPTIONS.map((option) => {
                    const checked =
                      option.key === "syncHostTimezone"
                        ? container.syncHostTimezone
                        : extensionState[option.key]
                    const isStartupCommand = option.key === "startupCommand"
                    return (
                      <Item key={option.key} variant="outline" className="items-start">
                        <Checkbox
                          id={`${container.id}-option-${option.key}`}
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            const nextValue = nextChecked === true
                            setExtensionState((current) => ({
                              ...current,
                              [option.key]: nextValue,
                            }))
                            if (option.key === "syncHostTimezone") {
                              onChange("syncHostTimezone", nextValue)
                            } else if (option.key === "startupCommand" && !nextValue) {
                              onChange("command", "")
                              onChange("args", "")
                            }
                          }}
                          disabled={isBusy}
                          className="mt-1"
                        />
                        <ItemContent>
                          <ItemTitle>{option.title}</ItemTitle>
                          <ItemDescription>{option.description}</ItemDescription>
                        </ItemContent>

                        {isStartupCommand && checked ? (
                          <div className="basis-full rounded-md bg-muted/60 p-4">
                            <FieldGroup className="flex flex-col gap-4">
                              <Field>
                                <FieldLabel htmlFor={`${container.id}-startup-command`}>命令</FieldLabel>
                                <Textarea
                                  id={`${container.id}-startup-command`}
                                  value={container.command}
                                  onChange={(event) => onChange("command", event.target.value)}
                                  placeholder='例如：["/bin/sh"]'
                                  className="min-h-20"
                                  disabled={isBusy}
                                />
                                <FieldDescription>容器的启动命令。</FieldDescription>
                              </Field>

                              <Field>
                                <FieldLabel htmlFor={`${container.id}-startup-args`}>参数</FieldLabel>
                                <Textarea
                                  id={`${container.id}-startup-args`}
                                  value={container.args}
                                  onChange={(event) => onChange("args", event.target.value)}
                                  placeholder='例如：["-c", "while true; do echo hello; sleep 10;done"]'
                                  className="min-h-20"
                                  disabled={isBusy}
                                />
                                <FieldDescription>
                                  容器启动命令的参数。如有多个参数请使用半角逗号（,）分隔。
                                </FieldDescription>
                              </Field>
                            </FieldGroup>
                          </div>
                        ) : null}
                      </Item>
                    )
                  })}
                </ItemGroup>
              </div>
            </div>
          </FieldGroup>
        </div>

        <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
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
