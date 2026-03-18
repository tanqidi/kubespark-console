"use client"

import * as React from "react"
import { IconFileText, IconKey } from "@tabler/icons-react"
import {
  fetchConfigMapKeyRefOptions,
  type ConfigMapKeyRefOption,
} from "@/app/lib/kubespark/configmaps"
import {
  resolveFirstContainerEditorErrorFieldId,
  type ContainerPortFieldErrors,
  scrollAndFocusFieldById,
} from "@/app/lib/kubespark/form-validation"
import {
  fetchSecretKeyRefOptions,
  type SecretKeyRefOption,
} from "@/app/lib/kubespark/secrets"
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
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
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

export type ContainerEnvVarSource = "custom" | "configMap" | "secret"

export type ContainerEnvVarDraft = {
  id: string
  source: ContainerEnvVarSource
  name: string
  value: string
  sourceResource: string
  sourceKey: string
}

export type ProbeSectionKey = "liveness" | "readiness" | "startup"
export type ProbeMode = "http" | "command" | "tcp"

export type ContainerProbeDraft = {
  mode: ProbeMode
  httpScheme: "HTTP" | "HTTPS"
  httpPath: string
  httpPort: string
  command: string
  tcpPort: string
  initialDelaySeconds: string
  timeoutSeconds: string
  periodSeconds: string
  successThreshold: string
  failureThreshold: string
}

export type ContainerProbeMap = Partial<Record<ProbeSectionKey, ContainerProbeDraft>>

export type ContainerSecurityContextDraft = {
  privileged: boolean
  allowPrivilegeEscalation: boolean
  readOnlyRootFilesystem: boolean
  runAsNonRoot: boolean
  runAsUser: string
  runAsGroup: string
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
  env: ContainerEnvVarDraft[]
  probes: ContainerProbeMap
  securityContext: ContainerSecurityContextDraft
}

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
      | "securityContext",
    value: string | boolean | ContainerProbeMap | ContainerSecurityContextDraft
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

type ContainerExtensionOptionKey =
  | "healthCheck"
  | "lifecycle"
  | "startupCommand"
  | "env"
  | "securityContext"
  | "syncHostTimezone"

type EnvBatchSource = "configMap" | "secret"
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

const HEALTH_CHECK_SECTIONS: Array<{
  key: ProbeSectionKey
  title: string
  description: string
}> = [
  {
    key: "liveness",
    title: "存活检查",
    description: "检查容器是否存活。",
  },
  {
    key: "readiness",
    title: "就绪检查",
    description: "检查容器是否可以处理请求。",
  },
  {
    key: "startup",
    title: "启动检查",
    description: "检查容器是否启动成功。",
  },
]

type ProbeSectionState = {
  enabled: boolean
  draft: ContainerProbeDraft
}

type ProbeDraftField = keyof ContainerProbeDraft

function createDefaultProbeDraft(): ContainerProbeDraft {
  return {
    mode: "http",
    httpScheme: "HTTP",
    httpPath: "/",
    httpPort: "80",
    command: "",
    tcpPort: "80",
    initialDelaySeconds: "0",
    timeoutSeconds: "1",
    periodSeconds: "10",
    successThreshold: "1",
    failureThreshold: "3",
  }
}

function createDefaultProbeState(): Record<ProbeSectionKey, ProbeSectionState> {
  return {
    liveness: { enabled: false, draft: createDefaultProbeDraft() },
    readiness: { enabled: false, draft: createDefaultProbeDraft() },
    startup: { enabled: false, draft: createDefaultProbeDraft() },
  }
}

function createProbeStateFromContainer(probes: ContainerProbeMap | undefined): Record<ProbeSectionKey, ProbeSectionState> {
  const defaults = createDefaultProbeState()
  if (!probes) return defaults

  return {
    liveness: {
      enabled: Boolean(probes.liveness),
      draft: probes.liveness ? { ...defaults.liveness.draft, ...probes.liveness } : defaults.liveness.draft,
    },
    readiness: {
      enabled: Boolean(probes.readiness),
      draft: probes.readiness ? { ...defaults.readiness.draft, ...probes.readiness } : defaults.readiness.draft,
    },
    startup: {
      enabled: Boolean(probes.startup),
      draft: probes.startup ? { ...defaults.startup.draft, ...probes.startup } : defaults.startup.draft,
    },
  }
}

function buildProbeMapFromState(state: Record<ProbeSectionKey, ProbeSectionState>): ContainerProbeMap {
  return {
    ...(state.liveness.enabled ? { liveness: state.liveness.draft } : {}),
    ...(state.readiness.enabled ? { readiness: state.readiness.draft } : {}),
    ...(state.startup.enabled ? { startup: state.startup.draft } : {}),
  }
}

function createDefaultProbePopoverOpenState(): Record<ProbeSectionKey, boolean> {
  return {
    liveness: false,
    readiness: false,
    startup: false,
  }
}

function createDefaultSecurityContextDraft(): ContainerSecurityContextDraft {
  return {
    privileged: false,
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: false,
    runAsNonRoot: false,
    runAsUser: "",
    runAsGroup: "",
  }
}

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

function normalizeIdentityInput(value: string): string {
  return value.replace(/\D+/g, "")
}

function hasEnabledSecurityContext(value: ContainerSecurityContextDraft | undefined): boolean {
  if (!value) return false
  return (
    value.privileged ||
    value.allowPrivilegeEscalation ||
    value.readOnlyRootFilesystem ||
    value.runAsNonRoot ||
    value.runAsUser.trim().length > 0 ||
    value.runAsGroup.trim().length > 0
  )
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

function resolveProbeSummary(draft: ContainerProbeDraft): string {
  if (draft.mode === "http") {
    const path = draft.httpPath.trim() || "/"
    const port = draft.httpPort.trim() || "-"
    return `${draft.httpScheme} ${path}:${port}`
  }
  if (draft.mode === "tcp") {
    const port = draft.tcpPort.trim() || "-"
    return `TCP ${port}`
  }
  const command = draft.command.trim()
  return command ? `命令：${command}` : "命令探针"
}

function resolveDuplicateEnvNameIds(entries: ContainerEnvVarDraft[]): string[] {
  const grouped = new Map<string, string[]>()
  entries.forEach((entry) => {
    const key = entry.name.trim().toLowerCase()
    if (!key) return
    const ids = grouped.get(key) ?? []
    ids.push(entry.id)
    grouped.set(key, ids)
  })
  return Array.from(grouped.values())
    .filter((ids) => ids.length > 1)
    .flat()
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
  const [configMapKeyRefOptions, setConfigMapKeyRefOptions] = React.useState<ConfigMapKeyRefOption[]>([])
  const [secretKeyRefOptions, setSecretKeyRefOptions] = React.useState<SecretKeyRefOption[]>([])
  const [envBatchPopoverOpen, setEnvBatchPopoverOpen] = React.useState(false)
  const [probeState, setProbeState] = React.useState<Record<ProbeSectionKey, ProbeSectionState>>(
    createDefaultProbeState
  )
  const [probePopoverOpen, setProbePopoverOpen] = React.useState<Record<ProbeSectionKey, boolean>>(
    createDefaultProbePopoverOpenState
  )
  const [envBatchSource, setEnvBatchSource] = React.useState<EnvBatchSource>("configMap")
  const [envBatchResourceName, setEnvBatchResourceName] = React.useState("")
  const [envBatchSelectedKeys, setEnvBatchSelectedKeys] = React.useState<string[]>([])
  const [extensionState, setExtensionState] = React.useState<Record<ContainerExtensionOptionKey, boolean>>(
    createDefaultExtensionState
  )
  const extensionStateContainerIdRef = React.useRef<string | null>(null)
  const containerId = container?.id ?? null
  const syncHostTimezoneEnabled = container?.syncHostTimezone ?? false
  const startupCommandEnabled = (container?.command.trim().length ?? 0) > 0 || (container?.args.trim().length ?? 0) > 0
  const envEnabled = (container?.env.length ?? 0) > 0
  const securityContextEnabled = React.useMemo(
    () => hasEnabledSecurityContext(container?.securityContext),
    [container?.securityContext]
  )
  const securityContextDraft = React.useMemo(
    () => container?.securityContext ?? createDefaultSecurityContextDraft(),
    [container?.securityContext]
  )
  const probeEnabled = React.useMemo(() => {
    const probes = container?.probes
    if (!probes) return false
    return Boolean(probes.liveness || probes.readiness || probes.startup)
  }, [container?.probes])
  const envBatchResources = envBatchSource === "configMap" ? configMapKeyRefOptions : secretKeyRefOptions
  const envBatchCurrentResource = React.useMemo(
    () => envBatchResources.find((item) => item.name === envBatchResourceName),
    [envBatchResources, envBatchResourceName]
  )
  const envBatchKeys = React.useMemo(
    () => envBatchCurrentResource?.keys ?? [],
    [envBatchCurrentResource]
  )
  const envBatchKeySet = React.useMemo(() => new Set(envBatchSelectedKeys), [envBatchSelectedKeys])
  const envBatchAllChecked = envBatchKeys.length > 0 && envBatchSelectedKeys.length === envBatchKeys.length
  const probeDraftSnapshotRef = React.useRef<Record<ProbeSectionKey, ContainerProbeDraft>>({
    liveness: createDefaultProbeDraft(),
    readiness: createDefaultProbeDraft(),
    startup: createDefaultProbeDraft(),
  })
  const localDuplicateEnvIds = React.useMemo(
    () => resolveDuplicateEnvNameIds(container?.env ?? []),
    [container?.env]
  )
  const envDuplicateIdSet = React.useMemo(
    () => new Set([...envDuplicateIds, ...localDuplicateEnvIds]),
    [envDuplicateIds, localDuplicateEnvIds]
  )

  const updateProbeDraft = React.useCallback(
    (section: ProbeSectionKey, field: ProbeDraftField, value: string | ProbeMode | "HTTP" | "HTTPS") => {
      setProbeState((current) => ({
        ...current,
        [section]: {
          ...current[section],
          draft: {
            ...current[section].draft,
            [field]: value,
          },
        },
      }))
    },
    []
  )

  const handleProbePopoverOpenChange = React.useCallback(
    (section: ProbeSectionKey, nextOpen: boolean) => {
      if (nextOpen) {
        probeDraftSnapshotRef.current[section] = { ...probeState[section].draft }
      }
      setProbePopoverOpen((current) => ({
        ...current,
        [section]: nextOpen,
      }))
    },
    [probeState]
  )

  const cancelProbeEdit = React.useCallback((section: ProbeSectionKey) => {
    setProbeState((current) => ({
      ...current,
      [section]: {
        ...current[section],
        draft: { ...probeDraftSnapshotRef.current[section] },
      },
    }))
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [])

  const confirmProbeEdit = React.useCallback((section: ProbeSectionKey) => {
    setProbeState((current) => {
      const next = {
        ...current,
        [section]: {
          ...current[section],
          enabled: true,
        },
      }
      onChange("probes", buildProbeMapFromState(next))
      return next
    })
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange])

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
    const isContainerChanged = extensionStateContainerIdRef.current !== containerId
    extensionStateContainerIdRef.current = containerId
    setExtensionState((current) => ({
      ...createDefaultExtensionState(),
      healthCheck: probeEnabled,
      startupCommand: startupCommandEnabled,
      env: envEnabled,
      securityContext: isContainerChanged
        ? securityContextEnabled
        : current.securityContext || securityContextEnabled,
      syncHostTimezone: syncHostTimezoneEnabled,
    }))
    setProbeState(createProbeStateFromContainer(container?.probes))
    setProbePopoverOpen(createDefaultProbePopoverOpenState())
  }, [
    containerId,
    envEnabled,
    probeEnabled,
    securityContextEnabled,
    startupCommandEnabled,
    syncHostTimezoneEnabled,
    container?.probes,
  ])

  React.useEffect(() => {
    if (!open) return
    const ns = namespace.trim()
    if (!ns) {
      setConfigMapKeyRefOptions([])
      setSecretKeyRefOptions([])
      return
    }

    let cancelled = false

    void Promise.all([
      fetchConfigMapKeyRefOptions(ns),
      fetchSecretKeyRefOptions(ns),
    ])
      .then(([configMapOptions, secretOptions]) => {
        if (cancelled) return
        setConfigMapKeyRefOptions(configMapOptions)
        setSecretKeyRefOptions(secretOptions)
      })
      .catch(() => {
        if (cancelled) return
        setConfigMapKeyRefOptions([])
        setSecretKeyRefOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [open, namespace])

  React.useEffect(() => {
    if (!open) {
      extensionStateContainerIdRef.current = null
      setEnvBatchPopoverOpen(false)
      setEnvBatchSelectedKeys([])
      return
    }
    if (configMapKeyRefOptions.length > 0) {
      setEnvBatchSource("configMap")
      setEnvBatchResourceName(configMapKeyRefOptions[0]?.name ?? "")
      return
    }
    if (secretKeyRefOptions.length > 0) {
      setEnvBatchSource("secret")
      setEnvBatchResourceName(secretKeyRefOptions[0]?.name ?? "")
      return
    }
    setEnvBatchResourceName("")
  }, [open, configMapKeyRefOptions, secretKeyRefOptions])

  React.useEffect(() => {
    if (!envBatchPopoverOpen) return
    if (envBatchResources.length === 0) {
      setEnvBatchResourceName("")
      setEnvBatchSelectedKeys([])
      return
    }
    if (!envBatchResources.some((item) => item.name === envBatchResourceName)) {
      setEnvBatchResourceName(envBatchResources[0]?.name ?? "")
      setEnvBatchSelectedKeys([])
    }
  }, [envBatchPopoverOpen, envBatchResources, envBatchResourceName])

  React.useEffect(() => {
    setEnvBatchSelectedKeys((current) => current.filter((key) => envBatchKeys.includes(key)))
  }, [envBatchKeys])

  const toggleEnvBatchKey = React.useCallback((key: string, checked: boolean) => {
    setEnvBatchSelectedKeys((current) => {
      if (checked) {
        if (current.includes(key)) return current
        return [...current, key]
      }
      return current.filter((item) => item !== key)
    })
  }, [])

  const confirmEnvBatchImport = React.useCallback(() => {
    if (!envBatchResourceName.trim() || envBatchSelectedKeys.length === 0) return
    envBatchSelectedKeys.forEach((keyName) => {
      onAddEnv({
        source: envBatchSource,
        name: keyName,
        sourceResource: envBatchResourceName,
        sourceKey: keyName,
        value: "",
      })
    })
    setEnvBatchPopoverOpen(false)
    setEnvBatchSelectedKeys([])
  }, [envBatchResourceName, envBatchSelectedKeys, onAddEnv, envBatchSource])

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
                            } else if (option.key === "securityContext" && !nextValue) {
                              onChange("securityContext", createDefaultSecurityContextDraft())
                            } else if (option.key === "healthCheck" && !nextValue) {
                              setProbeState(createDefaultProbeState())
                              setProbePopoverOpen(createDefaultProbePopoverOpenState())
                              onChange("probes", {})
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
                          <div className="basis-full rounded-md bg-muted/60 p-4">
                            <div className="flex flex-col gap-6">
                              {HEALTH_CHECK_SECTIONS.map((section) => {
                                const sectionState = probeState[section.key]
                                const draft = sectionState.draft
                                const isOpen = probePopoverOpen[section.key]
                                return (
                                  <div key={section.key} className="flex flex-col gap-2">
                                    <p className="text-sm text-foreground">{section.title}</p>
                                    <Popover
                                      open={isOpen}
                                      onOpenChange={(nextOpen) =>
                                        handleProbePopoverOpenChange(section.key, nextOpen)
                                      }
                                    >
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          className={cn(
                                            "w-full cursor-pointer rounded-md border border-dashed bg-background px-4 py-3 text-left text-sm transition-colors hover:border-muted-foreground/40 hover:bg-muted/40",
                                            sectionState.enabled && "border-primary/40"
                                          )}
                                          disabled={isBusy}
                                        >
                                          {sectionState.enabled ? resolveProbeSummary(draft) : "添加探针"}
                                        </button>
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
                                    <p className="text-sm text-muted-foreground">{section.description}</p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : null}

                        {option.key === "env" && checked ? (
                          <div className="basis-full rounded-md bg-muted/60 p-4">
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
                          <div className="basis-full rounded-md bg-muted/60 p-4">
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
