"use client"

import * as React from "react"
import {
  IconAdjustments,
  IconAdjustmentsHorizontal,
  IconPlus,
  IconSettings2,
  IconTrash,
} from "@tabler/icons-react"

import { checkServiceExists } from "@/app/lib/kubespark/resource-create"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
import {
  WorkloadPickerDialog,
} from "@/app/(examples)/dashboard/components/resource-pages/workload-picker-dialog"
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
  protocol:
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
  name: string
  targetPort: string
  servicePort: string
}

type CreateServiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespaceOptions: NamespaceOption[]
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

let nextSelectorId = 0
let nextPortId = 0

function createSelectorItem(): SelectorItem {
  nextSelectorId += 1
  return {
    id: `svc-selector-${nextSelectorId}`,
    key: "",
    value: "",
  }
}

function createPortItem(
  defaults?: Partial<Omit<PortItem, "id">>
): PortItem {
  nextPortId += 1
  return {
    id: `svc-port-${nextPortId}`,
    protocol: defaults?.protocol ?? "TCP",
    name: defaults?.name ?? "",
    targetPort: defaults?.targetPort ?? "",
    servicePort: defaults?.servicePort ?? "",
  }
}

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

function resolveProtocolNamePrefix(protocol: PortItem["protocol"]): string {
  return protocol === "TCP" ? "tpc" : protocol.toLowerCase()
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
  if (!tail.trim()) return null

  return `${resolveProtocolNamePrefix(nextProtocol)}-${tail}`
}

export function CreateServiceDialog({
  open,
  onOpenChange,
  namespaceOptions,
}: CreateServiceDialogProps) {
  const [activeStep, setActiveStep] = React.useState<ServiceCreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [internalAccessMode, setInternalAccessMode] = React.useState<InternalAccessMode>("virtual-ip")
  const [selectorItems, setSelectorItems] = React.useState<SelectorItem[]>(() => [createSelectorItem()])
  const [portItems, setPortItems] = React.useState<PortItem[]>([])
  const [workloadPickerOpen, setWorkloadPickerOpen] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [selectorError, setSelectorError] = React.useState<string | null>(null)
  const [portError, setPortError] = React.useState<string | null>(null)
  const [stepError, setStepError] = React.useState<string | null>(null)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [basicCompleted, setBasicCompleted] = React.useState(false)
  const [serviceCompleted, setServiceCompleted] = React.useState(false)
  const [enableNodePort, setEnableNodePort] = React.useState(false)
  const [enableSessionAffinity, setEnableSessionAffinity] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setName("")
      setNamespace("")
      setDescription("")
      setInternalAccessMode("virtual-ip")
      setSelectorItems([createSelectorItem()])
      setPortItems([])
      setWorkloadPickerOpen(false)
      setNameError(null)
      setNamespaceError(null)
      setSelectorError(null)
      setPortError(null)
      setStepError(null)
      setCheckingNext(false)
      setBasicCompleted(false)
      setServiceCompleted(false)
      setEnableNodePort(false)
      setEnableSessionAffinity(false)
    }
  }, [open])

  React.useEffect(() => {
    if (internalAccessMode === "headless" && enableNodePort) {
      setEnableNodePort(false)
    }
  }, [enableNodePort, internalAccessMode])

  const handleBasicNext = React.useCallback(async () => {
    if (checkingNext) return

    const normalizedName = name.trim().toLowerCase()
    const normalizedNamespace = namespace.trim()
    const nextNameError = validateName(normalizedName)
    const nextNamespaceError = normalizedNamespace ? null : "请选择项目"

    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    setStepError(null)

    if (nextNameError || nextNamespaceError) return

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
  }, [checkingNext, name, namespace])

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

    const normalizedPorts = portItems.map((item) => ({
      protocol: item.protocol,
      name: item.name.trim(),
      targetPort: item.targetPort.trim(),
      servicePort: item.servicePort.trim(),
    }))

    let nextPortError: string | null = null
    if (normalizedPorts.length > 0) {
      for (let index = 0; index < normalizedPorts.length; index += 1) {
        const item = normalizedPorts[index]
        if (!item.name || !item.targetPort || !item.servicePort) {
          nextPortError = `第 ${index + 1} 个端口需完整填写名称、容器端口和服务端口`
          break
        }
        if (!/^\d+$/.test(item.targetPort)) {
          nextPortError = `第 ${index + 1} 个端口的容器端口格式无效`
          break
        }
        const targetPortNumber = Number(item.targetPort)
        if (targetPortNumber < 1 || targetPortNumber > 65535) {
          nextPortError = `第 ${index + 1} 个端口的容器端口超出范围（1-65535）`
          break
        }
        if (!/^\d+$/.test(item.servicePort)) {
          nextPortError = `第 ${index + 1} 个端口的服务端口格式无效`
          break
        }
        const servicePortNumber = Number(item.servicePort)
        if (servicePortNumber < 1 || servicePortNumber > 65535) {
          nextPortError = `第 ${index + 1} 个端口的服务端口超出范围（1-65535）`
          break
        }
      }
    }

    setSelectorError(nextSelectorError)
    setPortError(nextPortError)
    setStepError(null)

    if (nextSelectorError || nextPortError) return

    setServiceCompleted(true)
    setActiveStep("advanced")
  }, [portItems, selectorItems])

  const canNavigateService = basicCompleted
  const canNavigateAdvanced = basicCompleted && serviceCompleted
  const isBusy = checkingNext

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
        return next.length > 0 ? next : [createSelectorItem()]
      })
      setServiceCompleted(false)
      if (selectorError) setSelectorError(null)
      if (stepError) setStepError(null)
    },
    [selectorError, stepError]
  )

  const updatePortItem = React.useCallback(
    (id: string, field: keyof Omit<PortItem, "id">, value: string) => {
      setPortItems((current) =>
        current.map((item) => {
          if (item.id !== id) return item

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
          }

          return next
        })
      )
      setServiceCompleted(false)
      if (portError) setPortError(null)
      if (stepError) setStepError(null)
    },
    [portError, stepError]
  )

  const addPortItem = React.useCallback(() => {
    setPortItems((current) => [...current, createPortItem()])
    setServiceCompleted(false)
    if (portError) setPortError(null)
    if (stepError) setStepError(null)
  }, [portError, stepError])

  const removePortItem = React.useCallback(
    (id: string) => {
      setPortItems((current) => current.filter((item) => item.id !== id))
      setServiceCompleted(false)
      if (portError) setPortError(null)
      if (stepError) setStepError(null)
    },
    [portError, stepError]
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
            <DialogTitle>创建服务</DialogTitle>
            <DialogDescription>使用 Kubernetes Service 创建网络访问入口。</DialogDescription>
          </DialogHeader>

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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {activeStep === "basic" ? (
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
                    disabled={isBusy}
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
                      setNamespace(value)
                      if (namespaceError) setNamespaceError(null)
                      if (stepError) setStepError(null)
                    }}
                    disabled={isBusy}
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
                      {selectorItems.length > 0 &&
                      selectorItems.some((item) => item.key.trim() || item.value.trim()) ? (
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
                                    onClick={() => removeSelectorItem(item.id)}
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
                    </div>
                    {selectorError ? (
                        <FieldError>{selectorError}</FieldError>
                    ) : (
                        <FieldDescription>服务将根据此处标签路由到匹配的 Pod。</FieldDescription>
                    )}
                  </Field>

                  <Field data-invalid={Boolean(portError)}>
                    <FieldLabel>端口</FieldLabel>
                    <div className="mt-3 flex flex-col gap-3">
                      {portItems.length > 0 ? (
                        portItems.map((item) => (
                            <div key={item.id} className="grid gap-3 md:grid-cols-[190px_1fr_1fr_1fr_auto]">
                              <Select
                                  value={item.protocol}
                                  onValueChange={(value) =>
                                      updatePortItem(item.id, "protocol", value)
                                  }
                                  disabled={isBusy}
                              >
                                <SelectTrigger>
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
                              <Input
                                  value={item.name}
                                  onChange={(event) => updatePortItem(item.id, "name", event.target.value)}
                                  placeholder="名称"
                                  disabled={isBusy}
                              />
                              <Input
                                  value={item.targetPort}
                                  onChange={(event) =>
                                      updatePortItem(item.id, "targetPort", event.target.value)
                                  }
                                  placeholder="容器端口"
                                  disabled={isBusy}
                              />
                              <Input
                                  value={item.servicePort}
                                  onChange={(event) =>
                                      updatePortItem(item.id, "servicePort", event.target.value)
                                  }
                                  placeholder="服务端口"
                                  disabled={isBusy}
                              />
                              <Button
                                  type="button"
                                  variant="ghost"
                                  onClick={() => removePortItem(item.id)}
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
                    {portError ? (
                        <FieldError>{portError}</FieldError>
                    ) : (
                        <FieldDescription>设置服务端口映射。</FieldDescription>
                    )}
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

          {activeStep === "basic" ? (
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
                  <Button type="button" disabled>
                    创建
                  </Button>
                </div>
              </DialogFooter>
          )}
        </div>

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
                protocol: port.protocol,
                name: `${resolveProtocolNamePrefix(port.protocol)}-${port.port}`,
                targetPort: String(port.port),
                servicePort: String(port.port),
              })
            )

            setSelectorItems(nextSelectors.length > 0 ? nextSelectors : [createSelectorItem()])
            setPortItems(nextPorts)
            setServiceCompleted(false)
            setSelectorError(null)
            setPortError(null)
            setStepError(null)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
