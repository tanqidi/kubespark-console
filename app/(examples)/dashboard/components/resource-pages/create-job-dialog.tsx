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

import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
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
} from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog"
import type {
  CreateJobDialogProps,
} from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.logic"
import {
  MonacoEditor,
  MONACO_OPTIONS,
  NAME_RULE_MESSAGE,
  POD_REQUIRED_MESSAGE,
  normalizeIntegerInput,
  resolveStepDescription,
} from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.logic"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useCreateJobDialogController } from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.controller"
import { fetchResourceCollection } from "@/app/lib/kubespark/common"

export type { JobDialogInitialValues } from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.logic"
function resolvePvcNames(items: unknown[]): string[] {
  const names = items
    .map((item) => {
      if (!item || typeof item !== "object") return ""
      const metadata =
        "metadata" in item && item.metadata && typeof item.metadata === "object"
          ? (item.metadata as Record<string, unknown>)
          : null
      const name = metadata?.name
      return typeof name === "string" ? name.trim() : ""
    })
    .filter((name) => name.length > 0)

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
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
  const {
    activeDeadlineSeconds,
    activeStep,
    addContainer,
    addContainerEnv,
    addContainerPort,
    backoffLimit,
    beginEditContainer,
    cancelEditContainer,
    canNavigateStep,
    checkingNext,
    clearContainerEnv,
    confirmEditStorageVolume,
    completions,
    configuredContainers,
    containerDialogOpen,
    creating,
    cancelEditStorageVolume,
    currentStepIndex,
    description,
    dialogDescription,
    dialogTitle,
    editingContainer,
    editingEnvDuplicateIds,
    editingImageError,
    editingPortFieldErrors,
    goNext,
    goPrev,
    handleCreate,
    handleYamlModeChange,
    isBasicStep,
    isBusy,
    isEditingStorageView,
    editingStorageVolumeIndex,
    isEditMode,
    isFinalStep,
    isPodStep,
    isStorageStep,
    isStrategyStep,
    lockedIdentity,
    name,
    nameError,
    namespace,
    namespaceError,
    parallelism,
    pendingDeleteContainer,
    removeContainer,
    removeContainerEnv,
    removeContainerPort,
    removeStorageVolume,
    restartPolicy,
    returnToPodList,
    runPodValidation,
    savedStorageVolumes,
    schedule,
    scheduleError,
    setActiveDeadlineSeconds,
    setActiveStep,
    setBackoffLimit,
    setCompletions,
    setContainerDialogOpen,
    setDescription,
    setName,
    setNameError,
    setNamespace,
    setNamespaceError,
    setParallelism,
    setPendingDeleteContainerId,
    setRestartPolicy,
    setSchedule,
    setScheduleError,
    startAddStorageVolume,
    startEditStorageVolume,
    storageVolumeDraft,
    setSubmitError,
    setYamlError,
    setYamlText,
    submitError,
    updateStorageVolumeMount,
    updateStorageVolumeDraft,
    updateContainer,
    updateContainerEnv,
    updateContainerPort,
    yamlError,
    yamlMode,
    yamlText,
  } = useCreateJobDialogController({
    open,
    onOpenChange,
    kind,
    namespaceOptions,
    mode,
    initialValues,
    onSubmit,
  })
  const [persistentVolumeNameOptions, setPersistentVolumeNameOptions] = React.useState<string[]>([])
  const [persistentVolumeNameLoading, setPersistentVolumeNameLoading] = React.useState(false)
  const [persistentVolumeNameError, setPersistentVolumeNameError] = React.useState<string | null>(null)
  const [storageSaveAttempted, setStorageSaveAttempted] = React.useState(false)

  const hasSavedStorageVolume = savedStorageVolumes.length > 0

  const volumeNameOptions =
    storageVolumeDraft.volumeKind === "persistent"
      ? persistentVolumeNameOptions
      : storageVolumeDraft.volumeKind === "ephemeral"
        ? ["ephemeral-cache", "ephemeral-tmp"]
        : ["host-time", "host-logs", "host-data"]
  const currentStorageVolumeId = (
    storageVolumeDraft.volumeKind === "persistent"
      ? storageVolumeDraft.volumeId.trim() || storageVolumeDraft.volumeName.trim()
      : storageVolumeDraft.volumeId.trim()
  ).toLowerCase()
  const existingStorageVolumeIds = new Set(
    savedStorageVolumes
      .map((item, index) => ({ item, index }))
      .filter(({ index }) => index !== editingStorageVolumeIndex)
      .map(({ item }) => item.volumeId.trim().toLowerCase())
      .filter((value) => value.length > 0)
  )
  const hasDuplicateStorageSelection =
    currentStorageVolumeId.length > 0 &&
    existingStorageVolumeIds.has(currentStorageVolumeId)
  const isStorageVolumeNameEmpty = storageVolumeDraft.volumeName.trim().length === 0

  const handleConfirmStorageSave = React.useCallback(() => {
    setStorageSaveAttempted(true)
    if (isStorageVolumeNameEmpty) return
    confirmEditStorageVolume()
  }, [confirmEditStorageVolume, isStorageVolumeNameEmpty])

  React.useEffect(() => {
    if (!open || storageVolumeDraft.volumeKind !== "persistent") return

    let cancelled = false
    const targetNamespace = namespace.trim()
    setPersistentVolumeNameLoading(true)
    setPersistentVolumeNameError(null)

    void fetchResourceCollection(
      "core",
      "v1",
      "persistentvolumeclaims",
      targetNamespace ? { namespace: targetNamespace } : undefined
    )
      .then(({ items }) => {
        if (cancelled) return
        setPersistentVolumeNameOptions(resolvePvcNames(items))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message =
          error instanceof Error && error.message
            ? error.message
            : "?? PVC ?????????"
        setPersistentVolumeNameError(message)
        setPersistentVolumeNameOptions([])
      })
      .finally(() => {
        if (!cancelled) setPersistentVolumeNameLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [namespace, open, storageVolumeDraft.volumeKind])

  React.useEffect(() => {
    if (storageVolumeDraft.volumeKind !== "persistent") return
    if (!storageVolumeDraft.volumeName) return
    if (persistentVolumeNameOptions.includes(storageVolumeDraft.volumeName)) return
    updateStorageVolumeDraft("volumeName", "")
  }, [
    persistentVolumeNameOptions,
    storageVolumeDraft.volumeKind,
    storageVolumeDraft.volumeName,
    updateStorageVolumeDraft,
  ])

  React.useEffect(() => {
    if (!isEditingStorageView) {
      setStorageSaveAttempted(false)
      return
    }
    if (!isStorageVolumeNameEmpty) {
      setStorageSaveAttempted(false)
    }
  }, [isEditingStorageView, isStorageVolumeNameEmpty])
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

                  {kind === "CronJob" ? (
                    <Field data-invalid={Boolean(scheduleError)}>
                      <FieldLabel htmlFor="create-job-schedule">定时计划</FieldLabel>
                      <Input
                        id="create-job-schedule"
                        value={schedule}
                        onChange={(event) => {
                          setSchedule(event.target.value)
                          if (scheduleError) setScheduleError(null)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder="例如：0 0 1 * *（每月）"
                        autoComplete="off"
                        aria-invalid={Boolean(scheduleError)}
                        disabled={isBusy}
                      />
                      {scheduleError ? (
                        <FieldError>{scheduleError}</FieldError>
                      ) : (
                        <FieldDescription>
                          为定时任务设置 Cron 表达式，例如 `0 0 1 * *`（每月执行）。
                        </FieldDescription>
                      )}
                    </Field>
                  ) : null}
                  {kind === "CronJob" ? <div className="hidden md:block" aria-hidden /> : null}

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
                                    {item.type === "initContainer" ? (
                                      <span className="font-semibold text-foreground">初始化容器</span>
                                    ) : (
                                      "工作容器"
                                    )}
                                    {" · "}
                                    {item.imagePullPolicy}
                                  </ItemDescription>
                                </ItemContent>
                                <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPendingDeleteContainerId(item.id)}
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
            ) : isStorageStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">存储设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    配置卷挂载与配置挂载，支持在当前页面直接录入并保存。
                  </p>
                </div>
                {isEditingStorageView ? (
                  <FieldGroup className="flex flex-col gap-6">
                    <Field>
                      <FieldLabel>卷类型</FieldLabel>
                      <Tabs
                        value={storageVolumeDraft.volumeKind}
                        onValueChange={(value) => {
                          if (value === "persistent" || value === "ephemeral" || value === "hostPath") {
                            updateStorageVolumeDraft("volumeKind", value)
                            updateStorageVolumeDraft("volumeName", "")
                          }
                        }}
                      >
                        <TabsList className="grid w-full max-w-xl grid-cols-3">
                          <TabsTrigger value="persistent">持久卷</TabsTrigger>
                          <TabsTrigger value="ephemeral">临时卷</TabsTrigger>
                          <TabsTrigger value="hostPath">HostPath 卷</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="create-job-storage-volume-name">选择卷</FieldLabel>
                      <Select
                        value={storageVolumeDraft.volumeName}
                        onValueChange={(value) => updateStorageVolumeDraft("volumeName", value)}
                        disabled={
                          storageVolumeDraft.volumeKind === "persistent" &&
                          (persistentVolumeNameLoading || volumeNameOptions.length === 0)
                        }
                      >
                        <SelectTrigger
                          id="create-job-storage-volume-name"
                          aria-invalid={
                            (storageSaveAttempted && isStorageVolumeNameEmpty) ||
                            hasDuplicateStorageSelection
                          }
                        >
                          <SelectValue
                            placeholder={
                              storageVolumeDraft.volumeKind === "persistent" &&
                              persistentVolumeNameLoading
                                ? "PVC 加载中..."
                                : "请选择卷"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {volumeNameOptions.map((option) => (
                              <SelectItem
                                key={option}
                                value={option}
                              >
                                {option}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {storageVolumeDraft.volumeKind === "persistent" ? (
                        persistentVolumeNameError ? (
                          <FieldDescription className="text-destructive">{persistentVolumeNameError}</FieldDescription>
                        ) : hasDuplicateStorageSelection ? (
                          <FieldDescription className="text-destructive">
                            卷名称已存在，请回到上方已添加条目中编辑。
                          </FieldDescription>
                        ) : storageSaveAttempted && isStorageVolumeNameEmpty ? (
                          <FieldDescription className="text-destructive">
                            请选择卷，或点击取消返回。
                          </FieldDescription>
                        ) : volumeNameOptions.length === 0 && !persistentVolumeNameLoading ? (
                          <FieldDescription>当前命名空间暂无可选 PVC。</FieldDescription>
                        ) : null
                      ) : storageSaveAttempted && isStorageVolumeNameEmpty ? (
                        <FieldDescription className="text-destructive">
                          请选择卷，或点击取消返回。
                        </FieldDescription>
                      ) : null}
                    </Field>

                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-3 gap-4">
                        <FieldLabel>容器</FieldLabel>
                        <FieldLabel>挂载模式</FieldLabel>
                        <FieldLabel>挂载路径</FieldLabel>
                      </div>
                      <div className="flex flex-col gap-3">
                        {storageVolumeDraft.mounts.map((item, index) => (
                          <div key={item.containerName} className="grid grid-cols-3 gap-4">
                            <Input
                              id={`create-job-storage-container-${index}`}
                              value={item.containerName}
                              disabled
                              autoComplete="off"
                            />
                            <Select
                              value={item.mountMode}
                              onValueChange={(value) => {
                                if (value === "none" || value === "ro" || value === "rw") {
                                  updateStorageVolumeMount(item.containerName, "mountMode", value)
                                }
                              }}
                            >
                              <SelectTrigger
                                id={`create-job-storage-mode-${index}`}
                                aria-label="挂载模式"
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="none">不挂载</SelectItem>
                                  <SelectItem value="ro">只读</SelectItem>
                                  <SelectItem value="rw">读写</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <Input
                              id={`create-job-storage-path-${index}`}
                              value={item.mountPath}
                              onChange={(event) =>
                                updateStorageVolumeMount(item.containerName, "mountPath", event.target.value)
                              }
                              placeholder="例如：/etc/config"
                              autoComplete="off"
                              disabled={item.mountMode === "none"}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </FieldGroup>
                ) : (
                  <FieldGroup className="flex flex-col gap-6">
                    <Field>
                      <FieldLabel>挂载卷</FieldLabel>
                      <div className="flex flex-col gap-3">
                        {hasSavedStorageVolume ? (
                          savedStorageVolumes.map((storageItem, storageIndex) => {
                            const mountedContainerCount = storageItem.mounts.filter(
                              (item) =>
                                item.mountMode !== "none" && item.mountPath.trim().length > 0
                            ).length
                            const storageDisplayName =
                              storageItem.volumeId.trim() ||
                              storageItem.volumeName.trim() ||
                              "未命名卷"

                            return (
                              <Item
                                key={`${storageItem.volumeId}-${storageItem.volumeName}-${storageIndex}`}
                                variant="outline"
                                size="sm"
                                className="cursor-pointer hover:bg-muted"
                                role="button"
                                tabIndex={0}
                                onClick={() => startEditStorageVolume(storageIndex)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault()
                                    startEditStorageVolume(storageIndex)
                                  }
                                }}
                              >
                                <ItemContent className="min-w-0">
                                  <ItemTitle className="min-w-0 truncate">
                                    {storageDisplayName}
                                  </ItemTitle>
                                  <ItemDescription className="min-w-0 truncate">
                                    {(storageItem.volumeKind === "persistent"
                                      ? "持久卷"
                                      : storageItem.volumeKind === "ephemeral"
                                        ? "临时卷"
                                        : "HostPath 卷") +
                                      " · " +
                                      `${mountedContainerCount} 个容器已配置`}
                                  </ItemDescription>
                                </ItemContent>
                                <ItemActions className="gap-1">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      removeStorageVolume(storageIndex)
                                    }}
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                </ItemActions>
                              </Item>
                            )
                          })
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                            <div className="text-sm font-semibold">暂无挂载卷配置</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              可添加持久卷、临时卷或 HostPath 卷。
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={startAddStorageVolume}
                          disabled={isBusy}
                        >
                          <span className="text-sm font-semibold">
                            添加挂载卷
                          </span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            新增一条卷挂载配置。
                          </span>
                        </button>
                      </div>
                    </Field>

                    <Field>
                      <FieldLabel>挂载配置字典或保密字典</FieldLabel>
                      <div className="flex flex-col gap-3">
                        <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                          <div className="text-sm font-semibold">暂无配置挂载</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            可挂载配置字典或保密字典内容到容器。
                          </div>
                        </div>

                        <button
                          type="button"
                          className="flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          disabled={isBusy}
                        >
                          <span className="text-sm font-semibold">添加配置挂载</span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            新增一条配置字典/保密字典挂载配置。
                          </span>
                        </button>
                      </div>
                    </Field>
                  </FieldGroup>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <h3 className="text-[15px] font-semibold">高级设置</h3>
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
          ) : isEditingStorageView ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelEditStorageVolume} disabled={isBusy}>
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmStorageSave}
                  disabled={isBusy || hasDuplicateStorageSelection}
                >
                  确认保存
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
          namespace={lockedIdentity?.namespace ?? namespace}
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
          deleting={isBusy}
          onConfirm={() => {
            if (!pendingDeleteContainer) return
            removeContainer(pendingDeleteContainer.id)
            setPendingDeleteContainerId(null)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
