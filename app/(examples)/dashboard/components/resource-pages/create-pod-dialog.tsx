"use client"

import * as React from "react"
import { IconBraces, IconDatabase, IconSettings2, IconStack2 } from "@tabler/icons-react"
import { parse, stringify } from "yaml"
import { ContainerListPanel } from "@/app/(examples)/dashboard/components/resource-pages/container-list-panel"
import { CreateContainerDialog, type ContainerDraft } from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
import { useContainerEditor } from "@/app/(examples)/dashboard/components/resource-pages/use-container-editor"
import {
  buildAutoPortName,
  CONTAINER_PORT_PROTOCOL_SET,
  createContainerDraft,
  createContainerEnvDraft,
  createContainerPortDraft,
  ensureUniqueContainerName,
  isAutoContainerNameForImage,
  isAutoPortNameForProtocol,
  MonacoEditor,
  MONACO_OPTIONS,
  NAME_RULE_MESSAGE,
  normalizeLifecycleMap,
  normalizeProbeMap,
  normalizeSecurityContextDraft,
  replaceProtocolPrefixInName,
  resolveContainerNameFromImage,
  resolveDuplicateContainerEnvNameIds,
  toDnsLabelFragment,
  validateContainerPorts,
} from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.logic"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

type CreateStep = "basic" | "pod" | "storage" | "advanced"
const STEP_ORDER: CreateStep[] = ["basic", "pod", "storage", "advanced"]
const POD_REQUIRED_MESSAGE = "请至少添加一个容器配置"

type PodDialogSnapshot = {
  namespace: string
  description: string
  containerName: string
  image: string
  protocol: "TCP" | "UDP" | "SCTP"
  portName: string
  containerPort: string
}

function validateName(value: string): string | null {
  const text = value.trim().toLowerCase()
  if (!text) return "请输入名称"
  if (text.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(text)) return NAME_RULE_MESSAGE
  return null
}

function normalizePortInput(value: string): string {
  return value.replace(/[^\d]/g, "")
}

function buildYamlText(snapshot: PodDialogSnapshot): string {
  const resolvedName =
    snapshot.containerName.trim() || resolveContainerNameFromImage(snapshot.image) || "pod"
  return stringify(
    {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: resolvedName,
        ...(snapshot.namespace.trim() ? { namespace: snapshot.namespace.trim() } : {}),
        ...(snapshot.description.trim()
          ? { annotations: { description: snapshot.description.trim() } }
          : {}),
      },
      spec: {
        restartPolicy: "Never",
        containers: [
          {
            name: snapshot.containerName.trim() || "container-1",
            image: snapshot.image.trim(),
            ...(snapshot.containerPort.trim()
              ? {
                  ports: [
                    {
                      ...(snapshot.portName.trim() ? { name: snapshot.portName.trim() } : {}),
                      protocol: snapshot.protocol,
                      containerPort: Number(snapshot.containerPort.trim()),
                    },
                  ],
                }
              : {}),
          },
        ],
      },
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parseYamlText(yamlText: string): PodDialogSnapshot {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error("请输入 YAML 内容")
  const parsed = parse(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error("YAML 内容格式无效")
  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "Pod") throw new Error("YAML 资源类型必须是 Pod")

  const metadata =
    typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : {}
  const annotations =
    typeof metadata.annotations === "object" &&
    metadata.annotations !== null &&
    !Array.isArray(metadata.annotations)
      ? (metadata.annotations as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}
  const containers = Array.isArray(spec.containers) ? spec.containers : []
  const firstContainer =
    containers.length > 0 &&
    typeof containers[0] === "object" &&
    containers[0] !== null &&
    !Array.isArray(containers[0])
      ? (containers[0] as Record<string, unknown>)
      : {}
  const ports = Array.isArray(firstContainer.ports) ? firstContainer.ports : []
  const firstPort =
    ports.length > 0 &&
    typeof ports[0] === "object" &&
    ports[0] !== null &&
    !Array.isArray(ports[0])
      ? (ports[0] as Record<string, unknown>)
      : {}
  const protocolText = typeof firstPort.protocol === "string" ? firstPort.protocol.trim().toUpperCase() : ""
  const protocol: "TCP" | "UDP" | "SCTP" =
    protocolText === "UDP" || protocolText === "SCTP" ? protocolText : "TCP"

  return {
    namespace: typeof metadata.namespace === "string" ? metadata.namespace : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
    containerName:
      typeof firstContainer.name === "string" && firstContainer.name.trim()
        ? firstContainer.name
        : typeof metadata.name === "string"
          ? metadata.name
          : "",
    image: typeof firstContainer.image === "string" ? firstContainer.image : "",
    protocol,
    portName: typeof firstPort.name === "string" ? firstPort.name : "",
    containerPort:
      typeof firstPort.containerPort === "number"
        ? String(firstPort.containerPort)
        : typeof firstPort.containerPort === "string"
          ? firstPort.containerPort
          : "",
  }
}

type CreatePodDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespaceOptions: Array<{ id: string; name: string }>
  onSubmit: (payload: {
    name: string
    namespace: string
    description: string
    container: {
      name?: string
      image: string
      imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
      port?: {
        protocol?: "TCP" | "UDP" | "SCTP"
        name?: string
        containerPort: string
      }
    }
    restartPolicy: "Never"
  }) => Promise<void>
}

export function CreatePodDialog({ open, onOpenChange, namespaceOptions, onSubmit }: CreatePodDialogProps) {
  const [activeStep, setActiveStep] = React.useState<CreateStep>("basic")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [yamlMode, setYamlMode] = React.useState(false)
  const [yamlText, setYamlText] = React.useState("")
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)

  const {
    containers,
    setContainers,
    configuredContainers,
    containerDialogOpen,
    setContainerDialogOpen,
    pendingDeleteContainer,
    setPendingDeleteContainerId,
    editingContainer,
    editingImageError,
    editingPortFieldErrors,
    editingEnvDuplicateIds,
    updateContainer,
    addContainerPort,
    updateContainerPort,
    removeContainerPort,
    addContainerEnv,
    updateContainerEnv,
    removeContainerEnv,
    clearContainerEnv,
    beginEditContainer,
    addContainer,
    removeContainer,
    returnToPodList,
    cancelEditContainer,
  } = useContainerEditor({
    deps: {
      CONTAINER_PORT_PROTOCOL_SET,
      buildAutoPortName,
      createContainerDraft,
      createContainerEnvDraft,
      createContainerPortDraft,
      ensureUniqueContainerName,
      isAutoContainerNameForImage,
      isAutoPortNameForProtocol,
      normalizeLifecycleMap,
      normalizeProbeMap,
      normalizeSecurityContextDraft,
      replaceProtocolPrefixInName,
      resolveContainerNameFromImage,
      resolveDuplicateContainerEnvNameIds,
      toDnsLabelFragment,
      validateContainerPorts,
    },
    submitError,
    setSubmitError,
  })

  const currentStepIndex = STEP_ORDER.indexOf(activeStep)
  const isBusy = creating

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setNamespace("")
      setDescription("")
      setNamespaceError(null)
      setSubmitError(null)
      setYamlMode(false)
      setYamlText("")
      setYamlError(null)
      setCreating(false)
      setContainers([])
    }
  }, [open, setContainers])

  const validateBasic = React.useCallback(() => {
    const nextNamespaceError = namespace.trim() ? null : "请选择项目"
    setNamespaceError(nextNamespaceError)
    return !nextNamespaceError
  }, [namespace])

  const validatePod = React.useCallback(() => {
    if (configuredContainers.length === 0) {
      setSubmitError(POD_REQUIRED_MESSAGE)
      return false
    }
    return true
  }, [configuredContainers.length, setSubmitError])

  const buildSnapshot = React.useCallback((): PodDialogSnapshot => {
    const first = configuredContainers[0]
    const firstPort = first?.ports[0]
    return {
      namespace,
      description,
      containerName: first?.name ?? "",
      image: first?.image ?? "",
      protocol: firstPort?.protocol ?? "TCP",
      portName: firstPort?.name ?? "",
      containerPort: firstPort?.containerPort ?? "",
    }
  }, [configuredContainers, description, namespace])

  const applySnapshot = React.useCallback(
    (snapshot: PodDialogSnapshot) => {
      setNamespace(snapshot.namespace)
      setDescription(snapshot.description)

      const draft: ContainerDraft = {
        ...createContainerDraft(),
        name: snapshot.containerName.trim(),
        image: snapshot.image.trim(),
        imagePullPolicy: "IfNotPresent",
        ports:
          snapshot.containerPort.trim().length > 0
            ? [
                {
                  id: crypto.randomUUID(),
                  protocol: snapshot.protocol,
                  name:
                    snapshot.portName.trim() ||
                    buildAutoPortName(snapshot.protocol, normalizePortInput(snapshot.containerPort)) ||
                    "",
                  containerPort: normalizePortInput(snapshot.containerPort),
                },
              ]
            : [createContainerPortDraft(0)],
      }
      setContainers(snapshot.image.trim().length > 0 ? [draft] : [])
    },
    [setContainers]
  )

  const handleNext = React.useCallback(() => {
    if (activeStep === "basic" && !validateBasic()) return
    if (activeStep === "pod" && !validatePod()) return
    if (currentStepIndex < STEP_ORDER.length - 1) {
      setActiveStep(STEP_ORDER[currentStepIndex + 1] ?? "advanced")
      setSubmitError(null)
    }
  }, [activeStep, currentStepIndex, validateBasic, validatePod, setSubmitError])

  const handleCreate = React.useCallback(async () => {
    if (creating) return
    if (!validateBasic()) {
      setActiveStep("basic")
      return
    }
    if (!validatePod()) {
      setActiveStep("pod")
      return
    }

    const item = configuredContainers[0]
    if (!item || !item.image.trim()) {
      setActiveStep("pod")
      setSubmitError(POD_REQUIRED_MESSAGE)
      return
    }
    const podName = item.name.trim() || resolveContainerNameFromImage(item.image) || ""
    const podNameError = validateName(podName)
    if (podNameError) {
      setActiveStep("pod")
      setSubmitError(`容器名称不可用：${podNameError}`)
      return
    }

    const firstPort = item.ports.find((port) => port.containerPort.trim().length > 0)
    setCreating(true)
    try {
      await onSubmit({
        name: podName,
        namespace: namespace.trim(),
        description: description.trim(),
        container: {
          name: item.name.trim() || undefined,
          image: item.image.trim(),
          imagePullPolicy: item.imagePullPolicy,
          ...(firstPort
            ? {
                port: {
                  protocol: firstPort.protocol,
                  name: firstPort.name.trim() || undefined,
                  containerPort: firstPort.containerPort.trim(),
                },
              }
            : {}),
        },
        restartPolicy: "Never",
      })
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }, [
    configuredContainers,
    creating,
    description,
    namespace,
    onOpenChange,
    onSubmit,
    setSubmitError,
    validateBasic,
    validatePod,
  ])

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && creating) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle>创建容器组</DialogTitle>
              <DialogDescription>使用 Kubernetes Pod 创建一次性容器组。</DialogDescription>
            </div>
            <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
              <span className="text-sm font-medium">编辑 YAML</span>
              <Switch
                checked={yamlMode}
                onCheckedChange={(checked) => {
                  if (creating) return
                  if (checked) {
                    setYamlText(buildYamlText(buildSnapshot()))
                    setYamlError(null)
                    setYamlMode(true)
                    return
                  }
                  try {
                    const parsed = parseYamlText(yamlText)
                    applySnapshot(parsed)
                    setYamlError(null)
                    setYamlMode(false)
                  } catch (error) {
                    setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                  }
                }}
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
                onClick: () => setActiveStep("basic"),
              },
              {
                id: "pod",
                title: "容器组设置",
                status: activeStep === "pod" ? "当前" : currentStepIndex > 1 ? "已设置" : "未设置",
                active: activeStep === "pod",
                icon: <IconBraces className="size-4" />,
                onClick: () => {
                  if (currentStepIndex < 1 && !validateBasic()) return
                  setActiveStep("pod")
                },
              },
              {
                id: "storage",
                title: "存储设置",
                status: activeStep === "storage" ? "当前" : currentStepIndex > 2 ? "已设置" : "未设置",
                active: activeStep === "storage",
                icon: <IconDatabase className="size-4" />,
                onClick: () => {
                  if ((currentStepIndex < 1 && !validateBasic()) || (currentStepIndex < 2 && !validatePod())) return
                  setActiveStep("storage")
                },
              },
              {
                id: "advanced",
                title: "高级设置",
                status: activeStep === "advanced" ? "当前" : "未设置",
                active: activeStep === "advanced",
                icon: <IconStack2 className="size-4" />,
                onClick: () => {
                  if ((currentStepIndex < 1 && !validateBasic()) || (currentStepIndex < 2 && !validatePod())) return
                  setActiveStep("advanced")
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
          ) : activeStep === "basic" ? (
            <div>
              <div className="mb-4">
                <h3 className="text-[15px] font-semibold">基本信息</h3>
                <p className="mt-1 text-sm text-muted-foreground">填写所属项目和描述信息。</p>
              </div>
              <FieldGroup className="grid gap-6 md:grid-cols-2">
                <Field data-invalid={Boolean(namespaceError)}>
                  <FieldLabel htmlFor="create-pod-namespace">项目</FieldLabel>
                  <Select
                    value={namespace}
                    onValueChange={(value) => {
                      setNamespace(value)
                      if (namespaceError) setNamespaceError(null)
                      if (submitError) setSubmitError(null)
                    }}
                    disabled={isBusy}
                  >
                    <SelectTrigger id="create-pod-namespace" aria-invalid={Boolean(namespaceError)}>
                      <SelectValue placeholder="请选择项目" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {namespaceOptions.map((option) => (
                          <SelectItem key={option.id} value={option.name}>
                            {option.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {namespaceError ? (
                    <FieldError>{namespaceError}</FieldError>
                  ) : (
                    <FieldDescription>选择容器组所属项目。</FieldDescription>
                  )}
                </Field>

                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="create-pod-description">描述</FieldLabel>
                  <Textarea
                    id="create-pod-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="请输入描述（选填）"
                    maxLength={256}
                    className="min-h-24"
                    disabled={isBusy}
                  />
                  <FieldDescription>描述将写入资源注解 `description`，最长 256 个字符。</FieldDescription>
                </Field>
              </FieldGroup>
            </div>
          ) : activeStep === "pod" ? (
            <div>
              <div className="mb-4">
                <h3 className="text-[15px] font-semibold">容器组设置</h3>
                <p className="mt-1 text-sm text-muted-foreground">配置容器镜像信息，仅支持录入一个容器。</p>
              </div>
              <ContainerListPanel
                items={configuredContainers}
                isBusy={isBusy}
                submitError={submitError}
                podRequiredMessage={POD_REQUIRED_MESSAGE}
                onEdit={beginEditContainer}
                onRequestDelete={setPendingDeleteContainerId}
                onAdd={() => {
                  if (containers.length > 0) {
                    beginEditContainer(containers[0]!.id)
                    return
                  }
                  addContainer()
                }}
              />
            </div>
          ) : activeStep === "storage" ? (
            <p className="text-sm text-muted-foreground">存储设置将在后续版本开放，当前暂不支持配置。</p>
          ) : (
            <p className="text-sm text-muted-foreground">高级设置正在规划中，当前版本暂不开放。</p>
          )}
        </div>

        <DialogFooter className="border-t bg-background px-6 py-5">
          {!yamlMode && currentStepIndex > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setActiveStep(STEP_ORDER[currentStepIndex - 1] ?? "basic")}
              disabled={isBusy}
            >
              上一步
            </Button>
          ) : (
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isBusy}>
                取消
              </Button>
            </DialogClose>
          )}

          {yamlMode || activeStep === "advanced" ? (
            <Button
              type="button"
              onClick={async () => {
                if (yamlMode) {
                  try {
                    const parsed = parseYamlText(yamlText)
                    applySnapshot(parsed)
                    setYamlError(null)
                  } catch (error) {
                    setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                    return
                  }
                }
                await handleCreate()
              }}
              disabled={isBusy}
            >
              {creating ? "创建中..." : "创建"}
            </Button>
          ) : (
            <Button type="button" onClick={handleNext} disabled={isBusy}>
              下一步
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <CreateContainerDialog
        open={containerDialogOpen}
        onOpenChange={setContainerDialogOpen}
        namespace={namespace}
        container={editingContainer}
        imageError={editingImageError}
        portFieldErrors={editingPortFieldErrors}
        envDuplicateIds={editingEnvDuplicateIds}
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
        onAddEnv={(defaults) => {
          if (!editingContainer) return
          addContainerEnv(editingContainer.id, defaults)
        }}
        onClearEnv={() => {
          if (!editingContainer) return
          clearContainerEnv(editingContainer.id)
        }}
        onUpdateEnv={(envId, field, value) => {
          if (!editingContainer) return
          updateContainerEnv(editingContainer.id, envId, field, value)
        }}
        onRemoveEnv={(envId) => {
          if (!editingContainer) return
          removeContainerEnv(editingContainer.id, envId)
        }}
        onCancel={cancelEditContainer}
        onConfirm={returnToPodList}
      />

      <DeleteConfirmDialog
        open={Boolean(pendingDeleteContainer)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDeleteContainerId(null)
        }}
        title="删除容器"
        description={
          pendingDeleteContainer
            ? `确定删除容器 ${pendingDeleteContainer.name.trim() || "未命名容器"} 吗？`
            : ""
        }
        deleting={false}
        onConfirm={() => {
          if (pendingDeleteContainer) removeContainer(pendingDeleteContainer.id)
        }}
      />
    </Dialog>
  )
}
