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

import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import { Button } from "@/components/ui/button"
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
} from "@/app/(console)/dashboard/components/resource-pages/create-container-dialog"
import type {
  CreateJobDialogProps,
} from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog.logic"
import {
  MonacoEditor,
  MONACO_OPTIONS,
  NAME_RULE_MESSAGE,
  POD_REQUIRED_MESSAGE,
  normalizeIntegerInput,
  resolveStepDescription,
} from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog.logic"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
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
import { useCreateJobDialogController } from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog.controller"
import { ContainerListPanel } from "@/app/(console)/dashboard/components/resource-pages/container-list-panel"
import { StorageVolumeList } from "@/app/(console)/dashboard/components/resource-pages/storage-volume-list"
import { ProjectNamespaceField } from "@/app/(console)/dashboard/components/resource-pages/project-namespace-field"
import {
  ResourceMetadataEditor,
  hasUserProvidedMetadata,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
import { fetchResourceCollection } from "@/app/lib/kubespark/common"

export type { JobDialogInitialValues } from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog.logic"
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

type ConfigMountSourceKind = "configMap" | "secret"

type ConfigMountDraft = {
  sourceKind: ConfigMountSourceKind
  sourceName: string
  mounts: Array<{
    containerName: string
    mountMode: "none" | "ro"
    mountPath: string
  }>
}

const EMPTY_CONFIG_MOUNT_DRAFT: ConfigMountDraft = {
  sourceKind: "configMap",
  sourceName: "",
  mounts: [],
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
    metadataEnabled,
    setMetadataEnabled,
    labelEntries,
    setLabelEntries,
    annotationEntries,
    setAnnotationEntries,
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
  const [configMapNameOptions, setConfigMapNameOptions] = React.useState<string[]>([])
  const [secretNameOptions, setSecretNameOptions] = React.useState<string[]>([])
  const [configResourceLoading, setConfigResourceLoading] = React.useState(false)
  const [configResourceError, setConfigResourceError] = React.useState<string | null>(null)
  const [configMountSaveAttempted, setConfigMountSaveAttempted] = React.useState(false)
  const [configMountDraft, setConfigMountDraft] = React.useState<ConfigMountDraft>(EMPTY_CONFIG_MOUNT_DRAFT)
  const [savedConfigMounts, setSavedConfigMounts] = React.useState<ConfigMountDraft[]>([])
  const [editingConfigMount, setEditingConfigMount] = React.useState(false)
  const [editingConfigMountIndex, setEditingConfigMountIndex] = React.useState<number | null>(null)
  const [pendingDeleteStorageIndex, setPendingDeleteStorageIndex] = React.useState<number | null>(null)
  const [pendingDeleteConfigMountIndex, setPendingDeleteConfigMountIndex] = React.useState<number | null>(null)
  const createDialogPopupLayerRef = React.useRef<HTMLDivElement | null>(null)

  const volumeNameOptions = persistentVolumeNameOptions
  const currentStorageVolumeId = (
    storageVolumeDraft.volumeKind === "hostPath"
      ? storageVolumeDraft.volumeId.trim()
      : storageVolumeDraft.volumeId.trim() || storageVolumeDraft.volumeName.trim()
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
  const isPersistentVolumeIdEmpty =
    storageVolumeDraft.volumeKind === "persistent" &&
    storageVolumeDraft.volumeId.trim().length === 0
  const isHostPathVolumeIdEmpty =
    storageVolumeDraft.volumeKind === "hostPath" &&
    storageVolumeDraft.volumeId.trim().length === 0
  const configSourceNameOptions =
    configMountDraft.sourceKind === "configMap" ? configMapNameOptions : secretNameOptions
  const isConfigSourceNameEmpty = configMountDraft.sourceName.trim().length === 0
  const isEditingConfigMountView = isStorageStep && editingConfigMount
  const canNavigateStorageView = canNavigateStep && !isEditingConfigMountView

  const handleConfirmStorageSave = React.useCallback(() => {
    setStorageSaveAttempted(true)
    if (storageVolumeDraft.volumeKind === "persistent") {
      if (isPersistentVolumeIdEmpty || isStorageVolumeNameEmpty) return
    } else if (storageVolumeDraft.volumeKind === "hostPath") {
      if (isHostPathVolumeIdEmpty || isStorageVolumeNameEmpty) return
    } else if (isStorageVolumeNameEmpty) {
      return
    }
    confirmEditStorageVolume()
  }, [
    confirmEditStorageVolume,
    isHostPathVolumeIdEmpty,
    isPersistentVolumeIdEmpty,
    isStorageVolumeNameEmpty,
    storageVolumeDraft.volumeKind,
  ])

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
    if (!open) return

    let cancelled = false
    const targetNamespace = namespace.trim()
    setConfigResourceLoading(true)
    setConfigResourceError(null)

    void Promise.all([
      fetchResourceCollection(
        "core",
        "v1",
        "configmaps",
        targetNamespace ? { namespace: targetNamespace } : undefined
      ),
      fetchResourceCollection(
        "core",
        "v1",
        "secrets",
        targetNamespace ? { namespace: targetNamespace } : undefined
      ),
    ])
      .then(([configMapsResult, secretsResult]) => {
        if (cancelled) return
        setConfigMapNameOptions(resolvePvcNames(configMapsResult.items))
        setSecretNameOptions(resolvePvcNames(secretsResult.items))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message =
          error instanceof Error && error.message
            ? error.message
            : "加载配置字典/保密字典失败"
        setConfigResourceError(message)
        setConfigMapNameOptions([])
        setSecretNameOptions([])
      })
      .finally(() => {
        if (!cancelled) setConfigResourceLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [namespace, open])

  React.useEffect(() => {
    if (!isEditingStorageView) {
      setStorageSaveAttempted(false)
      return
    }
    if (
      !isStorageVolumeNameEmpty &&
      (storageVolumeDraft.volumeKind === "ephemeral"
        ? true
        : storageVolumeDraft.volumeKind === "persistent"
          ? !isPersistentVolumeIdEmpty
          : !isHostPathVolumeIdEmpty)
    ) {
      setStorageSaveAttempted(false)
    }
  }, [
    isHostPathVolumeIdEmpty,
    isEditingStorageView,
    isPersistentVolumeIdEmpty,
    isStorageVolumeNameEmpty,
    storageVolumeDraft.volumeKind,
  ])
  React.useEffect(() => {
    if (!open) {
      setConfigMapNameOptions([])
      setSecretNameOptions([])
      setConfigResourceLoading(false)
      setConfigResourceError(null)
      setConfigMountSaveAttempted(false)
      setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
      setSavedConfigMounts([])
      setEditingConfigMount(false)
      setEditingConfigMountIndex(null)
      setPendingDeleteStorageIndex(null)
      setPendingDeleteConfigMountIndex(null)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const initialConfigList = Array.isArray(initialValues?.pod?.configList)
      ? initialValues.pod.configList
      : []
    const normalized: ConfigMountDraft[] = initialConfigList
      .map((item): ConfigMountDraft => ({
        sourceKind: item.sourceKind === "secret" ? "secret" : "configMap",
        sourceName: typeof item.sourceName === "string" ? item.sourceName.trim() : "",
        mounts: Array.isArray(item.mounts)
          ? item.mounts
              .map((mount): ConfigMountDraft["mounts"][number] => ({
                containerName: typeof mount.containerName === "string" ? mount.containerName.trim() : "",
                mountMode: mount.mountMode === "ro" ? "ro" : "none",
                mountPath: typeof mount.mountPath === "string" ? mount.mountPath.trim() : "",
              }))
              .filter((mount) => mount.containerName.length > 0)
          : [],
      }))
      .filter((item) => item.sourceName.length > 0)
    setSavedConfigMounts(normalized)
  }, [initialValues?.pod?.configList, open])

  const resolveConfigContainerNames = React.useCallback(() => {
    const names =
      configuredContainers.length > 0
        ? configuredContainers.map((item) => item.name.trim())
        : []
    return Array.from(new Set(names.filter((item) => item.length > 0)))
  }, [configuredContainers])

  const startAddConfigMount = React.useCallback(() => {
    const containerNames = resolveConfigContainerNames()
    const mounts = containerNames.map((containerName) => ({
      containerName,
      mountMode: "none" as const,
      mountPath: "",
    }))

    setEditingConfigMountIndex(null)
    setConfigMountDraft({
      sourceKind: "configMap",
      sourceName: "",
      mounts,
    })
    setEditingConfigMount(true)
  }, [resolveConfigContainerNames])

  const startEditConfigMount = React.useCallback((index: number) => {
    const selected = savedConfigMounts[index]
    const containerNames = resolveConfigContainerNames()
    const previousByName = new Map((selected?.mounts ?? []).map((item) => [item.containerName, item]))
    const mounts = containerNames.map((containerName) => {
      const previous = previousByName.get(containerName)
      return {
        containerName,
        mountMode: previous?.mountMode ?? "none",
        mountPath: previous?.mountPath ?? "",
      }
    })

    setEditingConfigMountIndex(index)
    setConfigMountDraft({
      sourceKind: selected?.sourceKind === "secret" ? "secret" : "configMap",
      sourceName: selected?.sourceName ?? "",
      mounts,
    })
    setEditingConfigMount(true)
  }, [resolveConfigContainerNames, savedConfigMounts])

  const cancelEditConfigMount = React.useCallback(() => {
    setEditingConfigMount(false)
    setEditingConfigMountIndex(null)
    setConfigMountSaveAttempted(false)
    setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
  }, [])

  const updateConfigMountDraft = React.useCallback(
    <K extends keyof ConfigMountDraft>(field: K, value: ConfigMountDraft[K]) => {
      setConfigMountDraft((current) => ({
        ...current,
        [field]: value,
      }))
    },
    []
  )

  const updateConfigMountDraftMount = React.useCallback(
    (
      containerName: string,
      field: "mountMode" | "mountPath",
      value: "none" | "ro" | string
    ) => {
      setConfigMountDraft((current) => ({
        ...current,
        mounts: current.mounts.map((item) =>
          item.containerName === containerName
            ? {
                ...item,
                [field]: value,
              }
            : item
        ),
      }))
    },
    []
  )

  const confirmEditConfigMount = React.useCallback(() => {
    setConfigMountSaveAttempted(true)
    const sourceName = configMountDraft.sourceName.trim()
    if (!sourceName) return
    setSavedConfigMounts((current) => {
      if (
        editingConfigMountIndex !== null &&
        editingConfigMountIndex >= 0 &&
        editingConfigMountIndex < current.length
      ) {
        return current.map((item, index) =>
          index === editingConfigMountIndex
            ? {
                ...configMountDraft,
                sourceName,
              }
            : item
        )
      }
      return [
        ...current,
        {
          ...configMountDraft,
          sourceName,
        },
      ]
    })
    setEditingConfigMount(false)
    setEditingConfigMountIndex(null)
    setConfigMountSaveAttempted(false)
    setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
  }, [configMountDraft, editingConfigMountIndex])

  const removeConfigMount = React.useCallback((index: number) => {
    setSavedConfigMounts((current) => current.filter((_, i) => i !== index))
    if (editingConfigMountIndex === index) {
      setEditingConfigMount(false)
      setEditingConfigMountIndex(null)
      setConfigMountSaveAttempted(false)
      setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
    } else if (editingConfigMountIndex !== null && editingConfigMountIndex > index) {
      setEditingConfigMountIndex(editingConfigMountIndex - 1)
    }
  }, [editingConfigMountIndex])
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isBusy) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div ref={createDialogPopupLayerRef} className="pointer-events-none absolute inset-0 z-50" />
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between border-b bg-muted/15">
            <DialogHeader className="px-6 py-4">
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>{dialogDescription}</DialogDescription>
            </DialogHeader>
            <div className="h-full flex items-center me-20">
              <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                <span className="text-sm font-medium">编辑 YAML</span>
                <Switch
                  checked={yamlMode}
                  onCheckedChange={(checked) => handleYamlModeChange(checked, savedConfigMounts)}
                  disabled={isBusy}
                  aria-label="编辑 YAML"
                />
              </div>
            </div>
          </div>

          {!yamlMode ? (
            <StepHeaderNav
              items={[
              {
                id: "basic",
                title: "基本信息",
                status: activeStep === "basic" ? "当前" : "已设置",
                active: activeStep === "basic",
                icon: <IconSettings2 className="size-4" />,
                disabled: !canNavigateStorageView,
                onClick: () => {
                  if (!canNavigateStorageView) return
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
                disabled: !canNavigateStorageView,
                onClick: () => {
                  if (!canNavigateStorageView) return
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
                disabled: !canNavigateStorageView,
                onClick: () => {
                  if (!canNavigateStorageView || currentStepIndex < 1) return
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
                disabled: !canNavigateStorageView,
                onClick: () => {
                  if (!canNavigateStorageView || currentStepIndex < 2) return
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
                status:
                  activeStep === "advanced"
                    ? "当前"
                    : hasUserProvidedMetadata(labelEntries, annotationEntries)
                      ? "已设置"
                      : "未设置",
                active: activeStep === "advanced",
                icon: <IconStack2 className="size-4" />,
                disabled: !canNavigateStorageView,
                onClick: () => {
                  if (!canNavigateStorageView || currentStepIndex < 3) return
                  setActiveStep("advanced")
                  setSubmitError(null)
                },
              },
              ]}
            />
          ) : null}

          <div className={yamlMode ? "min-h-0 flex-1 px-6 py-6" : "min-h-0 flex-1 overflow-y-auto px-6 py-6"}>
            {yamlMode ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                  <MonacoEditor
                    language="yaml"
                    theme="vs-dark"
                    value={yamlText}
                    onChange={(value) => {
                      setYamlText(value ?? "")
                      if (yamlError) setYamlError(null)
                    }}
                    options={MONACO_OPTIONS}
                    height="100%"
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

                  <ProjectNamespaceField
                    id="create-job-namespace"
                    options={namespaceOptions}
                    value={namespace}
                    onValueChange={(value) => {
                      if (isEditMode) return
                      setNamespace(value)
                      if (namespaceError) setNamespaceError(null)
                      if (submitError) setSubmitError(null)
                    }}
                    error={namespaceError}
                    description="选择任务所属项目。"
                    disabled={isBusy || isEditMode}
                    contentContainer={createDialogPopupLayerRef}
                  />

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
                        placeholder="0 0 1 * *（每月）"
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
                  <Field className={kind === "CronJob" ? "" : "md:col-span-2"}>
                    <FieldLabel htmlFor="create-job-description">描述</FieldLabel>
                    <Textarea
                      id="create-job-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="请输入描述"
                      maxLength={256}
                      className="min-h-24"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      描述将写入资源注解 description，最长 256 个字符。
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
                      placeholder="6"
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
                      placeholder="1"
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
                      placeholder="1"
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
                      placeholder="3600"
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

                  <ContainerListPanel
                    items={configuredContainers}
                    isBusy={isBusy}
                    submitError={submitError}
                    podRequiredMessage={POD_REQUIRED_MESSAGE}
                    onAdd={addContainer}
                    onEdit={beginEditContainer}
                    onRequestDelete={setPendingDeleteContainerId}
                  />
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
                            updateStorageVolumeDraft("volumeId", "")
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

                    {storageVolumeDraft.volumeKind === "persistent" ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-id">卷名称</FieldLabel>
                          <Input
                            id="create-job-storage-volume-id"
                            value={storageVolumeDraft.volumeId}
                            onChange={(event) => updateStorageVolumeDraft("volumeId", event.target.value)}
                            placeholder="volume-data"
                            autoComplete="off"
                            aria-invalid={
                              (storageSaveAttempted && isPersistentVolumeIdEmpty) ||
                              hasDuplicateStorageSelection
                            }
                          />
                          {hasDuplicateStorageSelection ? (
                            <FieldDescription className="text-destructive">
                              卷名称已存在，请回到上方已添加条目中编辑。
                            </FieldDescription>
                          ) : storageSaveAttempted && isPersistentVolumeIdEmpty ? (
                            <FieldDescription className="text-destructive">
                              请输入卷名称，或点击取消返回。
                            </FieldDescription>
                          ) : null}
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-name">选择 PVC</FieldLabel>
                          <Select
                            value={storageVolumeDraft.volumeName}
                            onValueChange={(value) => {
                              const previousSelectedPvc = storageVolumeDraft.volumeName.trim()
                              const currentVolumeId = storageVolumeDraft.volumeId.trim()
                              updateStorageVolumeDraft("volumeName", value)
                              if (!currentVolumeId || currentVolumeId === previousSelectedPvc) {
                                updateStorageVolumeDraft("volumeId", value)
                              }
                            }}
                            disabled={persistentVolumeNameLoading || volumeNameOptions.length === 0}
                          >
                            <SelectTrigger
                              id="create-job-storage-volume-name"
                              aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                            >
                              <SelectValue
                                placeholder={
                                  persistentVolumeNameLoading
                                    ? "PVC 加载中..."
                                    : "请选择 PVC"
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
                          {persistentVolumeNameError ? (
                            <FieldDescription className="text-destructive">{persistentVolumeNameError}</FieldDescription>
                          ) : storageSaveAttempted && isStorageVolumeNameEmpty ? (
                            <FieldDescription className="text-destructive">
                              请选择 PVC，或点击取消返回。
                            </FieldDescription>
                          ) : volumeNameOptions.length === 0 && !persistentVolumeNameLoading ? (
                            <FieldDescription>当前命名空间暂无可选 PVC。</FieldDescription>
                          ) : null}
                        </Field>
                      </div>
                    ) : storageVolumeDraft.volumeKind === "hostPath" ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-id">卷名称</FieldLabel>
                          <Input
                            id="create-job-storage-volume-id"
                            value={storageVolumeDraft.volumeId}
                            onChange={(event) => updateStorageVolumeDraft("volumeId", event.target.value)}
                            placeholder="test3"
                            autoComplete="off"
                            aria-invalid={
                              (storageSaveAttempted && isHostPathVolumeIdEmpty) ||
                              hasDuplicateStorageSelection
                            }
                          />
                          {hasDuplicateStorageSelection ? (
                            <FieldDescription className="text-destructive">
                              卷名称已存在，请回到上方已添加条目中编辑。
                            </FieldDescription>
                          ) : storageSaveAttempted && isHostPathVolumeIdEmpty ? (
                            <FieldDescription className="text-destructive">
                              请输入卷名称，或点击取消返回。
                            </FieldDescription>
                          ) : null}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-name">主机路径</FieldLabel>
                          <Input
                            id="create-job-storage-volume-name"
                            value={storageVolumeDraft.volumeName}
                            onChange={(event) => updateStorageVolumeDraft("volumeName", event.target.value)}
                            placeholder="/test3"
                            autoComplete="off"
                            aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                          />
                          {storageSaveAttempted && isStorageVolumeNameEmpty ? (
                            <FieldDescription className="text-destructive">
                              请输入主机路径，或点击取消返回。
                            </FieldDescription>
                          ) : null}
                        </Field>
                      </div>
                    ) : (
                      <Field>
                        <FieldLabel htmlFor="create-job-storage-volume-name">卷名称</FieldLabel>
                        <Input
                          id="create-job-storage-volume-name"
                          value={storageVolumeDraft.volumeName}
                          onChange={(event) => {
                            const value = event.target.value
                            updateStorageVolumeDraft("volumeName", value)
                            updateStorageVolumeDraft("volumeId", value)
                          }}
                          placeholder="test2"
                          autoComplete="off"
                          aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                        />
                        {storageSaveAttempted && isStorageVolumeNameEmpty ? (
                          <FieldDescription className="text-destructive">
                            请输入卷名称，或点击取消返回。
                          </FieldDescription>
                        ) : null}
                      </Field>
                    )}

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
                              placeholder="/etc/config"
                              autoComplete="off"
                              disabled={item.mountMode === "none"}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </FieldGroup>
                ) : isEditingConfigMountView ? (
                  <FieldGroup className="flex flex-col gap-6">
                    <Field>
                      <FieldLabel>挂载来源类型</FieldLabel>
                      <Tabs
                        value={configMountDraft.sourceKind}
                        onValueChange={(value) => {
                          if (value === "configMap" || value === "secret") {
                            updateConfigMountDraft("sourceKind", value)
                            updateConfigMountDraft("sourceName", "")
                          }
                        }}
                      >
                        <TabsList className="grid w-full max-w-xl grid-cols-2">
                          <TabsTrigger value="configMap">配置字典</TabsTrigger>
                          <TabsTrigger value="secret">保密字典</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="create-job-config-mount-name">
                        {configMountDraft.sourceKind === "configMap" ? "选择配置字典" : "选择保密字典"}
                      </FieldLabel>
                      <Select
                        value={configMountDraft.sourceName}
                        onValueChange={(value) => {
                          updateConfigMountDraft("sourceName", value)
                          if (configMountSaveAttempted) setConfigMountSaveAttempted(false)
                        }}
                        disabled={configResourceLoading || configSourceNameOptions.length === 0}
                      >
                        <SelectTrigger
                          id="create-job-config-mount-name"
                          aria-invalid={configMountSaveAttempted && isConfigSourceNameEmpty}
                        >
                          <SelectValue
                            placeholder={
                              configResourceLoading
                                ? "资源加载中..."
                                : configMountDraft.sourceKind === "configMap"
                                  ? "请选择配置字典"
                                  : "请选择保密字典"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {configSourceNameOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {configResourceError ? (
                        <FieldDescription className="text-destructive">{configResourceError}</FieldDescription>
                      ) : configMountSaveAttempted && isConfigSourceNameEmpty ? (
                        <FieldDescription className="text-destructive">
                          请选择资源，或点击取消返回。
                        </FieldDescription>
                      ) : configSourceNameOptions.length === 0 && !configResourceLoading ? (
                        <FieldDescription>
                          当前命名空间暂无可选{configMountDraft.sourceKind === "configMap" ? "配置字典" : "保密字典"}。
                        </FieldDescription>
                      ) : (
                        <FieldDescription>
                          将{configMountDraft.sourceKind === "configMap" ? "配置字典" : "保密字典"}挂载到容器。
                        </FieldDescription>
                      )}
                    </Field>

                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-3 gap-4">
                        <FieldLabel>容器</FieldLabel>
                        <FieldLabel>挂载模式</FieldLabel>
                        <FieldLabel>挂载路径</FieldLabel>
                      </div>
                      <div className="flex flex-col gap-3">
                        {configMountDraft.mounts.map((item, index) => (
                          <div key={item.containerName} className="grid grid-cols-3 gap-4">
                            <Input
                              id={`create-job-config-container-${index}`}
                              value={item.containerName}
                              disabled
                              autoComplete="off"
                            />
                            <Select
                              value={item.mountMode}
                              onValueChange={(value) => {
                                if (value === "none" || value === "ro") {
                                  updateConfigMountDraftMount(item.containerName, "mountMode", value)
                                }
                              }}
                            >
                              <SelectTrigger
                                id={`create-job-config-mode-${index}`}
                                aria-label="挂载模式"
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="none">不挂载</SelectItem>
                                  <SelectItem value="ro">只读</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <Input
                              id={`create-job-config-path-${index}`}
                              value={item.mountPath}
                              onChange={(event) =>
                                updateConfigMountDraftMount(item.containerName, "mountPath", event.target.value)
                              }
                              placeholder="/etc/config"
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
                      <StorageVolumeList
                        items={savedStorageVolumes}
                        onEdit={startEditStorageVolume}
                        onRequestDelete={setPendingDeleteStorageIndex}
                        onAdd={startAddStorageVolume}
                        disabled={isBusy}
                      />
                    </Field>

                    <Field>
                      <FieldLabel>挂载配置字典或保密字典</FieldLabel>
                      <div className="flex flex-col gap-3">
                        {savedConfigMounts.length > 0 ? (
                          savedConfigMounts.map((item, index) => (
                            <Item
                              key={`${item.sourceKind}-${item.sourceName}-${index}`}
                              variant="outline"
                              size="sm"
                              className="hover:bg-muted"
                            >
                              <ItemContent className="min-w-0">
                                <ItemTitle className="min-w-0 truncate">{item.sourceName}</ItemTitle>
                                <ItemDescription className="min-w-0 truncate">
                                  {(item.sourceKind === "configMap" ? "配置字典" : "保密字典") +
                                    " · " +
                                    `${item.mounts.filter((mount) => mount.mountMode !== "none" && mount.mountPath.trim().length > 0).length} 个容器已配置`}
                                </ItemDescription>
                              </ItemContent>
                              <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    startEditConfigMount(index)
                                  }}
                                  disabled={isBusy}
                                >
                                  <IconPencil data-icon="inline-start" />
                                  编辑
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setPendingDeleteConfigMountIndex(index)
                                  }}
                                  disabled={isBusy}
                                >
                                  <IconTrash data-icon="inline-start" />
                                  删除
                                </Button>
                              </ItemActions>
                            </Item>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                            <div className="text-sm font-semibold">暂无配置挂载</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              可挂载配置字典或保密字典内容到容器。
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={startAddConfigMount}
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
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">高级设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{resolveStepDescription(activeStep)}</p>
                </div>
                <FieldGroup className="grid gap-4 md:grid-cols-2">
                  <Field className="md:col-span-2">
                    <ResourceMetadataEditor
                      checked={metadataEnabled}
                      onCheckedChange={setMetadataEnabled}
                      labels={labelEntries}
                      setLabels={setLabelEntries}
                      annotations={annotationEntries}
                      setAnnotations={setAnnotationEntries}
                      description={description}
                      setDescription={setDescription}
                      disabled={isBusy}
                      titleText="统一管理任务的标签与注解信息。"
                    />
                  </Field>
                </FieldGroup>
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
                <Button type="button" onClick={() => void handleCreate(savedConfigMounts)} disabled={isBusy}>
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
          ) : isEditingConfigMountView ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelEditConfigMount} disabled={isBusy}>
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={confirmEditConfigMount}
                  disabled={isBusy || isConfigSourceNameEmpty}
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
                <Button type="button" onClick={() => void handleCreate(savedConfigMounts)} disabled={isBusy}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={!canNavigateStorageView}>
                  上一步
                </Button>
                <Button type="button" onClick={() => void goNext()} disabled={!canNavigateStorageView}>
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
        <DeleteConfirmDialog
          open={pendingDeleteStorageIndex !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingDeleteStorageIndex(null)
          }}
          title="删除挂载卷"
          description={
            pendingDeleteStorageIndex !== null
              ? `确定删除挂载卷 ${(savedStorageVolumes[pendingDeleteStorageIndex]?.volumeId || savedStorageVolumes[pendingDeleteStorageIndex]?.volumeName || "未命名卷").trim()} 吗？`
              : ""
          }
          deleting={isBusy}
          onConfirm={() => {
            if (pendingDeleteStorageIndex === null) return
            removeStorageVolume(pendingDeleteStorageIndex)
            setPendingDeleteStorageIndex(null)
          }}
        />
        <DeleteConfirmDialog
          open={pendingDeleteConfigMountIndex !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingDeleteConfigMountIndex(null)
          }}
          title="删除配置挂载"
          description={
            pendingDeleteConfigMountIndex !== null
              ? `确定删除配置挂载 ${(savedConfigMounts[pendingDeleteConfigMountIndex]?.sourceName || "未命名配置").trim()} 吗？`
              : ""
          }
          deleting={isBusy}
          onConfirm={() => {
            if (pendingDeleteConfigMountIndex === null) return
            removeConfigMount(pendingDeleteConfigMountIndex)
            setPendingDeleteConfigMountIndex(null)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
