"use client"

import { IconFileText, IconKey, IconTrash, IconX } from "@tabler/icons-react"
import { type ContainerPortFieldErrors } from "@/app/lib/kubespark/form-validation"
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { AdvancedToggleCard } from "@/app/(examples)/dashboard/components/resource-pages/advanced-toggle-card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  CONTAINER_EXTENSION_OPTIONS,
  HEALTH_CHECK_SECTIONS,
  LIFECYCLE_SECTIONS,
  createDefaultLifecyclePopoverOpenState,
  createDefaultLifecycleState,
  createDefaultProbePopoverOpenState,
  createDefaultProbeState,
  createDefaultSecurityContextDraft,
  createDefaultLifecycleActionDraft,
  createDefaultProbeDraft,
  normalizeCpuInput,
  normalizeIdentityInput,
  normalizeMemoryInput,
  normalizePortInput,
  resolveImagePullPolicyDescription,
  resolveLifecycleSummary,
  resolveProbeSummary,
  type ContainerDraft,
  type ContainerEnvVarSource,
  type ContainerLifecycleActionDraft,
  type ContainerLifecycleMap,
  type ContainerProbeDraft,
  type ContainerProbeMap,
  type ContainerSecurityContextDraft,
  type LifecycleSectionKey,
  type ProbeMode,
  type ProbeSectionKey,
} from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog.logic"
import { useCreateContainerDialogController } from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog.controller"

export type {
  ContainerDraft,
  ContainerEnvVarDraft,
  ContainerEnvVarSource,
  ContainerLifecycleActionDraft,
  ContainerLifecycleMap,
  ContainerPortDraft,
  ContainerPortProtocol,
  ContainerProbeDraft,
  ContainerProbeMap,
  ContainerSecurityContextDraft,
  ContainerType,
  LifecycleSectionKey,
  ProbeMode,
  ProbeSectionKey,
} from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog.logic"

type CreateContainerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  container: ContainerDraft | null
  imageError: string | null
  portFieldErrors: ContainerPortFieldErrors
  envDuplicateIds?: string[]
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
      | "memoryLimitMi"
      | "probes"
      | "lifecycle"
      | "securityContext",
    value:
      | string
      | boolean
      | ContainerProbeMap
      | ContainerLifecycleMap
      | ContainerSecurityContextDraft
  ) => void
  onAddPort: () => void
  onUpdatePort: (
    portId: string,
    field: "protocol" | "name" | "containerPort",
    value: string
  ) => void
  onRemovePort: (portId: string) => void
  onAddEnv: (defaults?: {
    source?: ContainerEnvVarSource
    name?: string
    value?: string
    sourceResource?: string
    sourceKey?: string
  }) => void
  onClearEnv: () => void
  onUpdateEnv: (
    envId: string,
    field: "source" | "name" | "value" | "sourceResource" | "sourceKey",
    value: string
  ) => void
  onRemoveEnv: (envId: string) => void
  onCancel: () => void
  onConfirm: () => void
}

export function CreateContainerDialog({
  open,
  onOpenChange,
  namespace,
  container,
  imageError,
  portFieldErrors,
  envDuplicateIds = [],
  isBusy,
  onChange,
  onAddPort,
  onUpdatePort,
  onRemovePort,
  onAddEnv,
  onClearEnv,
  onUpdateEnv,
  onRemoveEnv,
  onCancel,
  onConfirm,
}: CreateContainerDialogProps) {
  const {
    cancelLifecycleEdit,
    cancelProbeEdit,
    clearLifecycleEdit,
    clearProbeEdit,
    configMapKeyRefOptions,
    confirmEnvBatchImport,
    confirmLifecycleEdit,
    confirmProbeEdit,
    envBatchAllChecked,
    envBatchKeySet,
    envBatchKeys,
    envBatchPopoverOpen,
    envBatchResourceName,
    envBatchResources,
    envBatchSelectedKeys,
    envBatchSource,
    envDuplicateIdSet,
    extensionState,
    handleLifecyclePopoverOpenChange,
    handleProbePopoverOpenChange,
    lifecyclePopoverOpen,
    lifecycleState,
    probePopoverOpen,
    probeState,
    secretKeyRefOptions,
    securityContextDraft,
    setEnvBatchPopoverOpen,
    setEnvBatchResourceName,
    setEnvBatchSelectedKeys,
    setEnvBatchSource,
    setExtensionState,
    setLifecyclePopoverOpen,
    setLifecycleState,
    setProbePopoverOpen,
    setProbeState,
    toggleEnvBatchKey,
    updateLifecycleDraft,
    updateProbeDraft,
  } = useCreateContainerDialogController({
    open,
    namespace,
    container,
    imageError,
    portFieldErrors,
    envDuplicateIds,
    onAddEnv,
    onChange,
  })

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
        overlayClassName="!bg-transparent !backdrop-blur-none"
        className="flex max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
      >
        <DialogHeader className="shrink-0 border-b bg-muted/15 px-6 py-5 pr-20">
          <DialogTitle>录入容器</DialogTitle>
          <DialogDescription>填写镜像、容器名称、容器类型和拉取策略。</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
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
                    <FieldDescription>
                      留空时会基于镜像地址自动生成。
                    </FieldDescription>
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
                          <Field>
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
                                  <SelectItem value="TCP">TCP</SelectItem>
                                  <SelectItem value="UDP">UDP</SelectItem>
                                  <SelectItem value="SCTP">SCTP</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <InputGroup>
                              <InputGroupAddon>
                                <InputGroupText>名称</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
                                id={`${container.id}-port-${item.id}-name`}
                                value={item.name}
                                onChange={(event) => onUpdatePort(item.id, "name", event.target.value)}
                                aria-invalid={Boolean(fieldError?.name)}
                                disabled={isBusy}
                              />
                            </InputGroup>
                            {fieldError?.name ? (
                              <p className="text-xs text-destructive">{fieldError.name}</p>
                            ) : null}
                          </Field>
                          <Field>
                            <InputGroup>
                              <InputGroupAddon>
                                <InputGroupText>容器端口</InputGroupText>
                              </InputGroupAddon>
                              <InputGroupInput
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
                                aria-invalid={Boolean(fieldError?.containerPort)}
                                disabled={isBusy}
                              />
                            </InputGroup>
                            {fieldError?.containerPort ? (
                              <p className="text-xs text-destructive">{fieldError.containerPort}</p>
                            ) : null}
                          </Field>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onRemovePort(item.id)}
                            disabled={isBusy}
                          >
                            <IconTrash data-icon="inline-start" />
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
                <div className="space-y-3">
                  {CONTAINER_EXTENSION_OPTIONS.map((option) => {
                    const checked =
                      option.key === "syncHostTimezone"
                        ? container.syncHostTimezone
                        : extensionState[option.key]
                    const isStartupCommand = option.key === "startupCommand"
                    return (
                      <AdvancedToggleCard
                        key={option.key}
                        checked={checked}
                        disabled={isBusy}
                        ariaLabel={option.title}
                        title={option.title}
                        description={option.description}
                        onCheckedChange={(nextValue) => {
                          setExtensionState((current) => ({
                            ...current,
                            [option.key]: nextValue,
                          }))
                          if (option.key === "syncHostTimezone") {
                            onChange("syncHostTimezone", nextValue)
                          } else if (option.key === "securityContext" && !nextValue) {
                            onChange("securityContext", createDefaultSecurityContextDraft())
                          } else if (option.key === "healthCheck" && !nextValue) {
                            setProbeState(createDefaultProbeState())
                            setProbePopoverOpen(createDefaultProbePopoverOpenState())
                            onChange("probes", {})
                          } else if (option.key === "lifecycle" && !nextValue) {
                            setLifecycleState(createDefaultLifecycleState())
                            setLifecyclePopoverOpen(createDefaultLifecyclePopoverOpenState())
                            onChange("lifecycle", {})
                          } else if (option.key === "startupCommand" && !nextValue) {
                            onChange("command", "")
                            onChange("args", "")
                          } else if (option.key === "env" && nextValue && container.env.length === 0) {
                            onAddEnv({
                              name: "TZ",
                              value: "Asia/Shanghai",
                            })
                          } else if (option.key === "env" && !nextValue) {
                            onClearEnv()
                          }
                        }}
                      >

                        {isStartupCommand && checked ? (
                          <div className="basis-full">
                            <FieldGroup className="flex flex-col gap-4">
                              <Field>
                                <FieldLabel htmlFor={`${container.id}-startup-command`}>命令</FieldLabel>
                                <Textarea
                                  id={`${container.id}-startup-command`}
                                  value={container.command}
                                  onChange={(event) => onChange("command", event.target.value)}
                                  placeholder="例如：/bin/sh"
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
                                  placeholder="例如：-c,while true; do echo hello; sleep 10;done"
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

                        {option.key === "healthCheck" && checked ? (
                          <div className="basis-full">
                            <div className="flex flex-col gap-6">
                              {HEALTH_CHECK_SECTIONS.map((section) => {
                                const sectionState = probeState[section.key]
                                const draft = sectionState.draft
                                const isOpen = probePopoverOpen[section.key]
                                return (
                                  <div key={section.key} className="flex flex-col gap-2">
                                    <p className="text-sm text-foreground">{section.title}</p>
                                    <div className="flex items-center gap-2">
                                      <Popover
                                        open={isOpen}
                                        onOpenChange={(nextOpen) =>
                                          handleProbePopoverOpenChange(section.key, nextOpen)
                                        }
                                      >
                                        <PopoverTrigger asChild>
                                          <div
                                            className={cn(
                                              "group relative w-full cursor-pointer rounded-md border border-dashed bg-background px-4 py-3 pr-20 text-left text-sm transition-colors hover:border-muted-foreground/40 hover:bg-muted/40",
                                              sectionState.enabled && "border-primary/40",
                                              isBusy && "pointer-events-none opacity-60"
                                            )}
                                          >
                                            {sectionState.enabled ? resolveProbeSummary(draft) : "添加探针"}
                                            {sectionState.enabled ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute top-1/2 right-3 h-7 w-7 -translate-y-1/2 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                                onPointerDown={(event) => {
                                                  event.preventDefault()
                                                  event.stopPropagation()
                                                }}
                                                onClick={(event) => {
                                                  event.preventDefault()
                                                  event.stopPropagation()
                                                  clearProbeEdit(section.key)
                                                }}
                                                disabled={isBusy}
                                              >
                                                <IconX className="size-4" />
                                                <span className="sr-only">清空探针</span>
                                              </Button>
                                            ) : null}
                                          </div>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-[min(86vw,760px)] p-4"
                                          align="start"
                                          side="bottom"
                                          sideOffset={8}
                                        >
                                          <div className="space-y-4">
                                          <Tabs
                                            value={draft.mode}
                                            onValueChange={(value) => {
                                              if (value === "http" || value === "command" || value === "tcp") {
                                                updateProbeDraft(section.key, "mode", value)
                                              }
                                            }}
                                          >
                                            <TabsList className="grid w-full grid-cols-3">
                                              <TabsTrigger value="http">HTTP 请求</TabsTrigger>
                                              <TabsTrigger value="command">命令</TabsTrigger>
                                              <TabsTrigger value="tcp">TCP 端口</TabsTrigger>
                                            </TabsList>
                                          </Tabs>

                                          {draft.mode === "http" ? (
                                            <div className="space-y-3">
                                              <div className="text-sm">路径</div>
                                              <div className="grid gap-3 md:grid-cols-3">
                                                <div className="w-full">
                                                  <Select
                                                    value={draft.httpScheme}
                                                    onValueChange={(value) => {
                                                      if (value === "HTTP" || value === "HTTPS") {
                                                        updateProbeDraft(section.key, "httpScheme", value)
                                                      }
                                                    }}
                                                    disabled={isBusy}
                                                  >
                                                    <SelectTrigger className="w-full">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectGroup>
                                                        <SelectItem value="HTTP">HTTP</SelectItem>
                                                        <SelectItem value="HTTPS">HTTPS</SelectItem>
                                                      </SelectGroup>
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <Input
                                                  value={draft.httpPath}
                                                  onChange={(event) =>
                                                    updateProbeDraft(section.key, "httpPath", event.target.value)
                                                  }
                                                  placeholder="/"
                                                  autoComplete="off"
                                                  disabled={isBusy}
                                                />
                                                <Input
                                                  value={draft.httpPort}
                                                  onChange={(event) =>
                                                    updateProbeDraft(
                                                      section.key,
                                                      "httpPort",
                                                      normalizePortInput(event.target.value)
                                                    )
                                                  }
                                                  placeholder="80"
                                                  inputMode="numeric"
                                                  maxLength={5}
                                                  autoComplete="off"
                                                  disabled={isBusy}
                                                />
                                              </div>
                                            </div>
                                          ) : null}

                                          {draft.mode === "command" ? (
                                            <div className="space-y-3">
                                              <div className="text-sm">命令</div>
                                              <Input
                                                value={draft.command}
                                                onChange={(event) =>
                                                  updateProbeDraft(section.key, "command", event.target.value)
                                                }
                                                placeholder='/bin/sh -c "echo ok"'
                                                disabled={isBusy}
                                              />
                                            </div>
                                          ) : null}

                                          {draft.mode === "tcp" ? (
                                            <div className="space-y-3">
                                              <div className="text-sm">TCP 端口</div>
                                              <Input
                                                value={draft.tcpPort}
                                                onChange={(event) =>
                                                  updateProbeDraft(
                                                    section.key,
                                                    "tcpPort",
                                                    normalizePortInput(event.target.value)
                                                  )
                                                }
                                                placeholder="80"
                                                inputMode="numeric"
                                                maxLength={5}
                                                autoComplete="off"
                                                disabled={isBusy}
                                              />
                                            </div>
                                          ) : null}

                                          <div className="grid gap-3 md:grid-cols-3">
                                            <Field>
                                              <FieldLabel>初始延迟（s）</FieldLabel>
                                              <Input
                                                value={draft.initialDelaySeconds}
                                                onChange={(event) =>
                                                  updateProbeDraft(
                                                    section.key,
                                                    "initialDelaySeconds",
                                                    normalizeMemoryInput(event.target.value)
                                                  )
                                                }
                                                inputMode="numeric"
                                                autoComplete="off"
                                                disabled={isBusy}
                                              />
                                            </Field>
                                            <Field>
                                              <FieldLabel>超时时间（s）</FieldLabel>
                                              <Input
                                                value={draft.timeoutSeconds}
                                                onChange={(event) =>
                                                  updateProbeDraft(
                                                    section.key,
                                                    "timeoutSeconds",
                                                    normalizeMemoryInput(event.target.value)
                                                  )
                                                }
                                                inputMode="numeric"
                                                autoComplete="off"
                                                disabled={isBusy}
                                              />
                                            </Field>
                                            <Field>
                                              <FieldLabel>检查间隔（s）</FieldLabel>
                                              <Input
                                                value={draft.periodSeconds}
                                                onChange={(event) =>
                                                  updateProbeDraft(
                                                    section.key,
                                                    "periodSeconds",
                                                    normalizeMemoryInput(event.target.value)
                                                  )
                                                }
                                                inputMode="numeric"
                                                autoComplete="off"
                                                disabled={isBusy}
                                              />
                                            </Field>
                                            <Field>
                                              <FieldLabel>成功阈值</FieldLabel>
                                              <Input
                                                value={draft.successThreshold}
                                                onChange={(event) =>
                                                  updateProbeDraft(
                                                    section.key,
                                                    "successThreshold",
                                                    normalizeMemoryInput(event.target.value)
                                                  )
                                                }
                                                inputMode="numeric"
                                                autoComplete="off"
                                                disabled={isBusy}
                                              />
                                            </Field>
                                            <Field>
                                              <FieldLabel>失败阈值</FieldLabel>
                                              <Input
                                                value={draft.failureThreshold}
                                                onChange={(event) =>
                                                  updateProbeDraft(
                                                    section.key,
                                                    "failureThreshold",
                                                    normalizeMemoryInput(event.target.value)
                                                  )
                                                }
                                                inputMode="numeric"
                                                autoComplete="off"
                                                disabled={isBusy}
                                              />
                                            </Field>
                                            <div aria-hidden className="hidden md:block" />
                                          </div>

                                            <div className="flex justify-end gap-2 border-t pt-3">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => cancelProbeEdit(section.key)}
                                                disabled={isBusy}
                                              >
                                                取消
                                              </Button>
                                              <Button
                                                type="button"
                                                onClick={() => confirmProbeEdit(section.key)}
                                                disabled={isBusy}
                                              >
                                                确定
                                              </Button>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{section.description}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {option.key === "lifecycle" && checked ? (
                          <div className="basis-full">
                            <div className="flex flex-col gap-6">
                              {LIFECYCLE_SECTIONS.map((section) => {
                                const sectionState = lifecycleState[section.key]
                                const draft = sectionState.draft
                                const isOpen = lifecyclePopoverOpen[section.key]
                                return (
                                  <div key={section.key} className="flex flex-col gap-2">
                                    <p className="text-sm text-foreground">{section.title}</p>
                                    <div className="flex items-center gap-2">
                                      <Popover
                                        open={isOpen}
                                        onOpenChange={(nextOpen) =>
                                          handleLifecyclePopoverOpenChange(section.key, nextOpen)
                                        }
                                      >
                                        <PopoverTrigger asChild>
                                          <div
                                            className={cn(
                                              "group relative w-full cursor-pointer rounded-md border border-dashed bg-background px-4 py-3 pr-20 text-left text-sm transition-colors hover:border-muted-foreground/40 hover:bg-muted/40",
                                              sectionState.enabled && "border-primary/40",
                                              isBusy && "pointer-events-none opacity-60"
                                            )}
                                          >
                                            {sectionState.enabled
                                              ? resolveLifecycleSummary(draft)
                                              : "添加动作"}
                                            {sectionState.enabled ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute top-1/2 right-3 h-7 w-7 -translate-y-1/2 p-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                                onPointerDown={(event) => {
                                                  event.preventDefault()
                                                  event.stopPropagation()
                                                }}
                                                onClick={(event) => {
                                                  event.preventDefault()
                                                  event.stopPropagation()
                                                  clearLifecycleEdit(section.key)
                                                }}
                                                disabled={isBusy}
                                              >
                                                <IconX className="size-4" />
                                                <span className="sr-only">清空动作</span>
                                              </Button>
                                            ) : null}
                                          </div>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-[min(86vw,760px)] p-4"
                                          align="start"
                                          side="bottom"
                                          sideOffset={8}
                                        >
                                          <div className="space-y-4">
                                            <Tabs
                                              value={draft.mode}
                                              onValueChange={(value) => {
                                                if (value === "http" || value === "command" || value === "tcp") {
                                                  updateLifecycleDraft(section.key, "mode", value)
                                                }
                                              }}
                                            >
                                              <TabsList className="grid w-full grid-cols-3">
                                                <TabsTrigger value="http">HTTP 请求</TabsTrigger>
                                                <TabsTrigger value="command">命令</TabsTrigger>
                                                <TabsTrigger value="tcp">TCP 端口</TabsTrigger>
                                              </TabsList>
                                            </Tabs>

                                            {draft.mode === "http" ? (
                                              <div className="space-y-3">
                                                <div className="text-sm">路径</div>
                                                <div className="grid gap-3 md:grid-cols-3">
                                                  <Select
                                                    value={draft.httpScheme}
                                                    onValueChange={(value) => {
                                                      if (value === "HTTP" || value === "HTTPS") {
                                                        updateLifecycleDraft(section.key, "httpScheme", value)
                                                      }
                                                    }}
                                                    disabled={isBusy}
                                                  >
                                                    <SelectTrigger className="w-full">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      <SelectGroup>
                                                        <SelectItem value="HTTP">HTTP</SelectItem>
                                                        <SelectItem value="HTTPS">HTTPS</SelectItem>
                                                      </SelectGroup>
                                                    </SelectContent>
                                                  </Select>
                                                  <Input
                                                    value={draft.httpPath}
                                                    onChange={(event) =>
                                                      updateLifecycleDraft(
                                                        section.key,
                                                        "httpPath",
                                                        event.target.value
                                                      )
                                                    }
                                                    placeholder="/"
                                                    autoComplete="off"
                                                    disabled={isBusy}
                                                  />
                                                  <Input
                                                    value={draft.httpPort}
                                                    onChange={(event) =>
                                                      updateLifecycleDraft(
                                                        section.key,
                                                        "httpPort",
                                                        normalizePortInput(event.target.value)
                                                      )
                                                    }
                                                    placeholder="80"
                                                    inputMode="numeric"
                                                    maxLength={5}
                                                    autoComplete="off"
                                                    disabled={isBusy}
                                                  />
                                                </div>
                                              </div>
                                            ) : null}

                                            {draft.mode === "command" ? (
                                              <div className="space-y-3">
                                                <div className="text-sm">命令</div>
                                                <Input
                                                  value={draft.command}
                                                  onChange={(event) =>
                                                    updateLifecycleDraft(
                                                      section.key,
                                                      "command",
                                                      event.target.value
                                                    )
                                                  }
                                                  placeholder='/bin/sh -c "echo ready"'
                                                  disabled={isBusy}
                                                />
                                              </div>
                                            ) : null}

                                            {draft.mode === "tcp" ? (
                                              <div className="space-y-3">
                                                <div className="text-sm">TCP 端口</div>
                                                <Input
                                                  value={draft.tcpPort}
                                                  onChange={(event) =>
                                                    updateLifecycleDraft(
                                                      section.key,
                                                      "tcpPort",
                                                      normalizePortInput(event.target.value)
                                                    )
                                                  }
                                                  placeholder="80"
                                                  inputMode="numeric"
                                                  maxLength={5}
                                                  autoComplete="off"
                                                  disabled={isBusy}
                                                />
                                              </div>
                                            ) : null}

                                            <div className="flex justify-end gap-2 border-t pt-3">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => cancelLifecycleEdit(section.key)}
                                                disabled={isBusy}
                                              >
                                                取消
                                              </Button>
                                              <Button
                                                type="button"
                                                onClick={() => confirmLifecycleEdit(section.key)}
                                                disabled={isBusy}
                                              >
                                                确定
                                              </Button>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{section.description}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {option.key === "env" && checked ? (
                          <div className="basis-full">
                            <FieldGroup className="flex flex-col gap-3">
                              {container.env.length > 0 ? (
                                container.env.map((item) => (
                                  (() => {
                                    const sourceOptions =
                                      item.source === "configMap"
                                        ? configMapKeyRefOptions
                                        : item.source === "secret"
                                          ? secretKeyRefOptions
                                          : []
                                    const selectedSource = sourceOptions.find(
                                      (option) => option.name === item.sourceResource
                                    )
                                    const sourceKeyOptions = selectedSource?.keys ?? []

                                    return (
                                  <div
                                    key={item.id}
                                    className={cn(
                                      item.source === "custom"
                                        ? "grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                                        : "grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]",
                                      envDuplicateIdSet.has(item.id) && "rounded-md border border-destructive/80 bg-destructive/5 p-2"
                                    )}
                                  >
                                    <Select
                                      value={item.source}
                                      onValueChange={(value) => {
                                        if (value === "custom" || value === "configMap" || value === "secret") {
                                          onUpdateEnv(item.id, "source", value)
                                          // 切换来源后清空当前行内容，避免不同来源字段混用
                                          onUpdateEnv(item.id, "name", "")
                                          onUpdateEnv(item.id, "value", "")
                                          onUpdateEnv(item.id, "sourceResource", "")
                                          onUpdateEnv(item.id, "sourceKey", "")
                                        }
                                      }}
                                      disabled={isBusy}
                                    >
                                      <SelectTrigger className="w-full min-w-0">
                                        <span className="flex items-center gap-2">
                                          {item.source === "configMap" ? (
                                            <IconFileText className="size-4 text-muted-foreground" />
                                          ) : item.source === "secret" ? (
                                            <IconKey className="size-4 text-muted-foreground" />
                                          ) : null}
                                          <SelectValue />
                                        </span>
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectGroup>
                                          <SelectItem value="custom">自定义</SelectItem>
                                          <SelectItem value="configMap">来自配置字典</SelectItem>
                                          <SelectItem value="secret">来自保密字典</SelectItem>
                                        </SelectGroup>
                                      </SelectContent>
                                    </Select>
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <Input
                                        id={`${container.id}-env-${item.id}-name`}
                                        value={item.name}
                                        onChange={(event) => onUpdateEnv(item.id, "name", event.target.value)}
                                        placeholder="键"
                                        autoComplete="off"
                                        className="min-w-0"
                                        aria-invalid={envDuplicateIdSet.has(item.id)}
                                        disabled={isBusy}
                                      />
                                      {envDuplicateIdSet.has(item.id) ? (
                                        <p className="text-xs text-destructive">环境变量名称重复</p>
                                      ) : null}
                                    </div>
                                    {item.source === "custom" ? (
                                      <Input
                                        value={item.value}
                                        onChange={(event) => onUpdateEnv(item.id, "value", event.target.value)}
                                        placeholder="值"
                                        autoComplete="off"
                                        className="min-w-0"
                                        disabled={isBusy}
                                      />
                                    ) : (
                                      <>
                                        <Select
                                          value={item.sourceResource}
                                          onValueChange={(value) => {
                                            onUpdateEnv(item.id, "sourceResource", value)
                                            // 资源变更后清空已选 key 和键名，避免与旧资源不一致
                                            onUpdateEnv(item.id, "sourceKey", "")
                                            onUpdateEnv(item.id, "name", "")
                                          }}
                                          disabled={isBusy}
                                        >
                                          <SelectTrigger className="w-full min-w-0">
                                            <SelectValue
                                              placeholder={
                                                item.source === "configMap"
                                                  ? "选择配置字典"
                                                  : "选择保密字典"
                                              }
                                            />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectGroup>
                                              {sourceOptions.length > 0 ? (
                                                sourceOptions.map((option) => (
                                                  <SelectItem key={option.name} value={option.name}>
                                                    {option.name}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                <SelectItem value="__empty__" disabled>
                                                  {item.source === "configMap"
                                                    ? "当前项目暂无配置字典"
                                                    : "当前项目暂无保密字典"}
                                                </SelectItem>
                                              )}
                                            </SelectGroup>
                                          </SelectContent>
                                        </Select>
                                        <Select
                                          value={item.sourceKey}
                                          onValueChange={(value) => {
                                            onUpdateEnv(item.id, "sourceKey", value)
                                            // 选择资源中的键后，同步写入环境变量名
                                            onUpdateEnv(item.id, "name", value)
                                          }}
                                          disabled={isBusy || !item.sourceResource}
                                        >
                                          <SelectTrigger className="w-full min-w-0">
                                            <SelectValue placeholder="选择资源中的键" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectGroup>
                                              {sourceKeyOptions.length > 0 ? (
                                                sourceKeyOptions.map((keyName) => (
                                                  <SelectItem key={keyName} value={keyName}>
                                                    {keyName}
                                                  </SelectItem>
                                                ))
                                              ) : (
                                                <SelectItem value="__empty__" disabled>
                                                  {item.sourceResource ? "该资源暂无可选键" : "请先选择资源"}
                                                </SelectItem>
                                              )}
                                            </SelectGroup>
                                          </SelectContent>
                                        </Select>
                                      </>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      className="shrink-0"
                                      onClick={() => onRemoveEnv(item.id)}
                                      disabled={isBusy}
                                    >
                                      删除
                                    </Button>
                                  </div>
                                    )
                                  })()
                                ))
                              ) : (
                                <FieldDescription>暂无环境变量，点击右下角添加。</FieldDescription>
                              )}
                              <div className="flex justify-end gap-2">

                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => onAddEnv()}
                                  disabled={isBusy}
                                >
                                  添加环境变量
                                </Button>

                                <Popover open={envBatchPopoverOpen} onOpenChange={setEnvBatchPopoverOpen}>
                                  <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isBusy}
                                    >
                                      批量引用
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[520px] p-3" align="end">
                                    <div className="space-y-3">
                                      <Tabs
                                          value={envBatchSource}
                                          onValueChange={(value) => {
                                            if (value !== "configMap" && value !== "secret") return
                                            setEnvBatchSource(value)
                                            const nextOptions =
                                                value === "configMap" ? configMapKeyRefOptions : secretKeyRefOptions
                                            setEnvBatchResourceName(nextOptions[0]?.name ?? "")
                                            setEnvBatchSelectedKeys([])
                                          }}
                                          className="w-full"
                                      >
                                        <TabsList className="grid w-full grid-cols-2">
                                          <TabsTrigger value="configMap">配置字典</TabsTrigger>
                                          <TabsTrigger value="secret">保密字典</TabsTrigger>
                                        </TabsList>
                                      </Tabs>

                                      <div className="space-y-2">
                                        <div className="text-sm font-medium">
                                          {envBatchSource === "configMap" ? "配置字典" : "保密字典"}
                                        </div>
                                        <Select
                                            value={envBatchResourceName}
                                            onValueChange={(value) => {
                                              setEnvBatchResourceName(value)
                                              setEnvBatchSelectedKeys([])
                                            }}
                                            disabled={isBusy || envBatchResources.length === 0}
                                        >
                                          <SelectTrigger className="w-full">
                                            <SelectValue
                                                placeholder={
                                                  envBatchSource === "configMap"
                                                      ? "选择配置字典"
                                                      : "选择保密字典"
                                                }
                                            />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectGroup>
                                              {envBatchResources.length > 0 ? (
                                                  envBatchResources.map((option) => (
                                                      <SelectItem key={option.name} value={option.name}>
                                                        {option.name}
                                                      </SelectItem>
                                                  ))
                                              ) : (
                                                  <SelectItem value="__empty__" disabled>
                                                    {envBatchSource === "configMap"
                                                        ? "当前项目暂无配置字典"
                                                        : "当前项目暂无保密字典"}
                                                  </SelectItem>
                                              )}
                                            </SelectGroup>
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="text-sm font-medium">键</div>
                                          <button
                                              type="button"
                                              className="text-sm text-primary hover:underline"
                                              disabled={isBusy || envBatchKeys.length === 0}
                                              onClick={() =>
                                                  setEnvBatchSelectedKeys(
                                                      envBatchAllChecked ? [] : envBatchKeys
                                                  )
                                              }
                                          >
                                            {envBatchAllChecked ? "取消全选" : "选择全部"}
                                          </button>
                                        </div>
                                        <div className="max-h-56 overflow-y-auto rounded-md bg-muted/40 p-2">
                                          {envBatchKeys.length > 0 ? (
                                              <div className="space-y-1">
                                                {envBatchKeys.map((keyName) => (
                                                    <label
                                                        key={keyName}
                                                        className="flex cursor-pointer items-center gap-2 rounded-md bg-background px-3 py-2"
                                                    >
                                                      <Checkbox
                                                          checked={envBatchKeySet.has(keyName)}
                                                          onCheckedChange={(checked) =>
                                                              toggleEnvBatchKey(keyName, checked === true)
                                                          }
                                                          disabled={isBusy}
                                                      />
                                                      <span className="text-sm">{keyName}</span>
                                                    </label>
                                                ))}
                                              </div>
                                          ) : (
                                              <div className="px-2 py-4 text-sm text-muted-foreground">
                                                {envBatchResourceName
                                                    ? "该资源暂无可选键。"
                                                    : "请先选择资源。"}
                                              </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-end gap-2 border-t pt-3">
                                      <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => {
                                            setEnvBatchPopoverOpen(false)
                                            setEnvBatchSelectedKeys([])
                                          }}
                                          disabled={isBusy}
                                      >
                                        取消
                                      </Button>
                                      <Button
                                          type="button"
                                          onClick={confirmEnvBatchImport}
                                          disabled={
                                              isBusy ||
                                              !envBatchResourceName.trim() ||
                                              envBatchSelectedKeys.length === 0
                                          }
                                      >
                                        确定
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>

                              </div>
                            </FieldGroup>
                          </div>
                        ) : null}

                        {option.key === "securityContext" && checked ? (
                          <div className="basis-full">
                            <div className="space-y-4">
                              <div className="space-y-3">
                                <p className="text-sm text-foreground">访问控制</p>
                                <div className="space-y-3 rounded-md border bg-background p-3">
                                  <Field orientation="horizontal" >
                                    <FieldContent>
                                      <FieldTitle>特权模式</FieldTitle>
                                      <FieldDescription>允许容器以特权方式运行进程。</FieldDescription>
                                    </FieldContent>
                                    <Switch
                                      checked={securityContextDraft.privileged}
                                      onCheckedChange={(nextValue) =>
                                        onChange("securityContext", {
                                          ...securityContextDraft,
                                          privileged: nextValue === true,
                                        })
                                      }
                                      disabled={isBusy}
                                    />
                                  </Field>
                                  <Field orientation="horizontal" className="mt-4">
                                    <FieldContent>
                                      <FieldTitle>允许特权提升</FieldTitle>
                                      <FieldDescription>允许进程获得比父进程更高权限。</FieldDescription>
                                    </FieldContent>
                                    <Switch
                                      checked={securityContextDraft.allowPrivilegeEscalation}
                                      onCheckedChange={(nextValue) =>
                                        onChange("securityContext", {
                                          ...securityContextDraft,
                                          allowPrivilegeEscalation: nextValue === true,
                                        })
                                      }
                                      disabled={isBusy}
                                    />
                                  </Field>
                                  <Field orientation="horizontal" className="mt-4">
                                    <FieldContent>
                                      <FieldTitle>根目录只读</FieldTitle>
                                      <FieldDescription>将容器根文件系统挂载为只读。</FieldDescription>
                                    </FieldContent>
                                    <Switch
                                      checked={securityContextDraft.readOnlyRootFilesystem}
                                      onCheckedChange={(nextValue) =>
                                        onChange("securityContext", {
                                          ...securityContextDraft,
                                          readOnlyRootFilesystem: nextValue === true,
                                        })
                                      }
                                      disabled={isBusy}
                                    />
                                  </Field>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <p className="text-sm text-foreground">用户和用户组</p>
                                <div className="space-y-4 rounded-md border bg-background p-3">
                                  <Field orientation="horizontal">
                                    <FieldContent>
                                      <FieldTitle>仅允许非 root 运行</FieldTitle>
                                      <FieldDescription>开启后会拒绝 root 用户运行容器。</FieldDescription>
                                    </FieldContent>
                                    <Switch
                                      checked={securityContextDraft.runAsNonRoot}
                                      onCheckedChange={(nextValue) =>
                                        onChange("securityContext", {
                                          ...securityContextDraft,
                                          runAsNonRoot: nextValue === true,
                                        })
                                      }
                                      disabled={isBusy}
                                    />
                                  </Field>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <Field>
                                      <FieldLabel htmlFor={`${container.id}-security-run-as-user`}>用户 UID</FieldLabel>
                                      <Input
                                        id={`${container.id}-security-run-as-user`}
                                        value={securityContextDraft.runAsUser}
                                        onChange={(event) =>
                                          onChange("securityContext", {
                                            ...securityContextDraft,
                                            runAsUser: normalizeIdentityInput(event.target.value),
                                          })
                                        }
                                        placeholder="1000"
                                        inputMode="numeric"
                                        maxLength={10}
                                        autoComplete="off"
                                        disabled={isBusy}
                                      />
                                    </Field>
                                    <Field>
                                      <FieldLabel htmlFor={`${container.id}-security-run-as-group`}>
                                        用户组 GID
                                      </FieldLabel>
                                      <Input
                                        id={`${container.id}-security-run-as-group`}
                                        value={securityContextDraft.runAsGroup}
                                        onChange={(event) =>
                                          onChange("securityContext", {
                                            ...securityContextDraft,
                                            runAsGroup: normalizeIdentityInput(event.target.value),
                                          })
                                        }
                                        placeholder="1000"
                                        inputMode="numeric"
                                        maxLength={10}
                                        autoComplete="off"
                                        disabled={isBusy}
                                      />
                                    </Field>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </AdvancedToggleCard>
                    )
                  })}
                </div>
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

