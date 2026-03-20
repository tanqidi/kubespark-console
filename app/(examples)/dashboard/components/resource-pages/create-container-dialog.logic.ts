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
export type LifecycleSectionKey = "postStart" | "preStop"

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

export type ContainerLifecycleActionDraft = {
  mode: ProbeMode
  httpScheme: "HTTP" | "HTTPS"
  httpPath: string
  httpPort: string
  command: string
  tcpPort: string
}

export type ContainerLifecycleMap = Partial<Record<LifecycleSectionKey, ContainerLifecycleActionDraft>>

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
  lifecycle: ContainerLifecycleMap
  securityContext: ContainerSecurityContextDraft
}

export type ContainerExtensionOptionKey =
  | "healthCheck"
  | "lifecycle"
  | "startupCommand"
  | "env"
  | "securityContext"
  | "syncHostTimezone"

export type EnvBatchSource = "configMap" | "secret"

export const CONTAINER_EXTENSION_OPTIONS: Array<{
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

export const HEALTH_CHECK_SECTIONS: Array<{
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

export const LIFECYCLE_SECTIONS: Array<{
  key: LifecycleSectionKey
  title: string
  description: string
}> = [
  {
    key: "postStart",
    title: "启动后动作",
    description: "设置容器启动后需要执行的动作。",
  },
  {
    key: "preStop",
    title: "终止前动作",
    description: "设置容器终止前需要执行的动作。",
  },
]

export type ProbeSectionState = {
  enabled: boolean
  draft: ContainerProbeDraft
}

export type ProbeDraftField = keyof ContainerProbeDraft

export type LifecycleSectionState = {
  enabled: boolean
  draft: ContainerLifecycleActionDraft
}

export type LifecycleDraftField = keyof ContainerLifecycleActionDraft

export function createDefaultProbeDraft(): ContainerProbeDraft {
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

export function createDefaultLifecycleActionDraft(): ContainerLifecycleActionDraft {
  return {
    mode: "http",
    httpScheme: "HTTP",
    httpPath: "/",
    httpPort: "80",
    command: "",
    tcpPort: "80",
  }
}

export function createDefaultProbeState(): Record<ProbeSectionKey, ProbeSectionState> {
  return {
    liveness: { enabled: false, draft: createDefaultProbeDraft() },
    readiness: { enabled: false, draft: createDefaultProbeDraft() },
    startup: { enabled: false, draft: createDefaultProbeDraft() },
  }
}

export function createDefaultLifecycleState(): Record<LifecycleSectionKey, LifecycleSectionState> {
  return {
    postStart: { enabled: false, draft: createDefaultLifecycleActionDraft() },
    preStop: { enabled: false, draft: createDefaultLifecycleActionDraft() },
  }
}

export function createProbeStateFromContainer(
  probes: ContainerProbeMap | undefined
): Record<ProbeSectionKey, ProbeSectionState> {
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

export function createLifecycleStateFromContainer(
  lifecycle: ContainerLifecycleMap | undefined
): Record<LifecycleSectionKey, LifecycleSectionState> {
  const defaults = createDefaultLifecycleState()
  if (!lifecycle) return defaults

  return {
    postStart: {
      enabled: Boolean(lifecycle.postStart),
      draft: lifecycle.postStart
        ? { ...defaults.postStart.draft, ...lifecycle.postStart }
        : defaults.postStart.draft,
    },
    preStop: {
      enabled: Boolean(lifecycle.preStop),
      draft: lifecycle.preStop
        ? { ...defaults.preStop.draft, ...lifecycle.preStop }
        : defaults.preStop.draft,
    },
  }
}

export function buildProbeMapFromState(state: Record<ProbeSectionKey, ProbeSectionState>): ContainerProbeMap {
  return {
    ...(state.liveness.enabled ? { liveness: state.liveness.draft } : {}),
    ...(state.readiness.enabled ? { readiness: state.readiness.draft } : {}),
    ...(state.startup.enabled ? { startup: state.startup.draft } : {}),
  }
}

export function createDefaultProbePopoverOpenState(): Record<ProbeSectionKey, boolean> {
  return {
    liveness: false,
    readiness: false,
    startup: false,
  }
}

export function buildLifecycleMapFromState(
  state: Record<LifecycleSectionKey, LifecycleSectionState>
): ContainerLifecycleMap {
  return {
    ...(state.postStart.enabled ? { postStart: state.postStart.draft } : {}),
    ...(state.preStop.enabled ? { preStop: state.preStop.draft } : {}),
  }
}

export function createDefaultLifecyclePopoverOpenState(): Record<LifecycleSectionKey, boolean> {
  return {
    postStart: false,
    preStop: false,
  }
}

export function createDefaultSecurityContextDraft(): ContainerSecurityContextDraft {
  return {
    privileged: false,
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: false,
    runAsNonRoot: false,
    runAsUser: "",
    runAsGroup: "",
  }
}

export function createDefaultExtensionState(): Record<ContainerExtensionOptionKey, boolean> {
  return {
    healthCheck: false,
    lifecycle: false,
    startupCommand: false,
    env: false,
    securityContext: false,
    syncHostTimezone: false,
  }
}

export function normalizeIdentityInput(value: string): string {
  return value.replace(/\D+/g, "")
}

export function hasEnabledSecurityContext(value: ContainerSecurityContextDraft | undefined): boolean {
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

export function normalizeCpuInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, "")
  if (!sanitized) return ""
  const [integerPart, ...fractionParts] = sanitized.split(".")
  if (fractionParts.length === 0) return integerPart
  return `${integerPart}.${fractionParts.join("")}`
}

export function normalizeMemoryInput(value: string): string {
  return value.replace(/\D+/g, "")
}

export function normalizePortInput(value: string): string {
  const digits = value.replace(/\D+/g, "")
  if (!digits) return ""
  const parsed = Number(digits)
  if (!Number.isFinite(parsed)) return ""
  if (parsed > 65535) return "65535"
  if (parsed < 0) return "0"
  return String(parsed)
}

export function resolveImagePullPolicyDescription(value: "Always" | "IfNotPresent" | "Never"): string {
  if (value === "Always") {
    return "在容器组创建及更新时，每次都尝试拉取新的镜像。"
  }
  if (value === "Never") {
    return "仅使用本地镜像。如果本地不存在所需的镜像，则会导致容器异常。"
  }
  return "如果本地存在所需的镜像，则优先使用本地镜像。"
}

export function resolveProbeSummary(draft: ContainerProbeDraft): string {
  if (draft.mode === "http") {
    const pathValue = draft.httpPath.trim() || "/"
    const normalizedPath = pathValue.startsWith("/") ? pathValue : `/${pathValue}`
    const port = draft.httpPort.trim() || "-"
    return `${draft.httpScheme} ${port}${normalizedPath}`
  }
  if (draft.mode === "tcp") {
    const port = draft.tcpPort.trim() || "-"
    return `TCP ${port}`
  }
  const command = draft.command.trim()
  return command ? `命令：${command}` : "命令探针"
}

export function resolveLifecycleSummary(draft: ContainerLifecycleActionDraft): string {
  if (draft.mode === "http") {
    const pathValue = draft.httpPath.trim() || "/"
    const normalizedPath = pathValue.startsWith("/") ? pathValue : `/${pathValue}`
    const port = draft.httpPort.trim() || "-"
    return `${draft.httpScheme} ${port}${normalizedPath}`
  }
  if (draft.mode === "tcp") {
    const port = draft.tcpPort.trim() || "-"
    return `TCP ${port}`
  }
  const command = draft.command.trim()
  return command ? `命令：${command}` : "命令动作"
}

export function resolveDuplicateEnvNameIds(entries: ContainerEnvVarDraft[]): string[] {
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
