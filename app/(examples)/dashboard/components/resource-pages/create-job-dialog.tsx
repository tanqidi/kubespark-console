"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"
import {
  IconAdjustments,
  IconBraces,
  IconDatabase,
  IconPencil,
  IconSettings2,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react"

import { checkJobExists, type JobCreateKind } from "@/app/lib/kubespark/jobs"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CreateContainerDialog,
  type ContainerDraft,
  type ContainerPortDraft,
  type ContainerPortProtocol,
  type ContainerType,
} from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog"
import {
  resolveFirstContainerPortErrorFieldId,
  resolveFirstInvalidFieldId,
  scrollAndFocusFieldById,
  type ContainerPortFieldErrors,
} from "@/app/lib/kubespark/form-validation"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { parse, stringify } from "yaml"

type NamespaceOption = {
  id: string
  name: string
}

type JsonObject = Record<string, unknown>

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

const MONACO_OPTIONS: EditorProps["options"] = {
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
  strategy?: {
    backoffLimit?: string
    completions?: string
    parallelism?: string
    activeDeadlineSeconds?: string
  }
  pod?: {
    restartPolicy?: "Never" | "OnFailure"
    containers?: Array<{
      name?: string
      type?: ContainerType
      image: string
      imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
      command?: string[]
      args?: string[]
      syncHostTimezone?: boolean
      ports?: Array<{
        protocol?: ContainerPortProtocol
        name?: string
        containerPort: string
      }>
      cpuRequest?: string
      cpuLimit?: string
      memoryRequestMi?: string
      memoryLimitMi?: string
    }>
  }
}

type CreateJobDialogProps = {
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
    strategy?: {
      backoffLimit?: number
      completions?: number
      parallelism?: number
      activeDeadlineSeconds?: number
    }
    pod?: {
      restartPolicy?: "Never" | "OnFailure"
      containers?: Array<{
        name?: string
        type?: ContainerType
        image: string
        imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
        command?: string[]
        args?: string[]
        syncHostTimezone?: boolean
        ports?: Array<{
          protocol?: ContainerPortProtocol
          name?: string
          containerPort: string
        }>
        cpuRequest?: string
        cpuLimit?: string
        memoryRequestMi?: string
        memoryLimitMi?: string
      }>
    }
  }) => Promise<void>
}

type CreateStep = "basic" | "strategy" | "pod" | "storage" | "advanced"
const CONTAINER_PORT_PROTOCOL_OPTIONS = [
  "GRPC",
  "HTTP",
  "HTTP2",
  "HTTPS",
  "MONGO",
  "REDIS",
  "TCP",
  "TLS",
  "UDP",
  "SCTP",
] as const

const CONTAINER_PORT_PROTOCOL_SET = new Set<string>(CONTAINER_PORT_PROTOCOL_OPTIONS)

const AUTO_PROTOCOL_PREFIX_SET = new Set([
  "grpc",
  "http",
  "http2",
  "https",
  "mongo",
  "redis",
  "tcp",
  "tpc",
  "tls",
  "udp",
  "sctp",
])

const STEP_ORDER: CreateStep[] = ["basic", "strategy", "pod", "storage", "advanced"]

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"
const POD_REQUIRED_MESSAGE = "请至少添加一个容器配置后再进入下一步"

type JobDialogSnapshot = {
  name: string
  namespace: string
  description: string
  strategy: {
    backoffLimit: string
    completions: string
    parallelism: string
    activeDeadlineSeconds: string
  }
  pod: {
    restartPolicy: "Never" | "OnFailure"
    containers: ContainerDraft[]
  }
}

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function toOptionalPortProtocol(value: unknown): ContainerPortProtocol | undefined {
  const normalized = asString(value).trim().toUpperCase()
  return CONTAINER_PORT_PROTOCOL_SET.has(normalized)
    ? (normalized as ContainerPortProtocol)
    : undefined
}

function toOptionalIntegerString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value))
  }
  const text = asString(value).trim()
  return /^\d+$/.test(text) ? text : ""
}

function toMemoryMiText(value: unknown): string {
  const raw = asString(value).trim()
  if (!raw) return ""
  const miMatch = raw.match(/^(\d+)mi$/i)
  if (miMatch?.[1]) return miMatch[1]
  return /^\d+$/.test(raw) ? raw : ""
}

function toDnsLabelFragment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/\.+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized.slice(0, 63)
}

function resolveContainerNameFromImage(image: string): string {
  const raw = image.trim()
  if (!raw) return ""
  const withoutDigest = raw.includes("@") ? raw.split("@")[0] ?? raw : raw
  const lastSegment = withoutDigest.split("/").filter(Boolean).pop() ?? withoutDigest
  const tagIndex = lastSegment.lastIndexOf(":")
  const withoutTag = tagIndex > 0 ? lastSegment.slice(0, tagIndex) : lastSegment
  return toDnsLabelFragment(withoutTag)
}

function resolveContainerName(name: string, image: string, index: number): string {
  const typed = toDnsLabelFragment(name)
  if (typed) return typed
  const imageDerived = resolveContainerNameFromImage(image)
  if (imageDerived) return imageDerived
  return `container-${index + 1}`
}

function formatStringListAsEditorText(value: unknown): string {
  if (!Array.isArray(value)) return ""
  const list = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
  return list.length > 0 ? list.join(",") : ""
}

function parseEditorTextToStringList(value: string): string[] {
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

function createContainerDraftFromInitial(
  value: NonNullable<NonNullable<JobDialogInitialValues["pod"]>["containers"]>[number],
  index: number
): ContainerDraft {
  return {
    id: crypto.randomUUID(),
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
    ports:
      Array.isArray(value.ports) && value.ports.length > 0
        ? value.ports.map((port) => ({
            id: crypto.randomUUID(),
            protocol: toOptionalPortProtocol(port.protocol) ?? "TCP",
            name: asString(port.name),
            containerPort: asString(port.containerPort),
          }))
        : index === 0
          ? [createContainerPortDraft(0)]
          : [],
  }
}

function buildPodSpecFromContainers(
  restartPolicy: "Never" | "OnFailure",
  containers: ContainerDraft[]
): JsonObject {
  const workload: JsonObject[] = []
  const init: JsonObject[] = []
  let withHostTimezone = false

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

      const spec: JsonObject = {
        name: resolveContainerName(item.name, item.image, index),
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
        ...(ports.length > 0 ? { ports } : {}),
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
    })

  return {
    restartPolicy,
    ...(workload.length > 0 ? { containers: workload } : {}),
    ...(init.length > 0 ? { initContainers: init } : {}),
    ...(withHostTimezone
      ? {
          volumes: [
            {
              name: "host-time",
              hostPath: {
                path: "/etc/localtime",
                type: "",
              },
            },
          ],
        }
      : {}),
  }
}

function buildJobYamlText(kind: JobCreateKind, snapshot: JobDialogSnapshot): string {
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
    ...(snapshot.description.trim()
      ? { annotations: { description: snapshot.description.trim() } }
      : {}),
  }
  const podSpec = buildPodSpecFromContainers(
    snapshot.pod.restartPolicy,
    snapshot.pod.containers
  )

  const manifest: JsonObject =
    kind === "CronJob"
      ? {
          apiVersion: "batch/v1",
          kind: "CronJob",
          metadata,
          spec: {
            schedule: "*/5 * * * *",
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

function parseJobYamlText(kind: JobCreateKind, yamlText: string): JobDialogSnapshot {
  const root = asObject(parse(yamlText))
  if (Object.keys(root).length === 0) throw new Error("YAML 内容格式无效")
  const actualKind = asString(root.kind).trim()
  if (actualKind && actualKind !== kind) {
    throw new Error(`YAML 资源类型必须是 ${kind}`)
  }

  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
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
              id: crypto.randomUUID(),
              protocol: toOptionalPortProtocol(portObj.protocol) ?? "TCP",
              name: asString(portObj.name),
              containerPort: containerPortText,
            }
          })
          .filter((port): port is ContainerPortDraft => Boolean(port))
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
          id: crypto.randomUUID(),
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
          ports: ports.length > 0 ? ports : index === 0 ? [createContainerPortDraft(0)] : [],
        }
      })
      .filter((item) => item.image.trim())

  const containers = [
    ...parseContainers(podSpec.containers, "container"),
    ...parseContainers(podSpec.initContainers, "initContainer"),
  ]

  return {
    name: asString(metadata.name),
    namespace: asString(metadata.namespace),
    description: asString(annotations.description),
    strategy: {
      backoffLimit: toOptionalIntegerString(strategySource.backoffLimit),
      completions: toOptionalIntegerString(strategySource.completions),
      parallelism: toOptionalIntegerString(strategySource.parallelism),
      activeDeadlineSeconds: toOptionalIntegerString(strategySource.activeDeadlineSeconds),
    },
    pod: {
      restartPolicy: asString(podSpec.restartPolicy) === "OnFailure" ? "OnFailure" : "Never",
      containers: containers.length > 0 ? containers : [],
    },
  }
}

function createContainerDraft(): ContainerDraft {
  return {
    id: crypto.randomUUID(),
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
    ports: [createContainerPortDraft(0)],
  }
}

function createContainerPortDraft(index: number): ContainerPortDraft {
  return {
    id: crypto.randomUUID(),
    protocol: "HTTP",
    name: `http-${index}`,
    containerPort: "",
  }
}

function validateContainerPorts(ports: ContainerPortDraft[]): ContainerPortFieldErrors {
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

function resolveProtocolNamePrefix(protocol: ContainerPortProtocol): string {
  return protocol === "TCP" ? "tpc" : protocol.toLowerCase()
}

function buildAutoPortName(protocol: ContainerPortProtocol, portText: string): string | null {
  const normalized = portText.trim()
  if (!/^\d+$/.test(normalized)) return null
  return `${resolveProtocolNamePrefix(protocol)}-${normalized}`
}

function isAutoPortNameForProtocol(name: string, protocol: ContainerPortProtocol): boolean {
  const trimmed = name.trim().toLowerCase()
  if (!trimmed) return false
  const prefix = resolveProtocolNamePrefix(protocol)
  if (!trimmed.startsWith(`${prefix}-`)) return false
  const suffix = trimmed.slice(prefix.length + 1)
  return /^\d+$/.test(suffix)
}

function replaceProtocolPrefixInName(
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

function validateName(value: string): string | null {
  const next = value.trim().toLowerCase()
  if (!next) return "请输入名称"
  if (next.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(next)) {
    return NAME_RULE_MESSAGE
  }
  return null
}

function resolveSubmitErrorMessage(error: unknown, kind: JobCreateKind): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()
  if (text.includes("already exists") || text.includes("状态码 409")) {
    return kind === "CronJob" ? "定时任务名称已存在，请更换后重试" : "任务名称已存在，请更换后重试"
  }
  return raw || (kind === "CronJob" ? "创建定时任务失败，请稍后重试" : "创建任务失败，请稍后重试")
}

function resolveStepDescription(step: CreateStep): string {
  switch (step) {
    case "storage":
      return "存储设置功能即将开放。"
    case "advanced":
      return "高级设置功能即将开放。"
    default:
      return ""
  }
}

function normalizeIntegerInput(value: string): string {
  return value.replace(/\D+/g, "")
}

function toOptionalNonNegativeInt(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, parsed)
}

export function CreateJobDialog({
  open,
  onOpenChange,
  kind,
  namespaceOptions,
  mode = "create",
  initialValues = null,
  onSubmit,
}: CreateJobDialogProps) {
  const isEditMode = mode === "edit"
  const [activeStep, setActiveStep] = React.useState<CreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [backoffLimit, setBackoffLimit] = React.useState("")
  const [completions, setCompletions] = React.useState("")
  const [parallelism, setParallelism] = React.useState("")
  const [activeDeadlineSeconds, setActiveDeadlineSeconds] = React.useState("")
  const [restartPolicy, setRestartPolicy] = React.useState<"Never" | "OnFailure">("Never")
  const [containers, setContainers] = React.useState<ContainerDraft[]>([])
  const [containerDialogOpen, setContainerDialogOpen] = React.useState(false)
  const [editingContainerId, setEditingContainerId] = React.useState<string | null>(null)
  const [editingImageError, setEditingImageError] = React.useState<string | null>(null)
  const [editingPortFieldErrors, setEditingPortFieldErrors] = React.useState<ContainerPortFieldErrors>({})
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [yamlMode, setYamlMode] = React.useState(false)
  const [yamlText, setYamlText] = React.useState("")
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  const isBusy = checkingNext || creating
  const currentStepIndex = STEP_ORDER.indexOf(activeStep)
  const isBasicStep = activeStep === "basic"
  const isStrategyStep = activeStep === "strategy"
  const isPodStep = activeStep === "pod"
  const isFinalStep = activeStep === "advanced"
  const isEditingPodView = containerDialogOpen
  const canNavigateStep = !isBusy && !isEditingPodView

  const dialogTitle = isEditMode
    ? kind === "CronJob"
      ? "编辑定时任务"
      : "编辑任务"
    : kind === "CronJob"
      ? "创建定时任务"
      : "创建任务"
  const dialogDescription =
    isEditMode
      ? kind === "CronJob"
        ? "编辑 Kubernetes CronJob 的配置内容。"
        : "编辑 Kubernetes Job 的配置内容。"
      : kind === "CronJob"
        ? "使用 Kubernetes CronJob 创建按周期执行的任务。"
        : "使用 Kubernetes Job 创建一次性任务。"

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setName("")
      setNamespace("")
      setDescription("")
      setBackoffLimit("")
      setCompletions("")
      setParallelism("")
      setActiveDeadlineSeconds("")
      setRestartPolicy("Never")
      setContainers([])
      setContainerDialogOpen(false)
      setEditingContainerId(null)
      setEditingImageError(null)
      setEditingPortFieldErrors({})
      setNameError(null)
      setNamespaceError(null)
      setSubmitError(null)
      setYamlMode(false)
      setYamlText("")
      setYamlError(null)
      setCheckingNext(false)
      setCreating(false)
    }
  }, [open, kind])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return

    setActiveStep("basic")
    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
    setBackoffLimit(initialValues.strategy?.backoffLimit ?? "")
    setCompletions(initialValues.strategy?.completions ?? "")
    setParallelism(initialValues.strategy?.parallelism ?? "")
    setActiveDeadlineSeconds(initialValues.strategy?.activeDeadlineSeconds ?? "")
    setRestartPolicy(initialValues.pod?.restartPolicy === "OnFailure" ? "OnFailure" : "Never")
    setContainers(
      Array.isArray(initialValues.pod?.containers)
        ? initialValues.pod.containers.map((item, index) => createContainerDraftFromInitial(item, index))
        : []
    )
    setContainerDialogOpen(false)
    setEditingContainerId(null)
    setEditingImageError(null)
    setEditingPortFieldErrors({})
    setNameError(null)
    setNamespaceError(null)
    setSubmitError(null)
    setYamlMode(false)
    setYamlText("")
    setYamlError(null)
  }, [initialValues, isEditMode, open])

  const goPrev = React.useCallback(() => {
    if (isBusy || isBasicStep) return
    const previousStep = STEP_ORDER[Math.max(0, currentStepIndex - 1)]
    setActiveStep(previousStep)
    setSubmitError(null)
  }, [currentStepIndex, isBasicStep, isBusy])

  const editingContainer = React.useMemo(
    () => containers.find((item) => item.id === editingContainerId) ?? null,
    [containers, editingContainerId]
  )

  const configuredContainers = React.useMemo(
    () => containers.filter((item) => item.image.trim()),
    [containers]
  )

  const runPodValidation = React.useCallback(() => {
    if (configuredContainers.length > 0) return true
    setSubmitError(POD_REQUIRED_MESSAGE)
    return false
  }, [configuredContainers.length])

  const lockedIdentity = React.useMemo(
    () =>
      isEditMode && initialValues
        ? {
            name: initialValues.name.trim().toLowerCase(),
            namespace: initialValues.namespace.trim(),
          }
        : null,
    [initialValues, isEditMode]
  )

  const getSnapshot = React.useCallback(
    (): JobDialogSnapshot => ({
      name,
      namespace,
      description,
      strategy: {
        backoffLimit,
        completions,
        parallelism,
        activeDeadlineSeconds,
      },
      pod: {
        restartPolicy,
        containers,
      },
    }),
    [
      activeDeadlineSeconds,
      backoffLimit,
      completions,
      containers,
      description,
      name,
      namespace,
      parallelism,
      restartPolicy,
    ]
  )

  const applySnapshot = React.useCallback((snapshot: JobDialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
    setBackoffLimit(snapshot.strategy.backoffLimit)
    setCompletions(snapshot.strategy.completions)
    setParallelism(snapshot.strategy.parallelism)
    setActiveDeadlineSeconds(snapshot.strategy.activeDeadlineSeconds)
    setRestartPolicy(snapshot.pod.restartPolicy)
    setContainers(snapshot.pod.containers)
    setNameError(null)
    setNamespaceError(null)
    setSubmitError(null)
  }, [])

  const withLockedIdentity = React.useCallback(
    (snapshot: JobDialogSnapshot): JobDialogSnapshot => {
      if (!lockedIdentity) return snapshot
      return {
        ...snapshot,
        name: lockedIdentity.name,
        namespace: lockedIdentity.namespace,
      }
    },
    [lockedIdentity]
  )

  const handleYamlModeChange = React.useCallback(
    (checked: boolean) => {
      if (isBusy) return

      if (checked) {
        setYamlText(buildJobYamlText(kind, withLockedIdentity(getSnapshot())))
        setYamlError(null)
        setYamlMode(true)
        return
      }

      try {
        const parsed = parseJobYamlText(kind, yamlText)
        applySnapshot(withLockedIdentity(parsed))
        setYamlError(null)
        setYamlMode(false)
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
      }
    },
    [applySnapshot, getSnapshot, isBusy, kind, withLockedIdentity, yamlText]
  )

  const updateContainer = React.useCallback(
    (
      id: string,
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
    ) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === id
            ? (() => {
                if (field === "image") {
                  const nextImage = typeof value === "string" ? value : ""
                  const previousAutoName = resolveContainerNameFromImage(item.image)
                  const nextAutoName = resolveContainerNameFromImage(nextImage)
                  const currentName = item.name.trim()
                  const shouldAutoSyncName =
                    currentName.length === 0 ||
                    (previousAutoName.length > 0 && currentName === previousAutoName)

                  return {
                    ...item,
                    image: nextImage,
                    ...(shouldAutoSyncName ? { name: nextAutoName } : {}),
                  }
                }

                return {
                  ...item,
                  [field]: field === "syncHostTimezone" ? value === true : value,
                }
              })()
            : item
        )
      )
      if (editingImageError) setEditingImageError(null)
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [editingImageError, submitError]
  )

  const addContainerPort = React.useCallback(
    (id: string) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ports: [...item.ports, createContainerPortDraft(item.ports.length)],
              }
            : item
        )
      )
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const updateContainerPort = React.useCallback(
    (
      containerId: string,
      portId: string,
      field: "protocol" | "name" | "containerPort",
      value: string
    ) => {
      setContainers((current) =>
        current.map((item) => {
          if (item.id !== containerId) return item

          return {
            ...item,
            ports: item.ports.map((port) => {
              if (port.id !== portId) return port

              if (field === "protocol") {
                const nextProtocol = value.toUpperCase()
                if (!CONTAINER_PORT_PROTOCOL_SET.has(nextProtocol)) return port
                const normalizedProtocol = nextProtocol as ContainerPortProtocol

                const replacedName = replaceProtocolPrefixInName(port.name, normalizedProtocol)
                return {
                  ...port,
                  protocol: normalizedProtocol,
                  name: replacedName ?? port.name,
                }
              }

              if (field === "containerPort") {
                const autoNameBefore = buildAutoPortName(port.protocol, port.containerPort)
                const autoNameAfter = buildAutoPortName(port.protocol, value)
                const currentName = port.name.trim()
                const hasAutoPatternName = isAutoPortNameForProtocol(currentName, port.protocol)
                const shouldAutoRename =
                  currentName.length === 0 ||
                  hasAutoPatternName ||
                  (Boolean(autoNameBefore) && currentName === autoNameBefore)
                return {
                  ...port,
                  containerPort: value,
                  ...(shouldAutoRename && autoNameAfter ? { name: autoNameAfter } : {}),
                }
              }

              return {
                ...port,
                name: value,
              }
            }),
          }
        })
      )
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const removeContainerPort = React.useCallback(
    (containerId: string, portId: string) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === containerId
            ? {
                ...item,
                ports: item.ports.filter((port) => port.id !== portId),
              }
            : item
        )
      )
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const beginEditContainer = React.useCallback(
    (id: string) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === id && item.ports.length === 0
            ? {
                ...item,
                ports: [createContainerPortDraft(0)],
              }
            : item
        )
      )
      setEditingContainerId(id)
      setContainerDialogOpen(true)
      if (editingImageError) setEditingImageError(null)
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [editingImageError, submitError]
  )

  const addContainer = React.useCallback(() => {
    const next = createContainerDraft()
    setContainers((current) => [...current, next])
    setEditingContainerId(next.id)
    setContainerDialogOpen(true)
    if (editingImageError) setEditingImageError(null)
    setEditingPortFieldErrors({})
    if (submitError) setSubmitError(null)
  }, [editingImageError, submitError])

  const removeContainer = React.useCallback(
    (id: string) => {
      setContainers((current) => current.filter((item) => item.id !== id))
      setEditingContainerId((current) => (current === id ? null : current))
      if (editingImageError) setEditingImageError(null)
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [editingImageError, submitError]
  )

  const returnToPodList = React.useCallback(() => {
    if (!editingContainer) {
      setContainerDialogOpen(false)
      setEditingContainerId(null)
      return
    }

    // Required checks follow visual order: image -> ports (row by row).
    const nextImageError = editingContainer.image.trim() ? null : "请输入镜像地址"
    const nextPortFieldErrors = nextImageError ? {} : validateContainerPorts(editingContainer.ports)

    setEditingImageError(nextImageError)
    setEditingPortFieldErrors(nextPortFieldErrors)

    const firstPortErrorFieldId = resolveFirstContainerPortErrorFieldId(
      editingContainer.id,
      editingContainer.ports,
      nextPortFieldErrors
    )
    const firstInvalidFieldId = resolveFirstInvalidFieldId([
      { invalid: Boolean(nextImageError), fieldId: `${editingContainer.id}-image` },
      { invalid: Boolean(firstPortErrorFieldId), fieldId: firstPortErrorFieldId },
    ])
    if (firstInvalidFieldId) {
      scrollAndFocusFieldById(firstInvalidFieldId)
      return
    }

    setEditingImageError(null)
    setEditingPortFieldErrors({})
    setContainerDialogOpen(false)
    setEditingContainerId(null)
  }, [editingContainer])

  const cancelEditContainer = React.useCallback(() => {
    if (editingContainerId) {
      setContainers((current) =>
        current.filter(
          (item) =>
            item.id !== editingContainerId ||
            item.image.trim().length > 0 ||
            item.name.trim().length > 0 ||
            item.cpuRequest.trim().length > 0 ||
            item.cpuLimit.trim().length > 0 ||
            item.memoryRequestMi.trim().length > 0 ||
            item.memoryLimitMi.trim().length > 0 ||
            item.ports.some((port) => port.containerPort.trim().length > 0)
        )
      )
    }
    setEditingImageError(null)
    setEditingPortFieldErrors({})
    setContainerDialogOpen(false)
    setEditingContainerId(null)
  }, [editingContainerId])

  const runBasicValidation = React.useCallback(async (source?: Pick<JobDialogSnapshot, "name" | "namespace">) => {
    const nextName = (lockedIdentity?.name ?? source?.name ?? name).trim().toLowerCase()
    const nextNamespace = (lockedIdentity?.namespace ?? source?.namespace ?? namespace).trim()
    const nextNameError = validateName(nextName)
    const nextNamespaceError = nextNamespace ? null : "请选择项目"
    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    if (nextNameError || nextNamespaceError) return false

    if (isEditMode) return true

    const exists = await checkJobExists({
      kind,
      name: nextName,
      namespace: nextNamespace,
    })
    if (exists) {
      setNameError(kind === "CronJob" ? "定时任务名称已存在，请更换后重试" : "任务名称已存在，请更换后重试")
      return false
    }

    return true
  }, [isEditMode, kind, lockedIdentity?.name, lockedIdentity?.namespace, name, namespace])

  const goNext = React.useCallback(async () => {
    if (isBusy || isFinalStep || isEditingPodView || yamlMode) return
    setSubmitError(null)

    if (isBasicStep) {
      setCheckingNext(true)
      try {
        const passed = await runBasicValidation()
        if (!passed) return
      } catch (error) {
        setNameError(error instanceof Error ? error.message : "名称校验失败")
        return
      } finally {
        setCheckingNext(false)
      }
    }

    if (isPodStep) {
      const passed = runPodValidation()
      if (!passed) return
    }

    const nextStep = STEP_ORDER[Math.min(STEP_ORDER.length - 1, currentStepIndex + 1)]
    setActiveStep(nextStep)
  }, [
    currentStepIndex,
    isBasicStep,
    isBusy,
    isEditingPodView,
    isFinalStep,
    isPodStep,
    yamlMode,
    runBasicValidation,
    runPodValidation,
  ])

  const handleCreate = React.useCallback(
    async () => {
      if (isBusy || (!isFinalStep && !yamlMode)) return

      setSubmitError(null)
      setCreating(true)
      try {
        let source = getSnapshot()
        if (yamlMode) {
          try {
            source = withLockedIdentity(parseJobYamlText(kind, yamlText))
            applySnapshot(source)
            setYamlError(null)
          } catch (error) {
            setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
            return
          }
        }

        const normalizedName = (lockedIdentity?.name ?? source.name).trim().toLowerCase()
        const normalizedNamespace = (lockedIdentity?.namespace ?? source.namespace).trim()
        const nextNameError = validateName(normalizedName)
        const nextNamespaceError = normalizedNamespace ? null : "请选择项目"
        setNameError(nextNameError)
        setNamespaceError(nextNamespaceError)
        if (nextNameError || nextNamespaceError) {
          if (yamlMode) {
            setYamlError(nextNameError ?? nextNamespaceError)
          } else {
            setActiveStep("basic")
          }
          return
        }

        if (!isEditMode) {
          const exists = await checkJobExists({
            kind,
            name: normalizedName,
            namespace: normalizedNamespace,
          })
          if (exists) {
            const existsError =
              kind === "CronJob" ? "定时任务名称已存在，请更换后重试" : "任务名称已存在，请更换后重试"
            setNameError(existsError)
            if (yamlMode) {
              setYamlError(existsError)
            } else {
              setActiveStep("basic")
            }
            return
          }
        }

        const strategyDraft = {
          backoffLimit: toOptionalNonNegativeInt(source.strategy.backoffLimit),
          completions: toOptionalNonNegativeInt(source.strategy.completions),
          parallelism: toOptionalNonNegativeInt(source.strategy.parallelism),
          activeDeadlineSeconds: toOptionalNonNegativeInt(source.strategy.activeDeadlineSeconds),
        }
        const strategy =
          typeof strategyDraft.backoffLimit === "number" ||
          typeof strategyDraft.completions === "number" ||
          typeof strategyDraft.parallelism === "number" ||
          typeof strategyDraft.activeDeadlineSeconds === "number"
            ? strategyDraft
            : undefined

        const normalizedContainers = source.pod.containers
          .map((item) => {
            const normalizedPorts = item.ports
              .map((port) => ({
                protocol: port.protocol,
                name: port.name.trim(),
                containerPort: port.containerPort.trim(),
              }))
              .filter((port) => /^\d+$/.test(port.containerPort))
            const normalizedCommand = parseEditorTextToStringList(item.command)
            const normalizedArgs = parseEditorTextToStringList(item.args)

            return {
              name: item.name.trim(),
              type: item.type,
              image: item.image.trim(),
              imagePullPolicy: item.imagePullPolicy,
              ...(normalizedCommand.length > 0 ? { command: normalizedCommand } : {}),
              ...(normalizedArgs.length > 0 ? { args: normalizedArgs } : {}),
              ...(item.syncHostTimezone ? { syncHostTimezone: true } : {}),
              cpuRequest: item.cpuRequest.trim(),
              cpuLimit: item.cpuLimit.trim(),
              memoryRequestMi: item.memoryRequestMi.trim(),
              memoryLimitMi: item.memoryLimitMi.trim(),
              ...(normalizedPorts.length > 0 ? { ports: normalizedPorts } : {}),
            }
          })
          .filter((item) => item.image.length > 0)

        const pod =
          source.pod.restartPolicy === "OnFailure" || normalizedContainers.length > 0
            ? {
                ...(source.pod.restartPolicy === "OnFailure"
                  ? { restartPolicy: source.pod.restartPolicy }
                  : {}),
                ...(normalizedContainers.length > 0
                  ? {
                      containers: normalizedContainers,
                    }
                  : {}),
              }
            : undefined

        await onSubmit({
          kind,
          name: normalizedName,
          namespace: normalizedNamespace,
          description: source.description.trim(),
          strategy,
          pod,
        })

        onOpenChange(false)
      } catch (error) {
        setSubmitError(resolveSubmitErrorMessage(error, kind))
      } finally {
        setCreating(false)
      }
    },
    [
      applySnapshot,
      getSnapshot,
      isBusy,
      isFinalStep,
      isEditMode,
      kind,
      lockedIdentity?.name,
      lockedIdentity?.namespace,
      onOpenChange,
      onSubmit,
      withLockedIdentity,
      yamlMode,
      yamlText,
    ]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isBusy) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
              </div>
              <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                <span className="text-sm font-medium">编辑 YAML</span>
                <Switch
                  checked={yamlMode}
                  onCheckedChange={handleYamlModeChange}
                  disabled={isBusy}
                  aria-label="编辑 YAML"
                />
              </div>
            </div>
          </DialogHeader>

          {!yamlMode ? (
            <StepHeaderNav
              items={[
              {
                id: "basic",
                title: "基本信息",
                status: activeStep === "basic" ? "当前" : "已设置",
                active: activeStep === "basic",
                icon: <IconSettings2 className="size-4" />,
                disabled: !canNavigateStep,
                onClick: () => {
                  if (!canNavigateStep) return
                  setActiveStep("basic")
                  setSubmitError(null)
                },
              },
              {
                id: "strategy",
                title: "策略设置",
                status: activeStep === "strategy" ? "当前" : currentStepIndex > 1 ? "已设置" : "未设置",
                active: activeStep === "strategy",
                icon: <IconAdjustments className="size-4" />,
                disabled: !canNavigateStep,
                onClick: () => {
                  if (!canNavigateStep) return
                  if (currentStepIndex >= 1) {
                    setActiveStep("strategy")
                    setSubmitError(null)
                    return
                  }
                  void goNext()
                },
              },
              {
                id: "pod",
                title: "容器组设置",
                status: activeStep === "pod" ? "当前" : currentStepIndex > 2 ? "已设置" : "未设置",
                active: activeStep === "pod",
                icon: <IconBraces className="size-4" />,
                disabled: !canNavigateStep,
                onClick: () => {
                  if (!canNavigateStep || currentStepIndex < 1) return
                  setActiveStep("pod")
                  setSubmitError(null)
                },
              },
              {
                id: "storage",
                title: "存储设置",
                status: activeStep === "storage" ? "当前" : currentStepIndex > 3 ? "已设置" : "未设置",
                active: activeStep === "storage",
                icon: <IconDatabase className="size-4" />,
                disabled: !canNavigateStep,
                onClick: () => {
                  if (!canNavigateStep || currentStepIndex < 2) return
                  if (activeStep === "pod") {
                    const passed = runPodValidation()
                    if (!passed) return
                  }
                  setActiveStep("storage")
                  setSubmitError(null)
                },
              },
              {
                id: "advanced",
                title: "高级设置",
                status: activeStep === "advanced" ? "当前" : "未设置",
                active: activeStep === "advanced",
                icon: <IconStack2 className="size-4" />,
                disabled: !canNavigateStep,
                onClick: () => {
                  if (!canNavigateStep || currentStepIndex < 3) return
                  setActiveStep("advanced")
                  setSubmitError(null)
                },
              },
              ]}
            />
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {yamlMode ? (
              <div className="flex h-full min-h-[56vh] flex-col">
                <div className="overflow-hidden rounded-lg border">
                  <MonacoEditor
                    language="yaml"
                    theme="vs-dark"
                    value={yamlText}
                    onChange={(value) => {
                      setYamlText(value ?? "")
                      if (yamlError) setYamlError(null)
                    }}
                    options={MONACO_OPTIONS}
                    height="56vh"
                  />
                </div>
                {yamlError ? <FieldError className="mt-3">{yamlError}</FieldError> : null}
              </div>
            ) : isBasicStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">基本信息</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    填写任务名称、所属项目以及描述信息。
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field data-invalid={Boolean(nameError)}>
                    <FieldLabel htmlFor="create-job-name">名称</FieldLabel>
                    <Input
                      id="create-job-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameError) setNameError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      placeholder={kind === "CronJob" ? "请输入定时任务名称" : "请输入任务名称"}
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={isBusy || isEditMode}
                    />
                    {nameError ? (
                      <FieldError>{nameError}</FieldError>
                    ) : (
                      <FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>
                    )}
                  </Field>

                  <Field data-invalid={Boolean(namespaceError)}>
                    <FieldLabel htmlFor="create-job-namespace">项目</FieldLabel>
                    <Select
                      value={namespace}
                      onValueChange={(value) => {
                        if (isEditMode) return
                        setNamespace(value)
                        if (namespaceError) setNamespaceError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      disabled={isBusy || isEditMode}
                    >
                      <SelectTrigger id="create-job-namespace" aria-invalid={Boolean(namespaceError)}>
                        <SelectValue placeholder="请选择项目" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {namespaceOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {namespaceError ? (
                      <FieldError>{namespaceError}</FieldError>
                    ) : (
                      <FieldDescription>选择任务所属项目。</FieldDescription>
                    )}
                  </Field>

                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="create-job-description">描述</FieldLabel>
                    <Textarea
                      id="create-job-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="请输入描述（选填）"
                      maxLength={256}
                      className="min-h-24"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      描述将写入资源注解 `description`，最长 256 个字符。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : isStrategyStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">策略设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    配置任务重试、并发与超时策略。全部为选填，留空将使用默认值。
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="create-job-backoff-limit">最大重试次数</FieldLabel>
                    <Input
                      id="create-job-backoff-limit"
                      value={backoffLimit}
                      onChange={(event) => setBackoffLimit(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：6"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      失败前最多可重试的次数。留空时按系统默认策略处理。
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-completions">容器组完成数量</FieldLabel>
                    <Input
                      id="create-job-completions"
                      value={completions}
                      onChange={(event) => setCompletions(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：1"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      任务完成所需的成功执行次数。未填写则使用平台默认行为。
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-parallelism">并行容器组数量</FieldLabel>
                    <Input
                      id="create-job-parallelism"
                      value={parallelism}
                      onChange={(event) => setParallelism(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：1"
                      disabled={isBusy}
                    />
                    <FieldDescription>同一时刻允许并发运行的容器组数量。</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-active-deadline">最大运行时间（s）</FieldLabel>
                    <Input
                      id="create-job-active-deadline"
                      value={activeDeadlineSeconds}
                      onChange={(event) =>
                        setActiveDeadlineSeconds(normalizeIntegerInput(event.target.value))
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：3600"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      限制任务最长运行秒数，超时后任务会被系统终止。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : isPodStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">容器组设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    配置容器组重启行为与容器镜像信息。至少可添加一条容器配置。
                  </p>
                </div>

                <FieldGroup className="flex flex-col gap-6">
                  <Field>
                    <FieldLabel htmlFor="create-job-restart-policy">重启策略</FieldLabel>
                    <Select
                      value={restartPolicy}
                      onValueChange={(value) => {
                        if (value === "Never" || value === "OnFailure") {
                          setRestartPolicy(value)
                        }
                      }}
                      disabled={isBusy}
                    >
                      <SelectTrigger id="create-job-restart-policy">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="Never">重新创建容器组</SelectItem>
                          <SelectItem value="OnFailure">重启容器</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      容器退出后采用的处理方式。默认使用“重新创建容器组”。
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel>容器</FieldLabel>
                    <div className="max-h-[44vh] overflow-y-auto pr-2">
                      <div className="flex flex-col gap-0 pb-1">
                        {configuredContainers.length > 0 ? (
                          <ItemGroup className="gap-3">
                            {configuredContainers.map((item) => (
                              <Item key={item.id} variant="outline" size="sm" className="hover:bg-muted">
                                <ItemContent className="min-w-0">
                                  <ItemTitle className="min-w-0 truncate">
                                    {item.name.trim() || "未命名容器"}
                                  </ItemTitle>
                                  <ItemDescription className="min-w-0 truncate">
                                    {item.image.trim()}
                                    {" · "}
                                    {item.type === "initContainer" ? "初始化容器" : "工作容器"}
                                    {" · "}
                                    {item.imagePullPolicy}
                                  </ItemDescription>
                                </ItemContent>
                                <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeContainer(item.id)}
                                    disabled={isBusy}
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => beginEditContainer(item.id)}
                                    disabled={isBusy}
                                  >
                                    <IconPencil data-icon="inline-start" />
                                    编辑
                                  </Button>
                                </ItemActions>
                              </Item>
                            ))}
                          </ItemGroup>
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                            <div className={cn("text-sm font-semibold", submitError === POD_REQUIRED_MESSAGE && "text-destructive")}>
                              暂无容器配置
                            </div>
                            <div
                              className={cn(
                                "mt-1 text-sm text-muted-foreground",
                                submitError === POD_REQUIRED_MESSAGE && "text-destructive"
                              )}
                            >
                              {submitError === POD_REQUIRED_MESSAGE
                                ? POD_REQUIRED_MESSAGE
                                : "点击下方“添加容器”录入镜像信息。"}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="mt-3 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={addContainer}
                          disabled={isBusy}
                        >
                          <span className="text-sm font-semibold">添加容器</span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            新增一条容器镜像配置。
                          </span>
                        </button>
                      </div>
                    </div>
                  </Field>
                </FieldGroup>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <h3 className="text-[15px] font-semibold">
                    {activeStep === "storage" ? "存储设置" : "高级设置"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{resolveStepDescription(activeStep)}</p>
                </div>
              </div>
            )}

            {submitError && !(isPodStep && submitError === POD_REQUIRED_MESSAGE) ? (
              <FieldError className="mt-4">{submitError}</FieldError>
            ) : null}
          </div>

          {yamlMode ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
                <Button type="button" onClick={() => void handleCreate()} disabled={isBusy}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                </Button>
              </div>
            </DialogFooter>
          ) : isBasicStep ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
                <Button type="button" onClick={() => void goNext()} disabled={isBusy}>
                  {checkingNext ? "校验中..." : "下一步"}
                </Button>
              </div>
            </DialogFooter>
          ) : isFinalStep ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={isBusy}>
                  上一步
                </Button>
                <Button type="button" onClick={() => void handleCreate()} disabled={isBusy}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={!canNavigateStep}>
                  上一步
                </Button>
                <Button type="button" onClick={() => void goNext()} disabled={!canNavigateStep}>
                  下一步
                </Button>
              </div>
            </DialogFooter>
          )}
        </div>
        <CreateContainerDialog
          open={containerDialogOpen}
          onOpenChange={setContainerDialogOpen}
          container={editingContainer}
          imageError={editingImageError}
          portFieldErrors={editingPortFieldErrors}
          isBusy={isBusy}
          onChange={(field, value) => {
            if (!editingContainer) return
            updateContainer(editingContainer.id, field, value)
          }}
          onAddPort={() => {
            if (!editingContainer) return
            addContainerPort(editingContainer.id)
          }}
          onUpdatePort={(portId, field, value) => {
            if (!editingContainer) return
            updateContainerPort(editingContainer.id, portId, field, value)
          }}
          onRemovePort={(portId) => {
            if (!editingContainer) return
            removeContainerPort(editingContainer.id, portId)
          }}
          onCancel={cancelEditContainer}
          onConfirm={returnToPodList}
        />
      </DialogContent>
    </Dialog>
  )
}
