"use client"

import * as React from "react"
import { IconBraces, IconDatabase, IconSettings2, IconStack2 } from "@tabler/icons-react"
import { parse, stringify } from "yaml"
import { ContainerListPanel } from "@/app/(examples)/dashboard/components/resource-pages/container-list-panel"
import { CreateContainerDialog } from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
import { useContainerEditor } from "@/app/(examples)/dashboard/components/resource-pages/use-container-editor"
import {
  asObject,
  asString,
  buildAutoPortName,
  buildPodSpecFromContainers,
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
  parseJobYamlText,
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
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

type CreateStep = "basic" | "pod" | "storage" | "advanced"
const STEP_ORDER: CreateStep[] = ["basic", "pod", "storage", "advanced"]
const POD_REQUIRED_MESSAGE = "请至少添加一个容器配置"

type PodDialogSnapshot = {
  name: string
  namespace: string
  description: string
}

function validateName(value: string): string | null {
  const text = value.trim().toLowerCase()
  if (!text) return "请输入名称"
  if (text.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(text)) return NAME_RULE_MESSAGE
  return null
}

function buildYamlText(snapshot: PodDialogSnapshot, containers: ReturnType<typeof useContainerEditor>["configuredContainers"]): string {
  const podSpec = buildPodSpecFromContainers("Never", containers)
  return stringify(
    {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        ...(snapshot.name.trim() ? { name: snapshot.name.trim() } : {}),
        ...(snapshot.namespace.trim() ? { namespace: snapshot.namespace.trim() } : {}),
        ...(snapshot.description.trim()
          ? { annotations: { description: snapshot.description.trim() } }
          : {}),
      },
      spec: podSpec,
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parseYamlText(yamlText: string): {
  snapshot: PodDialogSnapshot
  containers: NonNullable<ReturnType<typeof parseJobYamlText>["pod"]["containers"]>
} {
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

  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
  const fakeJobYaml = stringify({
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      ...(asString(metadata.name).trim() ? { name: asString(metadata.name).trim() } : {}),
      ...(asString(metadata.namespace).trim() ? { namespace: asString(metadata.namespace).trim() } : {}),
      ...(asString(annotations.description).trim()
        ? { annotations: { description: asString(annotations.description).trim() } }
        : {}),
    },
    spec: {
      template: {
        spec: asObject(root.spec),
      },
    },
  })

  const parsedJob = parseJobYamlText("Job", fakeJobYaml)

  return {
    snapshot: {
      name: asString(metadata.name),
      namespace: asString(metadata.namespace),
      description: asString(annotations.description),
    },
    containers: parsedJob.pod.containers,
  }
}

type CreatePodDialogProps = {
  mode?: "create" | "edit"
  open: boolean
  onOpenChange: (open: boolean) => void
  initialYamlText?: string | null
  namespaceOptions: Array<{ id: string; name: string }>
  onSubmit: (payload: {
    name: string
    namespace: string
    description: string
    podSpec: Record<string, unknown>
  }) => Promise<void>
}

export function CreatePodDialog({
  mode = "create",
  open,
  onOpenChange,
  initialYamlText = null,
  namespaceOptions,
  onSubmit,
}: CreatePodDialogProps) {
  const isEditMode = mode === "edit"
  const [activeStep, setActiveStep] = React.useState<CreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [nameError, setNameError] = React.useState<string | null>(null)
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
      setName("")
      setNamespace("")
      setDescription("")
      setNameError(null)
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
    const nextNameError = validateName(name)
    const nextNamespaceError = namespace.trim() ? null : "请选择项目"
    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    return !nextNameError && !nextNamespaceError
  }, [name, namespace])

  const validatePod = React.useCallback(() => {
    if (configuredContainers.length === 0) {
      setSubmitError(POD_REQUIRED_MESSAGE)
      return false
    }
    return true
  }, [configuredContainers.length, setSubmitError])

  const buildSnapshot = React.useCallback(
    (): PodDialogSnapshot => ({
      name,
      namespace,
      description,
    }),
    [description, name, namespace]
  )

  const applySnapshot = React.useCallback(
    (next: PodDialogSnapshot, parsedContainers: NonNullable<ReturnType<typeof parseJobYamlText>["pod"]["containers"]>) => {
      setName(next.name)
      setNamespace(next.namespace)
      setDescription(next.description)
      setContainers(Array.isArray(parsedContainers) ? parsedContainers.slice(0, 1) : [])
    },
    [setContainers]
  )

  React.useEffect(() => {
    if (!open || !isEditMode || !initialYamlText) return
    try {
      const parsed = parseYamlText(initialYamlText)
      applySnapshot(parsed.snapshot, parsed.containers)
      setYamlText(initialYamlText)
      setYamlError(null)
      setSubmitError(null)
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
    }
  }, [applySnapshot, initialYamlText, isEditMode, open, setSubmitError])

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
    const podSpec = buildPodSpecFromContainers("Never", configuredContainers)
    setCreating(true)
    try {
      await onSubmit({
        name: name.trim(),
        namespace: namespace.trim(),
        description: description.trim(),
        podSpec: podSpec as Record<string, unknown>,
      })
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }, [
    configuredContainers,
    creating,
    description,
    name,
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
                <DialogTitle>{isEditMode ? "编辑容器组" : "创建容器组"}</DialogTitle>
                <DialogDescription>
                  {isEditMode
                    ? "编辑 Kubernetes Pod 的配置内容。"
                    : "使用 Kubernetes Pod 创建一次性容器组。"}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                <span className="text-sm font-medium">编辑 YAML</span>
                <Switch
                  checked={yamlMode}
                  onCheckedChange={(checked) => {
                    if (creating) return
                    if (checked) {
                      setYamlText(buildYamlText(buildSnapshot(), configuredContainers))
                      setYamlError(null)
                      setYamlMode(true)
                      return
                    }
                    try {
                      const parsed = parseYamlText(yamlText)
                      applySnapshot(parsed.snapshot, parsed.containers)
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
                  disabled: isBusy,
                  onClick: () => setActiveStep("basic"),
                },
                {
                  id: "pod",
                  title: "容器组设置",
                  status: activeStep === "pod" ? "当前" : currentStepIndex > 1 ? "已设置" : "未设置",
                  active: activeStep === "pod",
                  icon: <IconBraces className="size-4" />,
                  disabled: isBusy,
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
                  disabled: isBusy,
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
                  disabled: isBusy,
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
                  <p className="mt-1 text-sm text-muted-foreground">填写容器组名称、所属项目和描述信息。</p>
                </div>
                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field data-invalid={Boolean(nameError)}>
                    <FieldLabel htmlFor="create-pod-name">名称</FieldLabel>
                    <Input
                      id="create-pod-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameError) setNameError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      placeholder="请输入容器组名称"
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={isBusy || isEditMode}
                    />
                    {nameError ? <FieldError>{nameError}</FieldError> : <FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>}
                  </Field>

                  <Field data-invalid={Boolean(namespaceError)}>
                    <FieldLabel htmlFor="create-pod-namespace">项目</FieldLabel>
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
                      <SelectTrigger id="create-pod-namespace" aria-invalid={Boolean(namespaceError)}>
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
                    {namespaceError ? <FieldError>{namespaceError}</FieldError> : <FieldDescription>选择容器组所属项目。</FieldDescription>}
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

          {yamlMode ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={async () => {
                    try {
                      const parsed = parseYamlText(yamlText)
                      applySnapshot(parsed.snapshot, parsed.containers)
                      setYamlError(null)
                    } catch (error) {
                      setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                      return
                    }
                    await handleCreate()
                  }}
                  disabled={isBusy}
                >
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
                <Button type="button" onClick={handleNext} disabled={isBusy}>
                  下一步
                </Button>
              </div>
            </DialogFooter>
          ) : activeStep === "pod" || activeStep === "storage" ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveStep(STEP_ORDER[currentStepIndex - 1] ?? "basic")}
                  disabled={isBusy}
                >
                  上一步
                </Button>
                <Button type="button" onClick={handleNext} disabled={isBusy}>
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
                  onClick={() => setActiveStep("storage")}
                  disabled={isBusy}
                >
                  上一步
                </Button>
                <Button type="button" onClick={() => void handleCreate()} disabled={isBusy}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                </Button>
              </div>
            </DialogFooter>
          )}
        </div>
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
