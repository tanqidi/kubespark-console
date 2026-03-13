"use client"

import * as React from "react"
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
import { Textarea } from "@/components/ui/textarea"

type NamespaceOption = {
  id: string
  name: string
}

type CreateJobDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: JobCreateKind
  namespaceOptions: NamespaceOption[]
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

function createContainerDraft(): ContainerDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "container",
    image: "",
    imagePullPolicy: "IfNotPresent",
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

type ContainerPortFieldErrors = Record<string, { name?: string; containerPort?: string }>

function validateContainerPorts(container: ContainerDraft): ContainerPortFieldErrors {
  if (container.ports.length === 0) return {}

  const errors: ContainerPortFieldErrors = {}

  container.ports.forEach((item) => {
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

function resolveFirstPortErrorFieldId(
  container: ContainerDraft,
  errors: ContainerPortFieldErrors
): string | null {
  for (const item of container.ports) {
    const rowError = errors[item.id]
    if (!rowError) continue
    if (rowError.name) return `${container.id}-port-${item.id}-name`
    if (rowError.containerPort) return `${container.id}-port-${item.id}-container-port`
  }
  return null
}

function resolveProtocolNamePrefix(protocol: ContainerPortProtocol): string {
  return protocol === "TCP" ? "tpc" : protocol.toLowerCase()
}

function buildAutoPortName(protocol: ContainerPortProtocol, portText: string): string | null {
  const normalized = portText.trim()
  if (!/^\d+$/.test(normalized)) return null
  return `${resolveProtocolNamePrefix(protocol)}-${normalized}`
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
  onSubmit,
}: CreateJobDialogProps) {
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

  const dialogTitle = kind === "CronJob" ? "创建定时任务" : "创建任务"
  const dialogDescription =
    kind === "CronJob"
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
      setCheckingNext(false)
      setCreating(false)
    }
  }, [open, kind])

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

  const updateContainer = React.useCallback(
    (
      id: string,
      field:
        | "name"
        | "type"
        | "image"
        | "imagePullPolicy"
        | "cpuRequest"
        | "cpuLimit"
        | "memoryRequestMi"
        | "memoryLimitMi",
      value: string
    ) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                [field]: value,
              }
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
                const shouldAutoRename =
                  Boolean(autoNameBefore) && port.name.trim() === autoNameBefore
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
    const nextPortFieldErrors = nextImageError ? {} : validateContainerPorts(editingContainer)

    setEditingImageError(nextImageError)
    setEditingPortFieldErrors(nextPortFieldErrors)

    if (nextImageError) {
      requestAnimationFrame(() => {
        const target = document.getElementById(`${editingContainer.id}-image`) as HTMLInputElement | null
        if (!target) return
        target.scrollIntoView({ behavior: "smooth", block: "center" })
        target.focus({ preventScroll: true })
      })
      return
    }

    const firstPortErrorFieldId = resolveFirstPortErrorFieldId(editingContainer, nextPortFieldErrors)
    if (firstPortErrorFieldId) {
      requestAnimationFrame(() => {
        const target = document.getElementById(firstPortErrorFieldId) as HTMLInputElement | null
        if (!target) return
        target.scrollIntoView({ behavior: "smooth", block: "center" })
        target.focus({ preventScroll: true })
      })
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

  const runBasicValidation = React.useCallback(async () => {
    const nextName = name.trim().toLowerCase()
    const nextNamespace = namespace.trim()
    const nextNameError = validateName(nextName)
    const nextNamespaceError = nextNamespace ? null : "请选择项目"
    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    if (nextNameError || nextNamespaceError) return false

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
  }, [kind, name, namespace])

  const goNext = React.useCallback(async () => {
    if (isBusy || isFinalStep || isEditingPodView) return
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
    runBasicValidation,
    runPodValidation,
  ])

  const handleCreate = React.useCallback(
    async () => {
      if (isBusy || !isFinalStep) return

      setSubmitError(null)
      setCreating(true)
      try {
        const passed = await runBasicValidation()
        if (!passed) return

        const strategyDraft = {
          backoffLimit: toOptionalNonNegativeInt(backoffLimit),
          completions: toOptionalNonNegativeInt(completions),
          parallelism: toOptionalNonNegativeInt(parallelism),
          activeDeadlineSeconds: toOptionalNonNegativeInt(activeDeadlineSeconds),
        }
        const strategy =
          typeof strategyDraft.backoffLimit === "number" ||
          typeof strategyDraft.completions === "number" ||
          typeof strategyDraft.parallelism === "number" ||
          typeof strategyDraft.activeDeadlineSeconds === "number"
            ? strategyDraft
            : undefined

        const normalizedContainers = containers
          .map((item) => {
            const normalizedPorts = item.ports
              .map((port) => ({
                protocol: port.protocol,
                name: port.name.trim(),
                containerPort: port.containerPort.trim(),
              }))
              .filter((port) => /^\d+$/.test(port.containerPort))

            return {
              name: item.name.trim(),
              type: item.type,
              image: item.image.trim(),
              imagePullPolicy: item.imagePullPolicy,
              cpuRequest: item.cpuRequest.trim(),
              cpuLimit: item.cpuLimit.trim(),
              memoryRequestMi: item.memoryRequestMi.trim(),
              memoryLimitMi: item.memoryLimitMi.trim(),
              ...(normalizedPorts.length > 0 ? { ports: normalizedPorts } : {}),
            }
          })
          .filter((item) => item.image.length > 0)

        const pod =
          restartPolicy === "OnFailure" || normalizedContainers.length > 0
            ? {
                ...(restartPolicy === "OnFailure" ? { restartPolicy } : {}),
                ...(normalizedContainers.length > 0
                  ? {
                      containers: normalizedContainers,
                    }
                  : {}),
              }
            : undefined

        await onSubmit({
          kind,
          name: name.trim().toLowerCase(),
          namespace: namespace.trim(),
          description: description.trim(),
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
      activeDeadlineSeconds,
      backoffLimit,
      completions,
      description,
      isBusy,
      isFinalStep,
      kind,
      name,
      namespace,
      onOpenChange,
      onSubmit,
      parallelism,
      containers,
      restartPolicy,
      runBasicValidation,
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
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

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

          <div className="min-h-0 flex-1 px-6 py-6">
            {isBasicStep ? (
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
                      disabled={isBusy}
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
                        setNamespace(value)
                        if (namespaceError) setNamespaceError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      disabled={isBusy}
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
                    {activeStep === "strategy"
                      ? "策略设置"
                      : activeStep === "pod"
                        ? "容器组设置"
                        : activeStep === "storage"
                          ? "存储设置"
                          : "高级设置"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{resolveStepDescription(activeStep)}</p>
                </div>
              </div>
            )}

            {submitError && !(isPodStep && submitError === POD_REQUIRED_MESSAGE) ? (
              <FieldError className="mt-4">{submitError}</FieldError>
            ) : null}
          </div>

          {isBasicStep ? (
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
                  {creating ? "创建中..." : "创建"}
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
