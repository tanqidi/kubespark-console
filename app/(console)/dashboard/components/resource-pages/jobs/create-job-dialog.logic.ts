"use client"

import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"
import type { JobCreateKind } from "@/app/lib/kubespark/jobs"
import type {
  ContainerDraft,
  ContainerEnvVarSource,
  ContainerLifecycleActionDraft,
  ContainerLifecycleMap,
  ContainerPortDraft,
  ContainerPortProtocol,
  ContainerProbeDraft,
  ContainerProbeMap,
  ContainerSecurityContextDraft,
  ContainerType,
} from "@/app/(console)/dashboard/components/resource-pages/create-container-dialog.logic"
import type { ContainerPortFieldErrors } from "@/app/lib/kubespark/form-validation"
import { createRuntimeId } from "@/app/lib/kubespark/id"
import { parse, stringify } from "yaml"
import {
  applyStorageToVolumesAndMounts,
  parseStorageListFromPodSpec,
} from "@/app/(console)/dashboard/components/resource-pages/pod-storage-utils"
export type NamespaceOption = {
  id: string
  name: string
}

export type JsonObject = Record<string, unknown>
export type LifecycleActionPayload = {
  mode?: "http" | "command" | "tcp"
  httpScheme?: "HTTP" | "HTTPS"
  httpPath?: string
  httpPort?: string
  command?: string
  tcpPort?: string
}

export type LifecycleMapPayload = {
  postStart?: LifecycleActionPayload
  preStop?: LifecycleActionPayload
}

export const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

export const MONACO_OPTIONS: EditorProps["options"] = {
  automaticLayout: true,
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  stickyScroll: { enabled: false },
  tabSize: 2,
  wordWrap: "on",
}

export type JobDialogInitialValues = {
  name: string
  namespace: string
  description?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  schedule?: string
  strategy?: {
    backoffLimit?: string
    completions?: string
    parallelism?: string
    activeDeadlineSeconds?: string
  }
  pod?: {
    restartPolicy?: "Never" | "OnFailure"
    configList?: JobConfigInput[]
    storageList?: Array<{
      volumeId?: string
      volumeKind?: "persistent" | "ephemeral" | "hostPath"
      volumeName?: string
      mounts?: Array<{
        containerName: string
        mountMode: "none" | "ro" | "rw"
        mountPath: string
      }>
    }>
    storage?: {
      volumeId?: string
      volumeKind?: "persistent" | "ephemeral" | "hostPath"
      volumeName?: string
      mounts?: Array<{
        containerName: string
        mountMode: "none" | "ro" | "rw"
        mountPath: string
      }>
    }
    containers?: Array<{
      name?: string
      type?: ContainerType
      image: string
      imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
      command?: string[]
      args?: string[]
      syncHostTimezone?: boolean
      env?: Array<{
        name?: string
        value?: string
        valueFrom?: {
          configMapKeyRef?: {
            name?: string
            key?: string
          }
          secretKeyRef?: {
            name?: string
            key?: string
          }
        }
      }>
      ports?: Array<{
        protocol?: ContainerPortProtocol
        name?: string
        containerPort: string
      }>
      cpuRequest?: string
      cpuLimit?: string
      memoryRequestMi?: string
      memoryLimitMi?: string
      securityContext?: {
        privileged?: boolean
        runAsUser?: string
        runAsGroup?: string
        runAsNonRoot?: boolean
        readOnlyRootFilesystem?: boolean
        allowPrivilegeEscalation?: boolean
      }
      probes?: {
        liveness?: {
          mode?: "http" | "command" | "tcp"
          httpScheme?: "HTTP" | "HTTPS"
          httpPath?: string
          httpPort?: string
          command?: string
          tcpPort?: string
          initialDelaySeconds?: string
          timeoutSeconds?: string
          periodSeconds?: string
          successThreshold?: string
          failureThreshold?: string
        }
        readiness?: {
          mode?: "http" | "command" | "tcp"
          httpScheme?: "HTTP" | "HTTPS"
          httpPath?: string
          httpPort?: string
          command?: string
          tcpPort?: string
          initialDelaySeconds?: string
          timeoutSeconds?: string
          periodSeconds?: string
          successThreshold?: string
          failureThreshold?: string
        }
        startup?: {
          mode?: "http" | "command" | "tcp"
          httpScheme?: "HTTP" | "HTTPS"
          httpPath?: string
          httpPort?: string
          command?: string
          tcpPort?: string
          initialDelaySeconds?: string
          timeoutSeconds?: string
          periodSeconds?: string
          successThreshold?: string
          failureThreshold?: string
        }
      }
      lifecycle?: LifecycleMapPayload
    }>
  }
}

export type CreateJobDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: JobCreateKind
  namespaceOptions: NamespaceOption[]
  mode?: "create" | "edit"
  initialValues?: JobDialogInitialValues | null
  onSubmit: (payload: {
    kind: JobCreateKind
    name: string
    namespace: string
    description: string
    labels?: Record<string, string>
    annotations?: Record<string, string>
    schedule?: string
    strategy?: {
      backoffLimit?: number
      completions?: number
      parallelism?: number
      activeDeadlineSeconds?: number
    }
    pod?: {
      restartPolicy?: "Never" | "OnFailure"
      configList?: JobConfigInput[]
      storageList?: Array<{
        volumeId?: string
        volumeKind?: "persistent" | "ephemeral" | "hostPath"
        volumeName?: string
        mounts?: Array<{
          containerName: string
          mountMode: "none" | "ro" | "rw"
          mountPath: string
        }>
      }>
      storage?: {
        volumeId?: string
        volumeKind?: "persistent" | "ephemeral" | "hostPath"
        volumeName?: string
        mounts?: Array<{
          containerName: string
          mountMode: "none" | "ro" | "rw"
          mountPath: string
        }>
      }
      containers?: Array<{
        name?: string
        type?: ContainerType
        image: string
        imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
        command?: string[]
        args?: string[]
        syncHostTimezone?: boolean
        env?: Array<{
          name?: string
          value?: string
          valueFrom?: {
            configMapKeyRef?: {
              name?: string
              key?: string
            }
            secretKeyRef?: {
              name?: string
              key?: string
            }
          }
        }>
        ports?: Array<{
          protocol?: ContainerPortProtocol
          name?: string
          containerPort: string
        }>
        cpuRequest?: string
        cpuLimit?: string
        memoryRequestMi?: string
        memoryLimitMi?: string
        securityContext?: {
          privileged?: boolean
          runAsUser?: string
          runAsGroup?: string
          runAsNonRoot?: boolean
          readOnlyRootFilesystem?: boolean
          allowPrivilegeEscalation?: boolean
        }
        probes?: {
          liveness?: {
            mode?: "http" | "command" | "tcp"
            httpScheme?: "HTTP" | "HTTPS"
            httpPath?: string
            httpPort?: string
            command?: string
            tcpPort?: string
            initialDelaySeconds?: string
            timeoutSeconds?: string
            periodSeconds?: string
            successThreshold?: string
            failureThreshold?: string
          }
          readiness?: {
            mode?: "http" | "command" | "tcp"
            httpScheme?: "HTTP" | "HTTPS"
            httpPath?: string
            httpPort?: string
            command?: string
            tcpPort?: string
            initialDelaySeconds?: string
            timeoutSeconds?: string
            periodSeconds?: string
            successThreshold?: string
            failureThreshold?: string
          }
          startup?: {
            mode?: "http" | "command" | "tcp"
            httpScheme?: "HTTP" | "HTTPS"
            httpPath?: string
            httpPort?: string
            command?: string
            tcpPort?: string
            initialDelaySeconds?: string
            timeoutSeconds?: string
            periodSeconds?: string
            successThreshold?: string
            failureThreshold?: string
          }
        }
        lifecycle?: LifecycleMapPayload
      }>
    }
  }) => Promise<void>
}

export type CreateStep = "basic" | "strategy" | "pod" | "storage" | "advanced"
export const CONTAINER_PORT_PROTOCOL_OPTIONS = [
  "TCP",
  "UDP",
  "SCTP",
] as const

export const CONTAINER_PORT_PROTOCOL_SET = new Set<string>(CONTAINER_PORT_PROTOCOL_OPTIONS)

export const AUTO_PROTOCOL_PREFIX_SET = new Set([
  "tcp",
  "udp",
  "sctp",
])

export const STEP_ORDER: CreateStep[] = ["basic", "strategy", "pod", "storage", "advanced"]

export const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"
export const POD_REQUIRED_MESSAGE = "请至少添加一个容器配置后再进入下一步"
export const DEFAULT_CRON_SCHEDULE = "0 0 1 * *"
export const CRON_SCHEDULE_REQUIRED_MESSAGE = "请输入定时计划"

export type JobDialogSnapshot = {
  name: string
  namespace: string
  description: string
  labels: Record<string, string>
  annotations: Record<string, string>
  schedule: string
  strategy: {
    backoffLimit: string
    completions: string
    parallelism: string
    activeDeadlineSeconds: string
  }
  pod: {
    restartPolicy: "Never" | "OnFailure"
    containers: ContainerDraft[]
    storageList?: JobStorageInput[]
    configList?: JobConfigInput[]
  }
}

export type JobStorageInput = {
  volumeId?: string
  volumeKind?: "persistent" | "ephemeral" | "hostPath"
  volumeName?: string
  mounts?: Array<{
    containerName: string
    mountMode: "none" | "ro" | "rw"
    mountPath: string
  }>
}

export type JobConfigInput = {
  sourceKind?: "configMap" | "secret"
  sourceName?: string
  mounts?: Array<{
    containerName: string
    mountMode: "none" | "ro"
    mountPath: string
  }>
}

export function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export function toOptionalPortProtocol(value: unknown): ContainerPortProtocol | undefined {
  const normalized = asString(value).trim().toUpperCase()
  return CONTAINER_PORT_PROTOCOL_SET.has(normalized)
    ? (normalized as ContainerPortProtocol)
    : undefined
}

export function toOptionalIntegerString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value))
  }
  const text = asString(value).trim()
  return /^\d+$/.test(text) ? text : ""
}

export function toMemoryMiText(value: unknown): string {
  const raw = asString(value).trim()
  if (!raw) return ""
  const miMatch = raw.match(/^(\d+)mi$/i)
  if (miMatch?.[1]) return miMatch[1]
  return /^\d+$/.test(raw) ? raw : ""
}

export function toDnsLabelFragment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/\.+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized.slice(0, 63)
}

export function resolveContainerNameFromImage(image: string): string {
  const raw = image.trim()
  if (!raw) return ""
  const withoutDigest = raw.includes("@") ? raw.split("@")[0] ?? raw : raw
  const lastSegment = withoutDigest.split("/").filter(Boolean).pop() ?? withoutDigest
  const tagIndex = lastSegment.lastIndexOf(":")
  const withoutTag = tagIndex > 0 ? lastSegment.slice(0, tagIndex) : lastSegment
  return toDnsLabelFragment(withoutTag)
}

export function ensureUniqueContainerName(baseName: string, usedNames: Set<string>): string {
  const normalizedBase = toDnsLabelFragment(baseName) || "container"
  if (!usedNames.has(normalizedBase)) {
    usedNames.add(normalizedBase)
    return normalizedBase
  }

  let suffix = 2
  while (true) {
    const suffixText = `-${suffix}`
    const maxBaseLength = Math.max(1, 63 - suffixText.length)
    const trimmedBase = normalizedBase.slice(0, maxBaseLength).replace(/-+$/g, "") || "container"
    const candidate = `${trimmedBase}${suffixText}`
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate)
      return candidate
    }
    suffix += 1
  }
}

export function isAutoContainerNameForImage(name: string, image: string): boolean {
  const normalizedName = toDnsLabelFragment(name)
  const base = resolveContainerNameFromImage(image)
  if (!normalizedName || !base) return false
  if (normalizedName === base) return true
  if (!normalizedName.startsWith(`${base}-`)) return false
  const suffix = normalizedName.slice(base.length + 1)
  return /^\d+$/.test(suffix) && Number(suffix) >= 2
}

export function resolveContainerName(name: string, image: string, index: number, usedNames?: Set<string>): string {
  const typed = toDnsLabelFragment(name)
  const fallback = `container-${index + 1}`
  const baseName = typed || resolveContainerNameFromImage(image) || fallback
  if (!usedNames) return baseName
  return ensureUniqueContainerName(baseName, usedNames)
}

export function formatStringListAsEditorText(value: unknown): string {
  if (typeof value === "string") {
    const text = value.trim()
    return text.length > 0 ? text : ""
  }
  if (!Array.isArray(value)) return ""
  const list = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
  return list.length > 0 ? list.join(",") : ""
}

export function parseEditorTextToStringList(value: string): string[] {
  const text = value.trim()
  if (!text) return []
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter((item) => item.length > 0)
      }
    } catch {
      // fallback to plain split mode below
    }
  }
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

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

export function toProbeMode(value: unknown): "http" | "command" | "tcp" {
  const text = asString(value).trim().toLowerCase()
  if (text === "command" || text === "tcp" || text === "http") return text
  return "http"
}

export function toProbeScheme(value: unknown): "HTTP" | "HTTPS" {
  return asString(value).trim().toUpperCase() === "HTTPS" ? "HTTPS" : "HTTP"
}

export function toProbePortText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535) {
    return String(Math.trunc(value))
  }
  return toOptionalIntegerString(value)
}

export function parseProbeDraftFromSpec(raw: unknown): ContainerProbeDraft | null {
  const spec = asObject(raw)
  if (Object.keys(spec).length === 0) return null

  const defaults = createDefaultProbeDraft()
  const httpGet = asObject(spec.httpGet)
  const tcpSocket = asObject(spec.tcpSocket)
  const exec = asObject(spec.exec)
  const execCommand = formatStringListAsEditorText(exec.command)

  let mode: "http" | "command" | "tcp" = "http"
  if (execCommand) {
    mode = "command"
  } else if (Object.keys(tcpSocket).length > 0) {
    mode = "tcp"
  }

  return {
    mode,
    httpScheme: toProbeScheme(httpGet.scheme),
    httpPath: asString(httpGet.path).trim() || defaults.httpPath,
    httpPort: toProbePortText(httpGet.port) || defaults.httpPort,
    command: execCommand,
    tcpPort: toProbePortText(tcpSocket.port) || defaults.tcpPort,
    initialDelaySeconds: toOptionalIntegerString(spec.initialDelaySeconds) || defaults.initialDelaySeconds,
    timeoutSeconds: toOptionalIntegerString(spec.timeoutSeconds) || defaults.timeoutSeconds,
    periodSeconds: toOptionalIntegerString(spec.periodSeconds) || defaults.periodSeconds,
    successThreshold: toOptionalIntegerString(spec.successThreshold) || defaults.successThreshold,
    failureThreshold: toOptionalIntegerString(spec.failureThreshold) || defaults.failureThreshold,
  }
}

export function parseProbeMapFromContainerSpec(container: JsonObject): ContainerProbeMap {
  const liveness = parseProbeDraftFromSpec(container.livenessProbe)
  const readiness = parseProbeDraftFromSpec(container.readinessProbe)
  const startup = parseProbeDraftFromSpec(container.startupProbe)

  return {
    ...(liveness ? { liveness } : {}),
    ...(readiness ? { readiness } : {}),
    ...(startup ? { startup } : {}),
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

export function parseLifecycleActionFromSpec(raw: unknown): ContainerLifecycleActionDraft | null {
  const spec = asObject(raw)
  if (Object.keys(spec).length === 0) return null

  const defaults = createDefaultLifecycleActionDraft()
  const httpGet = asObject(spec.httpGet)
  const tcpSocket = asObject(spec.tcpSocket)
  const exec = asObject(spec.exec)
  const execCommand = formatStringListAsEditorText(exec.command)

  let mode: "http" | "command" | "tcp" = "http"
  if (execCommand) {
    mode = "command"
  } else if (Object.keys(tcpSocket).length > 0) {
    mode = "tcp"
  }

  return {
    mode,
    httpScheme: toProbeScheme(httpGet.scheme),
    httpPath: asString(httpGet.path).trim() || defaults.httpPath,
    httpPort: toProbePortText(httpGet.port) || defaults.httpPort,
    command: execCommand,
    tcpPort: toProbePortText(tcpSocket.port) || defaults.tcpPort,
  }
}

export function parseLifecycleMapFromContainerSpec(container: JsonObject): ContainerLifecycleMap {
  const lifecycle = asObject(container.lifecycle)
  const postStart = parseLifecycleActionFromSpec(lifecycle.postStart)
  const preStop = parseLifecycleActionFromSpec(lifecycle.preStop)

  return {
    ...(postStart ? { postStart } : {}),
    ...(preStop ? { preStop } : {}),
  }
}

export function buildProbeSpecFromDraft(draft: ContainerProbeDraft): JsonObject | null {
  const mode = toProbeMode(draft.mode)
  const initialDelaySeconds = toOptionalIntegerString(draft.initialDelaySeconds)
  const timeoutSeconds = toOptionalIntegerString(draft.timeoutSeconds)
  const periodSeconds = toOptionalIntegerString(draft.periodSeconds)
  const successThreshold = toOptionalIntegerString(draft.successThreshold)
  const failureThreshold = toOptionalIntegerString(draft.failureThreshold)

  const modeSpec: JsonObject | null =
    mode === "command"
      ? (() => {
          const command = parseEditorTextToStringList(draft.command)
          if (command.length === 0) return null
          return { exec: { command } }
        })()
      : mode === "tcp"
        ? (() => {
            const tcpPort = toOptionalIntegerString(draft.tcpPort)
            if (!tcpPort) return null
            return { tcpSocket: { port: Number.parseInt(tcpPort, 10) } }
          })()
        : (() => {
            const httpPort = toOptionalIntegerString(draft.httpPort)
            if (!httpPort) return null
            return {
              httpGet: {
                scheme: toProbeScheme(draft.httpScheme),
                path: draft.httpPath.trim() || "/",
                port: Number.parseInt(httpPort, 10),
              },
            }
          })()

  if (!modeSpec) return null

  return {
    ...modeSpec,
    ...(initialDelaySeconds ? { initialDelaySeconds: Number.parseInt(initialDelaySeconds, 10) } : {}),
    ...(timeoutSeconds ? { timeoutSeconds: Number.parseInt(timeoutSeconds, 10) } : {}),
    ...(periodSeconds ? { periodSeconds: Number.parseInt(periodSeconds, 10) } : {}),
    ...(successThreshold ? { successThreshold: Number.parseInt(successThreshold, 10) } : {}),
    ...(failureThreshold ? { failureThreshold: Number.parseInt(failureThreshold, 10) } : {}),
  }
}

export function buildProbeSpecMap(
  probes: ContainerProbeMap | undefined
): {
  livenessProbe?: JsonObject
  readinessProbe?: JsonObject
  startupProbe?: JsonObject
} {
  const liveness = probes?.liveness ? buildProbeSpecFromDraft(probes.liveness) : null
  const readiness = probes?.readiness ? buildProbeSpecFromDraft(probes.readiness) : null
  const startup = probes?.startup ? buildProbeSpecFromDraft(probes.startup) : null

  return {
    ...(liveness ? { livenessProbe: liveness } : {}),
    ...(readiness ? { readinessProbe: readiness } : {}),
    ...(startup ? { startupProbe: startup } : {}),
  }
}

export function buildLifecycleActionSpecFromDraft(
  draft: ContainerLifecycleActionDraft
): JsonObject | null {
  const mode = toProbeMode(draft.mode)
  if (mode === "command") {
    const command = parseEditorTextToStringList(draft.command)
    if (command.length === 0) return null
    return { exec: { command } }
  }

  if (mode === "tcp") {
    const tcpPort = toOptionalIntegerString(draft.tcpPort)
    if (!tcpPort) return null
    return { tcpSocket: { port: Number.parseInt(tcpPort, 10) } }
  }

  const httpPort = toOptionalIntegerString(draft.httpPort)
  if (!httpPort) return null
  return {
    httpGet: {
      scheme: toProbeScheme(draft.httpScheme),
      path: draft.httpPath.trim() || "/",
      port: Number.parseInt(httpPort, 10),
    },
  }
}

export function buildLifecycleSpecMap(lifecycle: ContainerLifecycleMap | undefined): { lifecycle?: JsonObject } {
  const postStart = lifecycle?.postStart ? buildLifecycleActionSpecFromDraft(lifecycle.postStart) : null
  const preStop = lifecycle?.preStop ? buildLifecycleActionSpecFromDraft(lifecycle.preStop) : null
  const lifecycleSpec: JsonObject = {
    ...(postStart ? { postStart } : {}),
    ...(preStop ? { preStop } : {}),
  }
  return Object.keys(lifecycleSpec).length > 0 ? { lifecycle: lifecycleSpec } : {}
}

export function normalizeProbeDraft(draft: ContainerProbeDraft): ContainerProbeDraft {
  return {
    mode: toProbeMode(draft.mode),
    httpScheme: toProbeScheme(draft.httpScheme),
    httpPath: draft.httpPath.trim() || "/",
    httpPort: toOptionalIntegerString(draft.httpPort),
    command: draft.command.trim(),
    tcpPort: toOptionalIntegerString(draft.tcpPort),
    initialDelaySeconds: toOptionalIntegerString(draft.initialDelaySeconds),
    timeoutSeconds: toOptionalIntegerString(draft.timeoutSeconds),
    periodSeconds: toOptionalIntegerString(draft.periodSeconds),
    successThreshold: toOptionalIntegerString(draft.successThreshold),
    failureThreshold: toOptionalIntegerString(draft.failureThreshold),
  }
}

export function normalizeProbeMap(probes: ContainerProbeMap | undefined): ContainerProbeMap {
  if (!probes) return {}
  return {
    ...(probes.liveness ? { liveness: normalizeProbeDraft(probes.liveness) } : {}),
    ...(probes.readiness ? { readiness: normalizeProbeDraft(probes.readiness) } : {}),
    ...(probes.startup ? { startup: normalizeProbeDraft(probes.startup) } : {}),
  }
}

export function normalizeLifecycleActionDraft(
  draft: ContainerLifecycleActionDraft
): ContainerLifecycleActionDraft {
  return {
    mode: toProbeMode(draft.mode),
    httpScheme: toProbeScheme(draft.httpScheme),
    httpPath: draft.httpPath.trim() || "/",
    httpPort: toOptionalIntegerString(draft.httpPort),
    command: draft.command.trim(),
    tcpPort: toOptionalIntegerString(draft.tcpPort),
  }
}

export function normalizeLifecycleMap(lifecycle: ContainerLifecycleMap | undefined): ContainerLifecycleMap {
  if (!lifecycle) return {}
  return {
    ...(lifecycle.postStart ? { postStart: normalizeLifecycleActionDraft(lifecycle.postStart) } : {}),
    ...(lifecycle.preStop ? { preStop: normalizeLifecycleActionDraft(lifecycle.preStop) } : {}),
  }
}

export function normalizeSecurityContextDraft(value: unknown): ContainerSecurityContextDraft {
  const source = asObject(value)
  return {
    privileged: source.privileged === true,
    allowPrivilegeEscalation: source.allowPrivilegeEscalation === true,
    readOnlyRootFilesystem: source.readOnlyRootFilesystem === true,
    runAsNonRoot: source.runAsNonRoot === true,
    runAsUser: toOptionalIntegerString(source.runAsUser),
    runAsGroup: toOptionalIntegerString(source.runAsGroup),
  }
}

export function hasSecurityContextValue(value: ContainerSecurityContextDraft | undefined): boolean {
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

export function buildSecurityContextSpecFromDraft(
  draft: ContainerSecurityContextDraft | undefined
): JsonObject | null {
  if (!draft) return null
  const runAsUser = toOptionalIntegerString(draft.runAsUser)
  const runAsGroup = toOptionalIntegerString(draft.runAsGroup)
  const spec: JsonObject = {
    ...(draft.privileged ? { privileged: true } : {}),
    ...(draft.allowPrivilegeEscalation ? { allowPrivilegeEscalation: true } : {}),
    ...(draft.readOnlyRootFilesystem ? { readOnlyRootFilesystem: true } : {}),
    ...(draft.runAsNonRoot ? { runAsNonRoot: true } : {}),
    ...(runAsUser ? { runAsUser: Number.parseInt(runAsUser, 10) } : {}),
    ...(runAsGroup ? { runAsGroup: Number.parseInt(runAsGroup, 10) } : {}),
  }
  return Object.keys(spec).length > 0 ? spec : null
}

export function createContainerDraftFromInitial(
  value: NonNullable<NonNullable<JobDialogInitialValues["pod"]>["containers"]>[number],
  index: number
): ContainerDraft {
  const env = (Array.isArray(value.env) ? value.env : [])
    .map((item) => {
      const name = asString(item.name)
      const valueFrom = asObject(item.valueFrom)
      const configMapKeyRef = asObject(valueFrom.configMapKeyRef)
      const secretKeyRef = asObject(valueFrom.secretKeyRef)
      const configMapName = asString(configMapKeyRef.name).trim()
      const configMapKey = asString(configMapKeyRef.key).trim()
      const secretName = asString(secretKeyRef.name).trim()
      const secretKey = asString(secretKeyRef.key).trim()

      if (configMapName && configMapKey) {
        return createContainerEnvDraft({
          source: "configMap",
          name: name.trim() || configMapKey,
          sourceResource: configMapName,
          sourceKey: configMapKey,
        })
      }
      if (secretName && secretKey) {
        return createContainerEnvDraft({
          source: "secret",
          name: name.trim() || secretKey,
          sourceResource: secretName,
          sourceKey: secretKey,
        })
      }

      if (!name.trim()) return null
      return createContainerEnvDraft({
        source: "custom",
        name,
        value: asString(item.value),
      })
    })
    .filter((item): item is NonNullable<ReturnType<typeof createContainerEnvDraft>> => Boolean(item))

  return {
    id: createRuntimeId(),
    name: asString(value.name),
    type: value.type === "initContainer" ? "initContainer" : "container",
    image: asString(value.image),
    imagePullPolicy:
      value.imagePullPolicy === "Always" || value.imagePullPolicy === "Never"
        ? value.imagePullPolicy
        : "IfNotPresent",
    command: formatStringListAsEditorText(value.command),
    args: formatStringListAsEditorText(value.args),
    syncHostTimezone: value.syncHostTimezone === true,
    cpuRequest: asString(value.cpuRequest),
    cpuLimit: asString(value.cpuLimit),
    memoryRequestMi: asString(value.memoryRequestMi),
    memoryLimitMi: asString(value.memoryLimitMi),
    securityContext: normalizeSecurityContextDraft(value.securityContext),
    env,
    probes: normalizeProbeMap(value.probes as ContainerProbeMap | undefined),
    lifecycle: normalizeLifecycleMap(value.lifecycle as ContainerLifecycleMap | undefined),
    ports:
      Array.isArray(value.ports) && value.ports.length > 0
        ? value.ports.map((port) => ({
            id: createRuntimeId(),
            protocol: toOptionalPortProtocol(port.protocol) ?? "TCP",
            name: asString(port.name),
            containerPort: asString(port.containerPort),
          }))
        : index === 0
          ? [createContainerPortDraft(0)]
          : [],
  }
}

export function buildPodSpecFromContainers(
  restartPolicy: "Never" | "OnFailure",
  containers: ContainerDraft[],
  storage?: JobStorageInput | JobStorageInput[],
  configMounts?: JobConfigInput[]
): JsonObject {
  const workload: JsonObject[] = []
  const init: JsonObject[] = []
  const containerSpecs: Array<{ rawName: string; resolvedName: string; spec: JsonObject }> = []
  let withHostTimezone = false

  const usedContainerNames = new Set<string>()

  containers
    .filter((item) => item.image.trim())
    .forEach((item, index) => {
      const requests = {
        ...(item.cpuRequest.trim() ? { cpu: item.cpuRequest.trim() } : {}),
        ...(item.memoryRequestMi.trim() ? { memory: `${item.memoryRequestMi.trim()}Mi` } : {}),
      }
      const limits = {
        ...(item.cpuLimit.trim() ? { cpu: item.cpuLimit.trim() } : {}),
        ...(item.memoryLimitMi.trim() ? { memory: `${item.memoryLimitMi.trim()}Mi` } : {}),
      }
      const ports = item.ports
        .map((port) => {
          const num = Number.parseInt(port.containerPort.trim(), 10)
          if (!Number.isFinite(num) || num < 0 || num > 65535) return null
          return {
            ...(port.name.trim() ? { name: port.name.trim() } : {}),
            ...(port.protocol ? { protocol: port.protocol } : {}),
            containerPort: num,
          }
        })
        .filter(
          (
            port
          ): port is {
            containerPort: number
            name?: string
            protocol?: ContainerPortProtocol
          } => Boolean(port)
        )
      const env = item.env
        .map((entry) => {
          const name =
            entry.source === "custom"
              ? entry.name.trim()
              : entry.sourceKey.trim() || entry.name.trim()
          if (!name) return null
          if (entry.source === "configMap") {
            const sourceName = entry.sourceResource.trim()
            const sourceKey = entry.sourceKey.trim()
            if (!sourceName || !sourceKey) return null
            return {
              name,
              valueFrom: {
                configMapKeyRef: {
                  name: sourceName,
                  key: sourceKey,
                },
              },
            }
          }
          if (entry.source === "secret") {
            const sourceName = entry.sourceResource.trim()
            const sourceKey = entry.sourceKey.trim()
            if (!sourceName || !sourceKey) return null
            return {
              name,
              valueFrom: {
                secretKeyRef: {
                  name: sourceName,
                  key: sourceKey,
                },
              },
            }
          }
          return {
            name,
            value: entry.value,
          }
        })
        .filter(Boolean) as Array<{
          name: string
          value?: string
          valueFrom?: {
            configMapKeyRef?: { name: string; key: string }
            secretKeyRef?: { name: string; key: string }
          }
        }>
      const securityContext = buildSecurityContextSpecFromDraft(item.securityContext)

      const resolvedContainerName = resolveContainerName(
        item.name,
        item.image,
        index,
        usedContainerNames
      )
      const spec: JsonObject = {
        name: resolvedContainerName,
        image: item.image.trim(),
        ...(item.imagePullPolicy ? { imagePullPolicy: item.imagePullPolicy } : {}),
        ...(parseEditorTextToStringList(item.command).length > 0
          ? { command: parseEditorTextToStringList(item.command) }
          : {}),
        ...(parseEditorTextToStringList(item.args).length > 0
          ? { args: parseEditorTextToStringList(item.args) }
          : {}),
        ...(Object.keys(requests).length > 0 || Object.keys(limits).length > 0
          ? {
              resources: {
                ...(Object.keys(requests).length > 0 ? { requests } : {}),
                ...(Object.keys(limits).length > 0 ? { limits } : {}),
              },
            }
          : {}),
        ...(env.length > 0 ? { env } : {}),
        ...(ports.length > 0 ? { ports } : {}),
        ...(securityContext ? { securityContext } : {}),
        ...buildProbeSpecMap(item.probes),
        ...buildLifecycleSpecMap(item.lifecycle),
      }

      if (item.syncHostTimezone) {
        withHostTimezone = true
        spec.volumeMounts = [
          {
            name: "host-time",
            readOnly: true,
            mountPath: "/etc/localtime",
          },
        ]
      }

      if (item.type === "initContainer") {
        init.push(spec)
      } else {
        workload.push(spec)
      }

      containerSpecs.push({
        rawName: item.name.trim(),
        resolvedName: resolvedContainerName,
        spec,
      })
    })

  const volumes: JsonObject[] = []
  if (withHostTimezone) {
    volumes.push({
      name: "host-time",
      hostPath: {
        path: "/etc/localtime",
        type: "",
      },
    })
  }
  applyStorageToVolumesAndMounts(storage, containerSpecs, volumes)

  const configMountList = Array.isArray(configMounts) ? configMounts : []
  configMountList.forEach((configItem) => {
    const sourceName = (configItem.sourceName ?? "").trim()
    if (!sourceName) return
    const sourceKind = configItem.sourceKind === "secret" ? "secret" : "configMap"
    const resolvedSourceId = sourceName

    let hasAppliedConfigMount = false
    const mounts = Array.isArray(configItem.mounts)
      ? configItem.mounts
          .map((mount) => ({
            containerName: mount.containerName.trim(),
            mountMode: mount.mountMode,
            mountPath: mount.mountPath.trim(),
          }))
          .filter(
            (mount) =>
              mount.containerName.length > 0 &&
              mount.mountMode === "ro" &&
              mount.mountPath.length > 0
          )
      : []

    mounts.forEach((mount) => {
      const target =
        containerSpecs.find((item) => item.rawName === mount.containerName) ??
        containerSpecs.find((item) => item.resolvedName === mount.containerName)
      if (!target) return

      const existingMounts = Array.isArray(target.spec.volumeMounts)
        ? (target.spec.volumeMounts as Array<{ name?: string; mountPath?: string }>)
        : []
      const duplicated = existingMounts.some(
        (item) => item.name === resolvedSourceId && item.mountPath === mount.mountPath
      )
      if (duplicated) return

      target.spec.volumeMounts = [
        ...existingMounts,
        {
          name: resolvedSourceId,
          mountPath: mount.mountPath,
          readOnly: true,
        },
      ]
      hasAppliedConfigMount = true
    })

    if (!hasAppliedConfigMount) return
    if (volumes.some((item) => asString(item.name) === resolvedSourceId)) return

    volumes.push({
      name: resolvedSourceId,
      ...(sourceKind === "secret"
        ? { secret: { secretName: sourceName } }
        : { configMap: { name: sourceName } }),
    })
  })

  return {
    restartPolicy,
    ...(workload.length > 0 ? { containers: workload } : {}),
    ...(init.length > 0 ? { initContainers: init } : {}),
    ...(volumes.length > 0 ? { volumes } : {}),
  }
}

export function buildJobYamlText(
  kind: JobCreateKind,
  snapshot: JobDialogSnapshot,
  storage?: JobStorageInput | JobStorageInput[],
  configMounts?: JobConfigInput[]
): string {
  const strategy = {
    ...(toOptionalIntegerString(snapshot.strategy.backoffLimit)
      ? { backoffLimit: Number.parseInt(snapshot.strategy.backoffLimit, 10) }
      : {}),
    ...(toOptionalIntegerString(snapshot.strategy.completions)
      ? { completions: Number.parseInt(snapshot.strategy.completions, 10) }
      : {}),
    ...(toOptionalIntegerString(snapshot.strategy.parallelism)
      ? { parallelism: Number.parseInt(snapshot.strategy.parallelism, 10) }
      : {}),
    ...(toOptionalIntegerString(snapshot.strategy.activeDeadlineSeconds)
      ? { activeDeadlineSeconds: Number.parseInt(snapshot.strategy.activeDeadlineSeconds, 10) }
      : {}),
  }
  const metadata: JsonObject = {
    name: snapshot.name.trim().toLowerCase(),
    namespace: snapshot.namespace.trim(),
    ...(Object.keys(snapshot.labels).length > 0 ? { labels: snapshot.labels } : {}),
    ...(() => {
      const annotations = {
        ...snapshot.annotations,
      }
      if (snapshot.description.trim()) {
        annotations.description = snapshot.description.trim()
      } else {
        delete annotations.description
      }
      return Object.keys(annotations).length > 0 ? { annotations } : {}
    })(),
  }
  const podSpec = buildPodSpecFromContainers(
    snapshot.pod.restartPolicy,
    snapshot.pod.containers,
    storage,
    configMounts
  )

  const manifest: JsonObject =
    kind === "CronJob"
      ? {
          apiVersion: "batch/v1",
          kind: "CronJob",
          metadata,
          spec: {
            schedule: snapshot.schedule.trim() || DEFAULT_CRON_SCHEDULE,
            concurrencyPolicy: "Forbid",
            successfulJobsHistoryLimit: 3,
            failedJobsHistoryLimit: 1,
            jobTemplate: {
              spec: {
                ...strategy,
                template: {
                  spec: podSpec,
                },
              },
            },
          },
        }
      : {
          apiVersion: "batch/v1",
          kind: "Job",
          metadata,
          spec: {
            ...strategy,
            template: {
              spec: podSpec,
            },
          },
        }

  return stringify(manifest, {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  })
}

export function parseJobYamlText(kind: JobCreateKind, yamlText: string): JobDialogSnapshot {
  const root = asObject(parse(yamlText))
  if (Object.keys(root).length === 0) throw new Error("YAML 内容格式无效")
  const actualKind = asString(root.kind).trim()
  if (actualKind && actualKind !== kind) {
    throw new Error(`YAML 资源类型必须是 ${kind}`)
  }

  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
  const labels = asObject(metadata.labels)
  const spec = asObject(root.spec)
  const strategySource =
    kind === "CronJob"
      ? asObject(asObject(asObject(spec.jobTemplate).spec))
      : spec
  const podSpec =
    kind === "CronJob"
      ? asObject(asObject(asObject(strategySource.template).spec))
      : asObject(asObject(spec.template).spec)

  const hostTimeVolumeNames = new Set(
    (Array.isArray(podSpec.volumes) ? podSpec.volumes : [])
      .map((vol) => asObject(vol))
      .filter((vol) => asString(vol.name) && asString(asObject(vol.hostPath).path) === "/etc/localtime")
      .map((vol) => asString(vol.name))
  )

  const parseContainers = (
    raw: unknown,
    type: ContainerType
  ): ContainerDraft[] =>
    (Array.isArray(raw) ? raw : [])
      .map((entry, index) => {
        const item = asObject(entry)
        const resources = asObject(item.resources)
        const requests = asObject(resources.requests)
        const limits = asObject(resources.limits)
        const ports = (Array.isArray(item.ports) ? item.ports : [])
          .map((port) => {
            const portObj = asObject(port)
            const containerPortText = toOptionalIntegerString(portObj.containerPort)
            if (!containerPortText) return null
            return {
              id: createRuntimeId(),
              protocol: toOptionalPortProtocol(portObj.protocol) ?? "TCP",
              name: asString(portObj.name),
              containerPort: containerPortText,
            }
          })
          .filter((port): port is ContainerPortDraft => Boolean(port))
        const env = (Array.isArray(item.env) ? item.env : [])
          .map((entry) => {
            const envItem = asObject(entry)
            const name = asString(envItem.name)
            const valueFrom = asObject(envItem.valueFrom)
            const configMapKeyRef = asObject(valueFrom.configMapKeyRef)
            const secretKeyRef = asObject(valueFrom.secretKeyRef)
            const configMapName = asString(configMapKeyRef.name).trim()
            const configMapKey = asString(configMapKeyRef.key).trim()
            const secretName = asString(secretKeyRef.name).trim()
            const secretKey = asString(secretKeyRef.key).trim()

            if (configMapName && configMapKey) {
              return createContainerEnvDraft({
                source: "configMap",
                name: name.trim() || configMapKey,
                sourceResource: configMapName,
                sourceKey: configMapKey,
              })
            }
            if (secretName && secretKey) {
              return createContainerEnvDraft({
                source: "secret",
                name: name.trim() || secretKey,
                sourceResource: secretName,
                sourceKey: secretKey,
              })
            }
            if (!name.trim()) return null
            return createContainerEnvDraft({
              source: "custom",
              name,
              value: asString(envItem.value),
            })
          })
          .filter((entry): entry is NonNullable<ReturnType<typeof createContainerEnvDraft>> => Boolean(entry))
        const mounts = Array.isArray(item.volumeMounts) ? item.volumeMounts : []
        const withTimezone = mounts.some((mount) => {
          const mountObj = asObject(mount)
          const mountPath = asString(mountObj.mountPath)
          const mountName = asString(mountObj.name)
          return (
            mountPath === "/etc/localtime" ||
            (mountName.length > 0 && hostTimeVolumeNames.has(mountName))
          )
        })

        const imagePullPolicy: "Always" | "IfNotPresent" | "Never" =
          asString(item.imagePullPolicy) === "Always" ||
          asString(item.imagePullPolicy) === "Never"
            ? (asString(item.imagePullPolicy) as "Always" | "Never")
            : "IfNotPresent"

        return {
          id: createRuntimeId(),
          name: asString(item.name),
          type,
          image: asString(item.image),
          imagePullPolicy,
          command: formatStringListAsEditorText(item.command),
          args: formatStringListAsEditorText(item.args),
          syncHostTimezone: withTimezone,
          cpuRequest: asString(requests.cpu),
          cpuLimit: asString(limits.cpu),
          memoryRequestMi: toMemoryMiText(requests.memory),
          memoryLimitMi: toMemoryMiText(limits.memory),
          securityContext: normalizeSecurityContextDraft(item.securityContext),
          env,
          probes: parseProbeMapFromContainerSpec(item),
          lifecycle: parseLifecycleMapFromContainerSpec(item),
          ports: ports.length > 0 ? ports : index === 0 ? [createContainerPortDraft(0)] : [],
        }
      })
      .filter((item) => item.image.trim())

  const containers = [
    ...parseContainers(podSpec.containers, "container"),
    ...parseContainers(podSpec.initContainers, "initContainer"),
  ]

  const parsedStorageList = parseStorageListFromPodSpec(podSpec, hostTimeVolumeNames)
  const parsedConfigList = (Array.isArray(podSpec.volumes) ? podSpec.volumes : [])
    .map((entry) => asObject(entry))
    .map((volume, index) => {
      const volumeId = asString(volume.name).trim()
      const configMap = asObject(volume.configMap)
      const secret = asObject(volume.secret)
      const configMapName = asString(configMap.name).trim()
      const secretName = asString(secret.secretName).trim()
      const sourceKind = secretName ? "secret" : configMapName ? "configMap" : null
      const sourceName = secretName || configMapName
      if (!sourceKind || !sourceName || !volumeId || hostTimeVolumeNames.has(volumeId)) return null
      return {
        volumeId,
        sourceKind,
        sourceName,
        index,
      }
    })
    .filter(
      (
        item
      ): item is {
        volumeId: string
        sourceKind: "configMap" | "secret"
        sourceName: string
        index: number
      } => Boolean(item)
    )
    .map((configItem) => {
      const allContainers = [
        ...(Array.isArray(podSpec.containers) ? podSpec.containers : []),
        ...(Array.isArray(podSpec.initContainers) ? podSpec.initContainers : []),
      ]
      const mounts = allContainers
        .map((entry) => asObject(entry))
        .flatMap((container) => {
          const containerName = asString(container.name).trim()
          const volumeMounts = Array.isArray(container.volumeMounts) ? container.volumeMounts : []
          return volumeMounts
            .map((mount) => asObject(mount))
            .filter((mount) => asString(mount.name).trim() === configItem.volumeId)
            .map((mount) => ({
              containerName,
              mountMode: mount.readOnly === true ? ("ro" as const) : ("none" as const),
              mountPath: asString(mount.mountPath).trim(),
            }))
        })
        .filter((mount) => mount.containerName.length > 0)

      return {
        sourceKind: configItem.sourceKind,
        sourceName: configItem.sourceName,
        mounts,
      }
    })

  return {
    name: asString(metadata.name),
    namespace: asString(metadata.namespace),
    description: asString(annotations.description),
    labels: Object.fromEntries(
      Object.entries(labels).filter(([, value]) => typeof value === "string")
    ) as Record<string, string>,
    annotations: Object.fromEntries(
      Object.entries(annotations).filter(([, value]) => typeof value === "string")
    ) as Record<string, string>,
    schedule: kind === "CronJob" ? asString(spec.schedule).trim() || DEFAULT_CRON_SCHEDULE : "",
    strategy: {
      backoffLimit: toOptionalIntegerString(strategySource.backoffLimit),
      completions: toOptionalIntegerString(strategySource.completions),
      parallelism: toOptionalIntegerString(strategySource.parallelism),
      activeDeadlineSeconds: toOptionalIntegerString(strategySource.activeDeadlineSeconds),
    },
    pod: {
      restartPolicy: asString(podSpec.restartPolicy) === "OnFailure" ? "OnFailure" : "Never",
      containers: containers.length > 0 ? containers : [],
      ...(parsedConfigList.length > 0 ? { configList: parsedConfigList } : {}),
      ...(parsedStorageList.length > 0 ? { storageList: parsedStorageList } : {}),
    },
  }
}

export function createContainerDraft(): ContainerDraft {
  return {
    id: createRuntimeId(),
    name: "",
    type: "container",
    image: "",
    imagePullPolicy: "IfNotPresent",
    command: "",
    args: "",
    syncHostTimezone: false,
    cpuRequest: "",
    cpuLimit: "",
    memoryRequestMi: "",
    memoryLimitMi: "",
    securityContext: normalizeSecurityContextDraft({}),
    env: [],
    probes: {},
    lifecycle: {},
    ports: [createContainerPortDraft(0)],
  }
}

export function createContainerPortDraft(index: number): ContainerPortDraft {
  return {
    id: createRuntimeId(),
    protocol: "TCP",
    name: `tcp-${index}`,
    containerPort: "",
  }
}

export function createContainerEnvDraft(defaults?: {
  source?: ContainerEnvVarSource
  name?: string
  value?: string
  sourceResource?: string
  sourceKey?: string
}) {
  return {
    id: createRuntimeId(),
    source: defaults?.source ?? "custom",
    name: defaults?.name ?? "",
    value: defaults?.value ?? "",
    sourceResource: defaults?.sourceResource ?? "",
    sourceKey: defaults?.sourceKey ?? "",
  }
}

export function resolveDuplicateContainerEnvNameIds(entries: ContainerDraft["env"]): string[] {
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

export function validateContainerPorts(ports: ContainerPortDraft[]): ContainerPortFieldErrors {
  if (ports.length === 0) return {}

  const errors: ContainerPortFieldErrors = {}

  ports.forEach((item) => {
    const name = item.name.trim()
    const containerPort = item.containerPort.trim()
    const rowError: { name?: string; containerPort?: string } = {}

    if (!name) {
      rowError.name = "请输入端口名称"
    }
    if (!containerPort) {
      rowError.containerPort = "请输入容器端口"
    } else if (!/^\d+$/.test(containerPort)) {
      rowError.containerPort = "容器端口需为 0-65535 的数字"
    } else {
      const parsed = Number(containerPort)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
        rowError.containerPort = "容器端口需为 0-65535 的数字"
      }
    }

    if (rowError.name || rowError.containerPort) {
      errors[item.id] = rowError
    }
  })

  return errors
}

export function resolveProtocolNamePrefix(protocol: ContainerPortProtocol): string {
  return protocol.toLowerCase()
}

export function buildAutoPortName(protocol: ContainerPortProtocol, portText: string): string | null {
  const normalized = portText.trim()
  if (!/^\d+$/.test(normalized)) return null
  return `${resolveProtocolNamePrefix(protocol)}-${normalized}`
}

export function isAutoPortNameForProtocol(name: string, protocol: ContainerPortProtocol): boolean {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return false
  const prefix = resolveProtocolNamePrefix(protocol)
  if (!trimmed.startsWith(`${prefix}-`)) return false
  const suffix = trimmed.slice(prefix.length + 1)
  return /^\d+$/.test(suffix)
}

export function replaceProtocolPrefixInName(
  name: string,
  nextProtocol: ContainerPortProtocol
): string | null {
  const trimmed = name.trim()
  const parts = trimmed.split("-")
  if (parts.length < 2) return null

  const firstPart = parts[0]?.toLowerCase() ?? ""
  if (!AUTO_PROTOCOL_PREFIX_SET.has(firstPart)) return null

  const tail = parts.slice(1).join("-")
  if (!tail.trim()) return null

  return `${resolveProtocolNamePrefix(nextProtocol)}-${tail}`
}

export function validateName(value: string): string | null {
  const next = value.trim().toLowerCase()
  if (!next) return "请输入名称"
  if (next.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(next)) {
    return NAME_RULE_MESSAGE
  }
  return null
}

export function resolveSubmitErrorMessage(error: unknown, kind: JobCreateKind): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()
  if (text.includes("already exists") || text.includes("状态码 409")) {
    return kind === "CronJob" ? "定时任务名称已存在，请更换后重试" : "任务名称已存在，请更换后重试"
  }
  return raw || (kind === "CronJob" ? "创建定时任务失败，请稍后重试" : "创建任务失败，请稍后重试")
}

export function resolveStepDescription(step: CreateStep): string {
  switch (step) {
    case "advanced":
      return "补充标签与注解信息，便于检索、分类和后续治理。"
    default:
      return ""
  }
}

export function normalizeIntegerInput(value: string): string {
  return value.replace(/\D+/g, "")
}

export function toOptionalNonNegativeInt(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, parsed)
}

