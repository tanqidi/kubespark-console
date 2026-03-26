"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"
import {
  IconAdjustments,
  IconAdjustmentsHorizontal,
  IconPlus,
  IconSettings2,
  IconTrash,
} from "@tabler/icons-react"
import { parse, stringify } from "yaml"

import { checkServiceExists, createService, updateService } from "@/app/lib/kubespark/services"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  WorkloadPickerDialog,
} from "@/app/(examples)/dashboard/components/resource-pages/workload-picker-dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"
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

type NamespaceOption = {
  id: string
  name: string
}

type ServiceCreateStep = "basic" | "service" | "advanced"

type InternalAccessMode = "virtual-ip" | "headless"

type SelectorItem = {
  id: string
  key: string
  value: string
}

type PortItem = {
  id: string
  protocol: "TCP" | "UDP" | "SCTP"
  name: string
  targetPort: string
  servicePort: string
}

type ServicePortFieldErrors = Record<string, { name?: string; targetPort?: string; servicePort?: string }>

type CreateServiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespaceOptions: NamespaceOption[]
  mode?: "create" | "edit"
  initialValues?: ServiceDialogInitialValues | null
  onSubmitted?: () => void | Promise<void>
}

export type ServiceDialogInitialValues = {
  name: string
  namespace: string
  description?: string
  internalAccessMode: InternalAccessMode
  selectors: Array<{ key: string; value: string }>
  ports: Array<{
    protocol: PortItem["protocol"]
    name: string
    targetPort: string
    servicePort: string
  }>
  enableNodePort: boolean
  enableSessionAffinity: boolean
}

type JsonObject = Record<string, unknown>

type ServiceDialogSnapshot = {
  name: string
  namespace: string
  description: string
  internalAccessMode: InternalAccessMode
  selectorItems: SelectorItem[]
  portItems: PortItem[]
  enableNodePort: boolean
  enableSessionAffinity: boolean
}

type PendingDeleteTarget =
  | { kind: "selector"; id: string }
  | { kind: "port"; id: string }
  | null

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

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"

function validateName(value: string): string | null {
  if (!value) return "请输入名称"
  if (value.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(value)) {
    return NAME_RULE_MESSAGE
  }
  return null
}

const PORT_PROTOCOL_OPTIONS = [
  "TCP",
  "UDP",
  "SCTP",
] as const

const PORT_PROTOCOL_SET = new Set<string>(PORT_PROTOCOL_OPTIONS)

function createUniqueId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createSelectorItem(): SelectorItem {
  return {
    id: createUniqueId("svc-selector"),
    key: "",
    value: "",
  }
}

function createPortItem(
  defaults?: Partial<Omit<PortItem, "id">>
): PortItem {
  const protocol = defaults?.protocol ?? "TCP"
  return {
    id: createUniqueId("svc-port"),
    protocol,
    name: defaults?.name ?? `${resolveProtocolNamePrefix(protocol)}-`,
    targetPort: defaults?.targetPort ?? "",
    servicePort: defaults?.servicePort ?? "",
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

function resolveProtocolFromYaml(value: unknown): PortItem["protocol"] {
  const next = asString(value).trim().toUpperCase()
  return PORT_PROTOCOL_SET.has(next) ? (next as PortItem["protocol"]) : "TCP"
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

const AUTO_PROTOCOL_PREFIX_SET = new Set([
  "tcp",
  "udp",
  "sctp",
])

function resolveProtocolNamePrefix(protocol: PortItem["protocol"]): string {
  return protocol.toLowerCase()
}

function buildAutoPortName(protocol: PortItem["protocol"], portText: string): string | null {
  const normalized = portText.trim()
  if (!/^\d+$/.test(normalized)) return null
  return `${resolveProtocolNamePrefix(protocol)}-${normalized}`
}

function replaceProtocolPrefixInName(
  name: string,
  nextProtocol: PortItem["protocol"]
): string | null {
  const trimmed = name.trim()
  const parts = trimmed.split("-")
  if (parts.length < 2) return null

  const firstPart = parts[0]?.toLowerCase() ?? ""
  if (!AUTO_PROTOCOL_PREFIX_SET.has(firstPart)) return null

  const tail = parts.slice(1).join("-")
  return tail.trim()
    ? `${resolveProtocolNamePrefix(nextProtocol)}-${tail}`
    : `${resolveProtocolNamePrefix(nextProtocol)}-`
}

function buildServiceManifest(snapshot: ServiceDialogSnapshot): JsonObject {
  const metadata: JsonObject = {}
  const annotations: JsonObject = {}

  if (snapshot.name.trim()) metadata.name = snapshot.name.trim().toLowerCase()
  if (snapshot.namespace.trim()) metadata.namespace = snapshot.namespace.trim()
  if (snapshot.description.trim()) annotations.description = snapshot.description.trim()
  if (Object.keys(annotations).length > 0) metadata.annotations = annotations

  const selector = Object.fromEntries(
    snapshot.selectorItems
      .map((item) => ({ key: item.key.trim(), value: item.value.trim() }))
      .filter((item) => item.key && item.value)
      .map((item) => [item.key, item.value])
  )

  const ports = snapshot.portItems
    .map((item) => {
      const name = item.name.trim()
      const targetPort = item.targetPort.trim()
      const servicePort = item.servicePort.trim()

      if (!name && !targetPort && !servicePort) return null

      const parsedServicePort = Number(servicePort)
      const parsedTargetPort = Number(targetPort)

      return {
        protocol: item.protocol,
        ...(name ? { name } : {}),
        ...(Number.isFinite(parsedServicePort) && servicePort ? { port: parsedServicePort } : {}),
        ...(Number.isFinite(parsedTargetPort) && targetPort ? { targetPort: parsedTargetPort } : {}),
      }
    })
    .filter((item): item is Record<string, unknown> => item !== null)

  const spec: JsonObject = {
    type:
      snapshot.internalAccessMode === "headless"
        ? "ClusterIP"
        : snapshot.enableNodePort
          ? "NodePort"
          : "ClusterIP",
    sessionAffinity: snapshot.enableSessionAffinity ? "ClientIP" : "None",
  }

  if (snapshot.internalAccessMode === "headless") {
    spec.clusterIP = "None"
  }

  if (Object.keys(selector).length > 0) {
    spec.selector = selector
  }

  if (ports.length > 0) {
    spec.ports = ports
  }

  return {
    apiVersion: "v1",
    kind: "Service",
    metadata,
    spec,
  }
}

function buildServiceYamlText(snapshot: ServiceDialogSnapshot): string {
  return stringify(buildServiceManifest(snapshot), {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  })
}

function parseServiceYamlText(yamlText: string): ServiceDialogSnapshot {
  const normalizedText = yamlText.trim()
  if (!normalizedText) throw new Error("请输入 YAML 内容")

  const root = asObject(parse(normalizedText))
  if (Object.keys(root).length === 0) throw new Error("YAML 内容格式无效")

  const actualKind = asString(root.kind)
  if (actualKind && actualKind !== "Service") {
    throw new Error("YAML 资源类型必须是 Service")
  }

  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
  const spec = asObject(root.spec)

  const internalAccessMode: InternalAccessMode =
    asString(spec.clusterIP).trim() === "None" ? "headless" : "virtual-ip"

  const rawSelectors = asObject(spec.selector)
  const selectorEntries = Object.entries(rawSelectors).map(([key, value]) => ({
    key,
    value: asString(value),
  }))
  const selectorItems =
    selectorEntries.length > 0
      ? selectorEntries.map((item) =>
          createSelectorItemWithDefaults(item.key, item.value)
        )
      : []

  const rawPorts = Array.isArray(spec.ports) ? spec.ports : []
  const portItems = rawPorts.map((rawPort) => {
    const portObj = asObject(rawPort)
    const protocol = resolveProtocolFromYaml(portObj.protocol)
    const name = asString(portObj.name).trim()
    const targetPortRaw = portObj.targetPort
    const portRaw = portObj.port

    const targetPort =
      typeof targetPortRaw === "number"
        ? String(targetPortRaw)
        : asString(targetPortRaw)
    const servicePort =
      typeof portRaw === "number" ? String(portRaw) : asString(portRaw)

    const autoName = buildAutoPortName(protocol, servicePort || targetPort) ?? ""

    return createPortItem({
      protocol,
      name: name || autoName,
      targetPort,
      servicePort,
    })
  })

  const type = asString(spec.type).trim().toUpperCase()
  const enableNodePort = internalAccessMode !== "headless" && type === "NODEPORT"
  const enableSessionAffinity = asString(spec.sessionAffinity).trim().toUpperCase() === "CLIENTIP"

  return {
    name: asString(metadata.name),
    namespace: asString(metadata.namespace),
    description: asString(annotations.description),
    internalAccessMode,
    selectorItems,
    portItems,
    enableNodePort,
    enableSessionAffinity,
  }
}

function validatePortItems(targetPorts: PortItem[]): {
  normalizedPorts: Array<{
    id: string
    protocol: PortItem["protocol"]
    name: string
    targetPort: string
    servicePort: string
  }>
  nextPortError: string | null
  nextPortFieldErrors: ServicePortFieldErrors
} {
  const normalizedPorts = targetPorts.map((item) => ({
    id: item.id,
    protocol: item.protocol,
    name: item.name.trim(),
    targetPort: item.targetPort.trim(),
    servicePort: item.servicePort.trim(),
  }))

  const nextPortFieldErrors: ServicePortFieldErrors = {}
  let nextPortError: string | null = null

  for (let index = 0; index < normalizedPorts.length; index += 1) {
    const item = normalizedPorts[index]
    const fieldError: ServicePortFieldErrors[string] = {}

    const hasName = Boolean(item.name)
    const hasTargetPort = Boolean(item.targetPort)
    const hasServicePort = Boolean(item.servicePort)

    if (!hasName) fieldError.name = "请输入名称"
    if (!hasTargetPort) fieldError.targetPort = "请输入容器端口"
    if (!hasServicePort) fieldError.servicePort = "请输入服务端口"

    if (hasTargetPort) {
      if (!/^\d+$/.test(item.targetPort)) {
        fieldError.targetPort = "容器端口格式无效"
      } else {
        const targetPortNumber = Number(item.targetPort)
        if (targetPortNumber < 0 || targetPortNumber > 65535) {
          fieldError.targetPort = "容器端口超出范围（0-65535）"
        }
      }
    }

    if (hasServicePort) {
      if (!/^\d+$/.test(item.servicePort)) {
        fieldError.servicePort = "服务端口格式无效"
      } else {
        const servicePortNumber = Number(item.servicePort)
        if (servicePortNumber < 0 || servicePortNumber > 65535) {
          fieldError.servicePort = "服务端口超出范围（0-65535）"
        }
      }
    }

    if (fieldError.name || fieldError.targetPort || fieldError.servicePort) {
      nextPortFieldErrors[item.id] = fieldError
      if (!nextPortError) {
        if (!hasName || !hasTargetPort || !hasServicePort) {
          nextPortError = `第 ${index + 1} 个端口需完整填写名称、容器端口和服务端口`
        } else if (fieldError.targetPort) {
          nextPortError = `第 ${index + 1} 个端口的容器端口校验失败`
        } else if (fieldError.servicePort) {
          nextPortError = `第 ${index + 1} 个端口的服务端口校验失败`
        }
      }
    }
  }

  const nameBuckets = new Map<string, string[]>()
  const targetPortBuckets = new Map<string, string[]>()
  const servicePortBuckets = new Map<string, string[]>()

  for (const item of normalizedPorts) {
    if (item.name) {
      const key = item.name.toLowerCase()
      const ids = nameBuckets.get(key) ?? []
      ids.push(item.id)
      nameBuckets.set(key, ids)
    }
    if (item.targetPort) {
      const key = `${item.protocol}:${item.targetPort}`
      const ids = targetPortBuckets.get(key) ?? []
      ids.push(item.id)
      targetPortBuckets.set(key, ids)
    }
    if (item.servicePort) {
      const key = `${item.protocol}:${item.servicePort}`
      const ids = servicePortBuckets.get(key) ?? []
      ids.push(item.id)
      servicePortBuckets.set(key, ids)
    }
  }

  for (const ids of nameBuckets.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const row = nextPortFieldErrors[id] ?? {}
      row.name = row.name ?? "端口名称重复"
      nextPortFieldErrors[id] = row
    }
    if (!nextPortError) {
      nextPortError = "存在重复的端口名称，请调整后重试"
    }
  }

  for (const ids of targetPortBuckets.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const row = nextPortFieldErrors[id] ?? {}
      row.targetPort = row.targetPort ?? "同一协议下容器端口重复"
      nextPortFieldErrors[id] = row
    }
    if (!nextPortError) {
      nextPortError = "存在重复的容器端口，请调整后重试"
    }
  }

  for (const ids of servicePortBuckets.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      const row = nextPortFieldErrors[id] ?? {}
      row.servicePort = row.servicePort ?? "同一协议下服务端口重复"
      nextPortFieldErrors[id] = row
    }
    if (!nextPortError) {
      nextPortError = "存在重复的服务端口，请调整后重试"
    }
  }

  return {
    normalizedPorts,
    nextPortError,
    nextPortFieldErrors,
  }
}

function resolveFirstServicePortErrorFieldId(
  ports: PortItem[],
  errors: ServicePortFieldErrors
): string | null {
  for (const item of ports) {
    const fieldError = errors[item.id]
    if (!fieldError) continue
    if (fieldError.name) return `service-port-${item.id}-name`
    if (fieldError.targetPort) return `service-port-${item.id}-target-port`
    if (fieldError.servicePort) return `service-port-${item.id}-service-port`
  }
  return null
}

function createSelectorItemWithDefaults(key: string, value: string): SelectorItem {
  return {
    ...createSelectorItem(),
    key,
    value,
  }
}

export function CreateServiceDialog({
  open,
  onOpenChange,
  namespaceOptions,
  mode = "create",
  initialValues = null,
  onSubmitted,
}: CreateServiceDialogProps) {
  const isEditMode = mode === "edit"
  const [activeStep, setActiveStep] = React.useState<ServiceCreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [internalAccessMode, setInternalAccessMode] = React.useState<InternalAccessMode>("virtual-ip")
  const [selectorItems, setSelectorItems] = React.useState<SelectorItem[]>([])
  const [portItems, setPortItems] = React.useState<PortItem[]>([])
  const [workloadPickerOpen, setWorkloadPickerOpen] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [selectorError, setSelectorError] = React.useState<string | null>(null)
  const [portError, setPortError] = React.useState<string | null>(null)
  const [portFieldErrors, setPortFieldErrors] = React.useState<ServicePortFieldErrors>({})
  const [stepError, setStepError] = React.useState<string | null>(null)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [basicCompleted, setBasicCompleted] = React.useState(false)
  const [serviceCompleted, setServiceCompleted] = React.useState(false)
  const [enableNodePort, setEnableNodePort] = React.useState(false)
  const [enableSessionAffinity, setEnableSessionAffinity] = React.useState(false)
  const [yamlMode, setYamlMode] = React.useState(false)
  const [yamlText, setYamlText] = React.useState("")
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteTarget, setPendingDeleteTarget] = React.useState<PendingDeleteTarget>(null)
  const [selectorAddPromptOpen, setSelectorAddPromptOpen] = React.useState(false)
  const [selectorAddPromptShown, setSelectorAddPromptShown] = React.useState(false)
  const lastFocusedPortErrorFieldRef = React.useRef<string>("")
  const isBusy = checkingNext || creating

  const title = isEditMode ? "编辑服务" : "创建服务"
  const descriptionText = isEditMode
    ? "编辑 Kubernetes Service 的配置内容。"
    : "使用 Kubernetes Service 创建网络访问入口。"

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setName("")
      setNamespace("")
      setDescription("")
      setInternalAccessMode("virtual-ip")
      setSelectorItems([])
      setPortItems([])
      setWorkloadPickerOpen(false)
      setNameError(null)
      setNamespaceError(null)
      setSelectorError(null)
      setPortError(null)
      setPortFieldErrors({})
      setStepError(null)
      setCheckingNext(false)
      setCreating(false)
      setBasicCompleted(false)
      setServiceCompleted(false)
      setEnableNodePort(false)
      setEnableSessionAffinity(false)
      setYamlMode(false)
      setYamlText("")
      setYamlError(null)
      setPendingDeleteTarget(null)
      setSelectorAddPromptOpen(false)
      setSelectorAddPromptShown(false)
    }
  }, [open])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return

    setActiveStep("basic")
    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
    setInternalAccessMode(initialValues.internalAccessMode)
    setSelectorItems(
      initialValues.selectors.length > 0
        ? initialValues.selectors.map((item) => createSelectorItemWithDefaults(item.key, item.value))
        : []
    )
    setPortItems(
      initialValues.ports.map((item) =>
        createPortItem({
          protocol: item.protocol,
          name: item.name,
          targetPort: item.targetPort,
          servicePort: item.servicePort,
        })
      )
    )
    setEnableNodePort(initialValues.enableNodePort)
    setEnableSessionAffinity(initialValues.enableSessionAffinity)
    setNameError(null)
    setNamespaceError(null)
    setSelectorError(null)
    setPortError(null)
    setPortFieldErrors({})
    setStepError(null)
    setYamlMode(false)
    setYamlText("")
    setYamlError(null)
    setBasicCompleted(true)
    setServiceCompleted(true)
    setSelectorAddPromptShown(initialValues.selectors.length > 0)
  }, [initialValues, isEditMode, open])

  React.useEffect(() => {
    if (internalAccessMode === "headless" && enableNodePort) {
      setEnableNodePort(false)
    }
  }, [enableNodePort, internalAccessMode])

  React.useEffect(() => {
    if (selectorItems.length > 0 && !selectorAddPromptShown) {
      setSelectorAddPromptShown(true)
    }
  }, [selectorAddPromptShown, selectorItems.length])

  React.useEffect(() => {
    if (yamlMode || activeStep !== "service") return
    const firstErrorFieldId = resolveFirstServicePortErrorFieldId(portItems, portFieldErrors)
    if (!firstErrorFieldId) {
      lastFocusedPortErrorFieldRef.current = ""
      return
    }
    if (lastFocusedPortErrorFieldRef.current === firstErrorFieldId) return

    const target = document.getElementById(firstErrorFieldId) as HTMLInputElement | null
    if (!target) return

    lastFocusedPortErrorFieldRef.current = firstErrorFieldId
    target.scrollIntoView({ behavior: "smooth", block: "center" })
    window.setTimeout(() => {
      target.focus()
    }, 0)
  }, [activeStep, portFieldErrors, portItems, yamlMode])

  const getSnapshot = React.useCallback(
    (): ServiceDialogSnapshot => ({
      name,
      namespace,
      description,
      internalAccessMode,
      selectorItems,
      portItems,
      enableNodePort,
      enableSessionAffinity,
    }),
    [
      description,
      enableNodePort,
      enableSessionAffinity,
      internalAccessMode,
      name,
      namespace,
      portItems,
      selectorItems,
    ]
  )

  const applySnapshot = React.useCallback((snapshot: ServiceDialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
    setInternalAccessMode(snapshot.internalAccessMode)
    setSelectorItems(snapshot.selectorItems)
    setPortItems(snapshot.portItems)
    setEnableNodePort(snapshot.enableNodePort)
    setEnableSessionAffinity(snapshot.enableSessionAffinity)
    setNameError(null)
    setNamespaceError(null)
    setSelectorError(null)
    setPortError(null)
    setPortFieldErrors({})
    setStepError(null)
  }, [])

  const handleYamlModeChange = React.useCallback(
    (checked: boolean) => {
      if (isBusy) return

      if (checked) {
        setYamlText(buildServiceYamlText(getSnapshot()))
        setYamlError(null)
        setYamlMode(true)
        return
      }

      try {
        const parsed = parseServiceYamlText(yamlText)
        const nextSnapshot =
          isEditMode && initialValues
            ? {
                ...parsed,
                name: initialValues.name,
                namespace: initialValues.namespace,
              }
            : parsed
        applySnapshot(nextSnapshot)
        setYamlError(null)
        setYamlMode(false)
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
      }
    },
    [applySnapshot, getSnapshot, initialValues, isBusy, isEditMode, yamlText]
  )

  const handleBasicNext = React.useCallback(async () => {
    if (checkingNext) return

    const normalizedName = (isEditMode && initialValues ? initialValues.name : name).trim().toLowerCase()
    const normalizedNamespace = (isEditMode && initialValues ? initialValues.namespace : namespace).trim()
    const nextNameError = validateName(normalizedName)
    const nextNamespaceError = normalizedNamespace ? null : "请选择项目"

    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    setStepError(null)

    if (nextNameError || nextNamespaceError) return

    if (isEditMode) {
      setBasicCompleted(true)
      setActiveStep("service")
      return
    }

    setCheckingNext(true)
    try {
      const exists = await checkServiceExists({
        name: normalizedName,
        namespace: normalizedNamespace,
      })
      if (exists) {
        setNameError("服务名称已存在，请更换后重试")
        return
      }

      setBasicCompleted(true)
      setActiveStep("service")
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "服务名称校验失败，请稍后重试")
    } finally {
      setCheckingNext(false)
    }
  }, [checkingNext, initialValues, isEditMode, name, namespace])

  const handleServiceNext = React.useCallback(() => {
    const normalizedSelectors = selectorItems.map((item) => ({
      key: item.key.trim(),
      value: item.value.trim(),
    }))
    const filledSelectors = normalizedSelectors.filter((item) => item.key || item.value)

    let nextSelectorError: string | null = null
    if (filledSelectors.length === 0) {
      nextSelectorError = "请至少添加一个工作负载选择器"
    }

    if (!nextSelectorError) {
      for (let index = 0; index < filledSelectors.length; index += 1) {
        const item = filledSelectors[index]
        if (!item.key || !item.value) {
          nextSelectorError = `第 ${index + 1} 个工作负载选择器需同时填写键和值`
          break
        }
      }
    }

    if (!nextSelectorError) {
      const seen = new Set<string>()
      for (const item of filledSelectors) {
        if (seen.has(item.key)) {
          nextSelectorError = `工作负载选择器键 ${item.key} 重复，请更换后重试`
          break
        }
        seen.add(item.key)
      }
    }

    const { nextPortError, nextPortFieldErrors } = validatePortItems(portItems)

    setSelectorError(nextSelectorError)
    setPortError(nextPortError)
    setPortFieldErrors(nextPortFieldErrors)
    setStepError(null)

    if (nextSelectorError || nextPortError) return

    setServiceCompleted(true)
    setActiveStep("advanced")
  }, [portItems, selectorItems])

  const validateServiceFields = React.useCallback(
    (sourceSelectorItems?: SelectorItem[], sourcePortItems?: PortItem[]) => {
    const targetSelectors = sourceSelectorItems ?? selectorItems
    const targetPorts = sourcePortItems ?? portItems

    const normalizedSelectors = targetSelectors.map((item) => ({
      key: item.key.trim(),
      value: item.value.trim(),
    }))
    const filledSelectors = normalizedSelectors.filter((item) => item.key || item.value)

    let nextSelectorError: string | null = null
    if (filledSelectors.length === 0) {
      nextSelectorError = "请至少添加一个工作负载选择器"
    }

    if (!nextSelectorError) {
      for (let index = 0; index < filledSelectors.length; index += 1) {
        const item = filledSelectors[index]
        if (!item.key || !item.value) {
          nextSelectorError = `第 ${index + 1} 个工作负载选择器需同时填写键和值`
          break
        }
      }
    }

    if (!nextSelectorError) {
      const seen = new Set<string>()
      for (const item of filledSelectors) {
        if (seen.has(item.key)) {
          nextSelectorError = `工作负载选择器键 ${item.key} 重复，请更换后重试`
          break
        }
        seen.add(item.key)
      }
    }

    const { normalizedPorts, nextPortError, nextPortFieldErrors } = validatePortItems(targetPorts)

    return {
      nextSelectorError,
      nextPortError,
      nextPortFieldErrors,
      filledSelectors,
      normalizedPorts,
    }
  }, [portItems, selectorItems])

  const submitService = React.useCallback(
    async (
      normalizedName: string,
      normalizedNamespace: string,
      filledSelectors: Array<{ key: string; value: string }>,
      normalizedPorts: Array<{
        protocol: PortItem["protocol"]
        name: string
        targetPort: string
        servicePort: string
      }>,
      useDraft?: ServiceDialogSnapshot
    ) => {
      const source =
        useDraft
        ? {
            description: useDraft.description,
            internalAccessMode: useDraft.internalAccessMode,
            enableNodePort: useDraft.enableNodePort,
            enableSessionAffinity: useDraft.enableSessionAffinity,
          }
        : {
            description,
            internalAccessMode,
            enableNodePort,
            enableSessionAffinity,
          }

      const payload = {
        name: normalizedName,
        namespace: normalizedNamespace,
        description: source.description.trim(),
        internalAccessMode: source.internalAccessMode,
        enableNodePort: source.enableNodePort,
        enableSessionAffinity: source.enableSessionAffinity,
        selectors: Object.fromEntries(filledSelectors.map((item) => [item.key, item.value])),
        ports: normalizedPorts.map((item) => ({
          protocol: item.protocol,
          name: item.name,
          targetPort: Number(item.targetPort),
          servicePort: Number(item.servicePort),
        })),
      }

      if (isEditMode) {
        await updateService(payload)
      } else {
        await createService(payload)
      }
    },
    [description, enableNodePort, enableSessionAffinity, internalAccessMode, isEditMode]
  )

  const handleCreateSubmit = React.useCallback(async () => {
    if (isBusy) return

    let draft: ServiceDialogSnapshot | undefined
    if (yamlMode) {
      try {
        draft = parseServiceYamlText(yamlText)
        if (isEditMode && initialValues) {
          draft = {
            ...draft,
            name: initialValues.name,
            namespace: initialValues.namespace,
          }
        }
        applySnapshot(draft)
        setYamlError(null)
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
        return
      }
    }

    const source = draft ?? getSnapshot()
    const normalizedName = (isEditMode && initialValues ? initialValues.name : source.name).trim().toLowerCase()
    const normalizedNamespace = (isEditMode && initialValues ? initialValues.namespace : source.namespace).trim()
    const nextNameError = validateName(normalizedName)
    const nextNamespaceError = normalizedNamespace ? null : "请选择项目"
    const {
      nextSelectorError,
      nextPortError,
      nextPortFieldErrors,
      filledSelectors,
      normalizedPorts,
    } = validateServiceFields(
      source.selectorItems,
      source.portItems
    )

    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    setSelectorError(nextSelectorError)
    setPortError(nextPortError)
    setPortFieldErrors(nextPortFieldErrors)
    setStepError(null)

    if (nextNameError || nextNamespaceError) {
      if (yamlMode) setYamlError(nextNameError ?? nextNamespaceError)
      setActiveStep("basic")
      return
    }
    if (nextSelectorError || nextPortError) {
      if (yamlMode) setYamlError(nextSelectorError ?? nextPortError)
      setActiveStep("service")
      return
    }

    setCreating(true)
    try {
      await submitService(normalizedName, normalizedNamespace, filledSelectors, normalizedPorts, source)
      await onSubmitted?.()
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "创建服务失败，请稍后重试"
      const lower = message.toLowerCase()
      if (
        lower.includes("already exists") ||
        lower.includes("状态码 409") ||
        message.includes("已存在")
      ) {
        setNameError(isEditMode ? "服务名称冲突，请稍后重试" : "服务名称已存在，请更换后重试")
        if (yamlMode) setYamlError(isEditMode ? "服务名称冲突，请稍后重试" : "服务名称已存在，请更换后重试")
        setActiveStep("basic")
      } else {
        if (yamlMode) setYamlError(message)
        setStepError(message)
      }
    } finally {
      setCreating(false)
    }
  }, [
    applySnapshot,
    getSnapshot,
    initialValues,
    isBusy,
    isEditMode,
    onOpenChange,
    onSubmitted,
    submitService,
    validateServiceFields,
    yamlMode,
    yamlText,
  ])

  const canNavigateService = basicCompleted
  const canNavigateAdvanced = basicCompleted && serviceCompleted

  const updateSelectorItem = React.useCallback(
    (id: string, field: "key" | "value", value: string) => {
      setSelectorItems((current) =>
        current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
      )
      setServiceCompleted(false)
      if (selectorError) setSelectorError(null)
      if (stepError) setStepError(null)
    },
    [selectorError, stepError]
  )

  const removeSelectorItem = React.useCallback(
    (id: string) => {
      setSelectorItems((current) => {
        const next = current.filter((item) => item.id !== id)
        return next
      })
      setServiceCompleted(false)
      if (selectorError) setSelectorError(null)
      if (stepError) setStepError(null)
    },
    [selectorError, stepError]
  )

  const addSelectorItem = React.useCallback(() => {
    if (selectorItems.length === 0 && !selectorAddPromptShown) {
      setSelectorAddPromptOpen(true)
      return
    }
    setSelectorItems((current) => [...current, createSelectorItem()])
    setServiceCompleted(false)
    if (selectorError) setSelectorError(null)
    if (stepError) setStepError(null)
    setSelectorAddPromptShown(true)
  }, [selectorAddPromptShown, selectorError, selectorItems.length, stepError])

  const handleConfirmSelectorAdd = React.useCallback(() => {
    setSelectorAddPromptOpen(false)
    setSelectorAddPromptShown(true)
    setSelectorItems((current) =>
      current.length === 0 ? [createSelectorItem()] : [...current, createSelectorItem()]
    )
    setServiceCompleted(false)
    if (selectorError) setSelectorError(null)
    if (stepError) setStepError(null)
  }, [selectorError, stepError])

  const updatePortItem = React.useCallback(
    (id: string, field: keyof Omit<PortItem, "id">, value: string) => {
      setPortItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item

          if (field === "targetPort") {
            const nextTargetPort = value
            const shouldSyncServicePort =
              !item.servicePort.trim() || item.servicePort.trim() === item.targetPort.trim()
            const nextServicePort = shouldSyncServicePort ? value : item.servicePort
            const namePrefix = item.name.trim().split("-")[0]?.toLowerCase() ?? ""
            const isAutoManagedName =
              !item.name.trim() || AUTO_PROTOCOL_PREFIX_SET.has(namePrefix)
            const fallbackPort = nextTargetPort.trim() || nextServicePort.trim()
            const nextAutoName = fallbackPort
              ? buildAutoPortName(item.protocol, fallbackPort) ?? `${resolveProtocolNamePrefix(item.protocol)}-`
              : `${resolveProtocolNamePrefix(item.protocol)}-`

            const next: PortItem = {
              ...item,
              targetPort: value,
              servicePort: nextServicePort,
            }

            if (isAutoManagedName) {
              next.name = nextAutoName
            }

            return next
          }

          if (field !== "protocol") {
            return { ...item, [field]: value }
          }

          const nextProtocol = value as PortItem["protocol"]
          const next: PortItem = {
            ...item,
            protocol: nextProtocol,
          }

          const replacedName = replaceProtocolPrefixInName(item.name, nextProtocol)
          if (replacedName) {
            return {
              ...next,
              name: replacedName,
            }
          }

          if (!item.name.trim()) {
            const fallbackPort = item.servicePort || item.targetPort
            const autoName = buildAutoPortName(nextProtocol, fallbackPort)
            if (autoName) {
              return {
                ...next,
                name: autoName,
              }
            }
            return {
              ...next,
              name: `${resolveProtocolNamePrefix(nextProtocol)}-`,
            }
          }

          return next
        })
      )
      setServiceCompleted(false)
      if (portError) setPortError(null)
      setPortFieldErrors((current) => {
        if (!current[id] || field === "protocol") return current
        const rowError = { ...current[id] }
        delete rowError[field]
        if (field === "targetPort") {
          delete rowError.servicePort
        }
        if (Object.keys(rowError).length === 0) {
          const next = { ...current }
          delete next[id]
          return next
        }
        return {
          ...current,
          [id]: rowError,
        }
      })
      if (stepError) setStepError(null)
    },
    [portError, stepError]
  )

  const addPortItem = React.useCallback(() => {
    setPortItems((current) => [...current, createPortItem()])
    setServiceCompleted(false)
    if (portError) setPortError(null)
    setPortFieldErrors({})
    if (stepError) setStepError(null)
  }, [portError, stepError])

  const removePortItem = React.useCallback(
    (id: string) => {
      setPortItems((current) => current.filter((item) => item.id !== id))
      setServiceCompleted(false)
      if (portError) setPortError(null)
      setPortFieldErrors((current) => {
        if (!current[id]) return current
        const next = { ...current }
        delete next[id]
        return next
      })
      if (stepError) setStepError(null)
    },
    [portError, stepError]
  )

  const requestRemoveSelectorItem = React.useCallback(
    (id: string) => {
      const current = selectorItems.find((item) => item.id === id)
      if (!current) return
      const isEmpty = !current.key.trim() && !current.value.trim()
      if (isEmpty) {
        removeSelectorItem(id)
        return
      }
      setPendingDeleteTarget({ kind: "selector", id })
    },
    [removeSelectorItem, selectorItems]
  )

  const requestRemovePortItem = React.useCallback(
    (id: string) => {
      const current = portItems.find((item) => item.id === id)
      if (!current) return
      const isEmpty =
        !current.name.trim() &&
        !current.targetPort.trim() &&
        !current.servicePort.trim()
      if (isEmpty) {
        removePortItem(id)
        return
      }
      setPendingDeleteTarget({ kind: "port", id })
    },
    [portItems, removePortItem]
  )

  const handleConfirmDeleteItem = React.useCallback(() => {
    if (!pendingDeleteTarget) return
    if (pendingDeleteTarget.kind === "selector") {
      removeSelectorItem(pendingDeleteTarget.id)
    } else {
      removePortItem(pendingDeleteTarget.id)
    }
    setPendingDeleteTarget(null)
  }, [pendingDeleteTarget, removePortItem, removeSelectorItem])

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
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{descriptionText}</DialogDescription>
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
                  status: activeStep === "basic" ? "当前" : basicCompleted ? "已设置" : "未设置",
                  active: activeStep === "basic",
                  icon: <IconSettings2 className="size-4" />,
                  disabled: isBusy,
                  onClick: () => setActiveStep("basic"),
                },
                {
                  id: "service",
                  title: "服务设置",
                  status:
                      activeStep === "service"
                          ? "当前"
                          : serviceCompleted
                              ? "已设置"
                              : "未设置",
                  active: activeStep === "service",
                  icon: <IconAdjustmentsHorizontal className="size-4" />,
                  disabled: isBusy || !canNavigateService,
                  onClick: () => setActiveStep("service"),
                },
                {
                  id: "advanced",
                  title: "高级设置",
                  status:
                    activeStep === "advanced"
                      ? "当前"
                      : enableNodePort || enableSessionAffinity
                        ? "已设置"
                        : "未设置",
                  active: activeStep === "advanced",
                  icon: <IconAdjustments className="size-4" />,
                  disabled: isBusy || !canNavigateAdvanced,
                  onClick: () => setActiveStep("advanced"),
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
          ) : activeStep === "basic" ? (
            <div>
              <div className="mb-4">
                <h3 className="text-[15px] font-semibold">基本信息</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  填写服务名称、所属项目和描述信息。
                </p>
              </div>
              <FieldGroup className="grid gap-6 md:grid-cols-2">
                <Field data-invalid={Boolean(nameError)}>
                  <FieldLabel htmlFor="service-create-name">名称</FieldLabel>
                  <Input
                    id="service-create-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value)
                      if (nameError) setNameError(null)
                      if (stepError) setStepError(null)
                    }}
                    placeholder="请输入服务名称"
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
                  <FieldLabel htmlFor="service-create-namespace">项目</FieldLabel>
                  <Select
                    value={namespace}
                    onValueChange={(value) => {
                      if (isEditMode) return
                      setNamespace(value)
                      if (namespaceError) setNamespaceError(null)
                      if (stepError) setStepError(null)
                    }}
                    disabled={isBusy || isEditMode}
                  >
                    <SelectTrigger
                      id="service-create-namespace"
                      aria-invalid={Boolean(namespaceError)}
                    >
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
                    <FieldDescription>选择服务所属项目。</FieldDescription>
                  )}
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="service-create-description">描述</FieldLabel>
                  <Textarea
                    id="service-create-description"
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
          ) : activeStep === "service" ? (
            <div>
              <div className="mb-4">
                <h3 className="text-[15px] font-semibold">服务设置</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  设置内部访问模式、工作负载选择器和服务端口。
                </p>
              </div>
              <div className="flex flex-col gap-6">
                  <Field>
                    <FieldLabel htmlFor="service-access-mode">内部访问模式</FieldLabel>
                    <Select
                        value={internalAccessMode}
                        onValueChange={(value) => {
                          setInternalAccessMode(value as InternalAccessMode)
                          setServiceCompleted(false)
                          if (stepError) setStepError(null)
                        }}
                        disabled={isBusy}
                    >
                      <SelectTrigger id="service-access-mode">
                        <SelectValue placeholder="请选择内部访问模式" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="virtual-ip">虚拟 IP 地址（VirtualIP）</SelectItem>
                          <SelectItem value="headless">无头服务（Headless）</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {internalAccessMode === "headless"
                          ? "无头服务不会分配虚拟 IP，客户端将直接访问后端 Pod。"
                          : "为服务分配虚拟 IP，可在集群内部通过虚拟 IP 访问服务。"}
                    </FieldDescription>
                  </Field>

                  <Field data-invalid={Boolean(selectorError)}>
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel>工作负载选择器</FieldLabel>
                      <Button
                          type="button"
                          variant="outline"
                          onClick={() => setWorkloadPickerOpen(true)}
                          disabled={isBusy || !namespace.trim()}
                      >
                        指定工作负载
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-col gap-3">
                      {selectorItems.length > 0 ? (
                          selectorItems.map((item) => (
                              <div key={item.id} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                                <Input
                                    value={item.key}
                                    onChange={(event) =>
                                        updateSelectorItem(item.id, "key", event.target.value)
                                    }
                                    placeholder="键"
                                    disabled={isBusy}
                                />
                                <Input
                                    value={item.value}
                                    onChange={(event) =>
                                        updateSelectorItem(item.id, "value", event.target.value)
                                    }
                                    placeholder="值"
                                    disabled={isBusy}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => requestRemoveSelectorItem(item.id)}
                                    disabled={isBusy}
                                >
                                  <IconTrash data-icon="inline-start" />
                                  删除
                                </Button>
                              </div>
                          ))
                      ) : (
                          <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                            暂未指定工作负载，点击“指定工作负载”自动回填标签选择器。
                          </div>
                      )}
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" onClick={addSelectorItem} disabled={isBusy}>
                          <IconPlus data-icon="inline-start" />
                          添加
                        </Button>
                      </div>
                    </div>
                    {selectorError ? (
                        <FieldError>{selectorError}</FieldError>
                    ) : (
                        <FieldDescription>服务将根据此处标签路由到匹配的 Pod。</FieldDescription>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>端口</FieldLabel>
                    <div className="mt-3 flex flex-col gap-3">
                      {portItems.length > 0 ? (
                        portItems.map((item) => (
                            <div key={item.id} className="grid items-start gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                              <Select
                                  value={item.protocol}
                                  onValueChange={(value) =>
                                      updatePortItem(item.id, "protocol", value)
                                  }
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
                              <div className="flex min-w-0 flex-col gap-1">
                                <InputGroup>
                                  <InputGroupAddon>
                                    <InputGroupText>名称</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={`service-port-${item.id}-name`}
                                    value={item.name}
                                    onChange={(event) => updatePortItem(item.id, "name", event.target.value)}
                                    aria-invalid={Boolean(portFieldErrors[item.id]?.name)}
                                    disabled={isBusy}
                                  />
                                </InputGroup>
                                {portFieldErrors[item.id]?.name ? (
                                  <p className="text-xs text-destructive">{portFieldErrors[item.id]?.name}</p>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 flex-col gap-1">
                                <InputGroup>
                                  <InputGroupAddon>
                                    <InputGroupText>容器端口</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={`service-port-${item.id}-target-port`}
                                    value={item.targetPort}
                                    onChange={(event) =>
                                      updatePortItem(
                                        item.id,
                                        "targetPort",
                                        normalizePortInput(event.target.value)
                                      )
                                    }
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={5}
                                    aria-invalid={Boolean(portFieldErrors[item.id]?.targetPort)}
                                    disabled={isBusy}
                                  />
                                </InputGroup>
                                {portFieldErrors[item.id]?.targetPort ? (
                                  <p className="text-xs text-destructive">
                                    {portFieldErrors[item.id]?.targetPort}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex min-w-0 flex-col gap-1">
                                <InputGroup>
                                  <InputGroupAddon>
                                    <InputGroupText>服务端口</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={`service-port-${item.id}-service-port`}
                                    value={item.servicePort}
                                    onChange={(event) =>
                                      updatePortItem(
                                        item.id,
                                        "servicePort",
                                        normalizePortInput(event.target.value)
                                      )
                                    }
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={5}
                                    aria-invalid={Boolean(portFieldErrors[item.id]?.servicePort)}
                                    disabled={isBusy}
                                  />
                                </InputGroup>
                                {portFieldErrors[item.id]?.servicePort ? (
                                  <p className="text-xs text-destructive">
                                    {portFieldErrors[item.id]?.servicePort}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => requestRemovePortItem(item.id)}
                                  disabled={isBusy}
                              >
                                <IconTrash data-icon="inline-start" />
                                删除
                              </Button>
                            </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
                          当前未配置端口。若保持为空，将不校验端口项；添加端口后每行需完整填写三项。
                        </div>
                      )}
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" onClick={addPortItem} disabled={isBusy}>
                          <IconPlus data-icon="inline-start" />
                          添加
                        </Button>
                      </div>
                    </div>
                    <FieldDescription>设置服务端口映射。</FieldDescription>
                  </Field>
              </div>
            </div>
          ) : (
            <div>
              <div className="mb-4">
                <h3 className="text-[15px] font-semibold">高级设置</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  配置外部访问与会话保持策略。
                </p>
              </div>
              <div className="flex flex-col gap-4">
                <Item
                  variant="outline"
                  size="sm"
                  className="w-full cursor-pointer"
                  onClick={() => {
                    if (internalAccessMode === "headless" || isBusy) return
                    setEnableNodePort((current) => !current)
                  }}
                >
                  <Checkbox
                    checked={enableNodePort}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => {
                      if (internalAccessMode === "headless" || isBusy) return
                      setEnableNodePort(checked === true)
                    }}
                    aria-label="外部访问"
                    disabled={isBusy || internalAccessMode === "headless"}
                  />
                  <ItemContent>
                    <ItemTitle>外部访问</ItemTitle>
                    <ItemDescription>
                      启用后服务类型将设置为 NodePort，用于从集群外访问服务。
                      {internalAccessMode === "headless" ? (
                        <span className="font-semibold text-foreground">
                          {" "}当前为无头服务模式，不能开启外部访问。
                        </span>
                      ) : null}
                    </ItemDescription>
                  </ItemContent>
                </Item>

                <Item
                  variant="outline"
                  size="sm"
                  className="w-full cursor-pointer"
                  onClick={() => {
                    if (isBusy) return
                    setEnableSessionAffinity((current) => !current)
                  }}
                >
                  <Checkbox
                    checked={enableSessionAffinity}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={(checked) => {
                      if (isBusy) return
                      setEnableSessionAffinity(checked === true)
                    }}
                    aria-label="会话保持"
                    disabled={isBusy}
                  />
                  <ItemContent>
                    <ItemTitle>会话保持</ItemTitle>
                    <ItemDescription>
                      开启后将同一客户端请求保持到同一后端 Pod（ClientIP）。
                    </ItemDescription>
                  </ItemContent>
                </Item>
              </div>
            </div>
          )}

            {stepError ? <FieldError className="mt-4">{stepError}</FieldError> : null}
          </div>

          {yamlMode ? (
              <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
                <div className="flex w-full items-center justify-between gap-3">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isBusy}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={() => void handleCreateSubmit()} disabled={isBusy}>
                    {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                  </Button>
                </div>
              </DialogFooter>
          ) : activeStep === "basic" ? (
              <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
                <div className="flex w-full items-center justify-between gap-3">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isBusy}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={() => void handleBasicNext()} disabled={isBusy}>
                    {checkingNext ? "校验中..." : "下一步"}
                  </Button>
                </div>
              </DialogFooter>
          ) : activeStep === "service" ? (
              <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveStep("basic")}
                      disabled={isBusy}
                  >
                    上一步
                  </Button>
                  <Button type="button" onClick={handleServiceNext} disabled={isBusy}>
                    下一步
                  </Button>
                </div>
              </DialogFooter>
          ) : (
              <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
                <div className="flex w-full items-center justify-between gap-3">
                  <Button
                      type="button"
                      variant="outline"
                      onClick={() => setActiveStep("service")}
                      disabled={isBusy}
                  >
                    上一步
                  </Button>
                  <Button type="button" onClick={() => void handleCreateSubmit()} disabled={isBusy}>
                    {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                  </Button>
                </div>
              </DialogFooter>
          )}
        </div>

        <DeleteConfirmDialog
          open={Boolean(pendingDeleteTarget)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !isBusy) {
              setPendingDeleteTarget(null)
            }
          }}
          title={pendingDeleteTarget?.kind === "selector" ? "删除工作负载选择器" : "删除端口项"}
          description={
            pendingDeleteTarget?.kind === "selector"
              ? "确定删除该工作负载选择器吗？"
              : "确定删除该端口项吗？"
          }
          deleting={isBusy}
          onConfirm={handleConfirmDeleteItem}
        />

        <WorkloadPickerDialog
          open={workloadPickerOpen}
          onOpenChange={setWorkloadPickerOpen}
          namespace={namespace.trim()}
          onPick={(workload) => {
            const nextSelectors = workload.selectors.map((pair) => {
              const next = createSelectorItem()
              return {
                ...next,
                key: pair.key,
                value: pair.value,
              }
            })

            const nextPorts = workload.ports.map((port) =>
              createPortItem({
                protocol: resolveProtocolFromYaml(port.protocol),
                name: `${resolveProtocolNamePrefix(resolveProtocolFromYaml(port.protocol))}-${port.port}`,
                targetPort: String(port.port),
                servicePort: String(port.port),
              })
            )

            setSelectorItems(nextSelectors)
            setPortItems(nextPorts)
            setServiceCompleted(false)
            setSelectorError(null)
            setPortError(null)
            setPortFieldErrors({})
            setStepError(null)
            if (nextSelectors.length > 0) {
              setSelectorAddPromptShown(true)
            }
          }}
        />

        <AlertDialog open={selectorAddPromptOpen} onOpenChange={setSelectorAddPromptOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>手动添加选择器</AlertDialogTitle>
              <AlertDialogDescription>
                建议优先使用“指定工作负载”自动回填标签选择器，是否继续手动添加？
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isBusy}>取消</AlertDialogCancel>
              <AlertDialogAction disabled={isBusy} onClick={handleConfirmSelectorAdd}>
                确定
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
