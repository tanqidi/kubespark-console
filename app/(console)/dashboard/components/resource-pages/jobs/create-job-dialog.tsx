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
import { useTranslations } from "@/app/lib/i18n"

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
    enterYamlMode,
    cancelYamlMode,
    confirmYamlMode,
    handleCreate,
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
  const t = useTranslations()
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
            : t("jobDialog.loadPvcFailed")
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
            : t("jobDialog.loadConfigFailed")
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
                <span className="text-sm font-medium">{t("jobDialog.yamlMode")}</span>
                <Switch
                  checked={yamlMode}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      enterYamlMode(savedConfigMounts)
                      return
                    }
                    cancelYamlMode()
                  }}
                  disabled={isBusy}
                  aria-label={t("jobDialog.yamlMode")}
                />
              </div>
            </div>
          </div>

          {!yamlMode ? (
            <StepHeaderNav
              items={[
              {
                id: "basic",
                title: t("jobDialog.basicInfo"),
                status: activeStep === "basic" ? t("workloadDialog.current") : t("workloadDialog.configured"),
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
                title: t("jobDialog.strategySettings"),
                status: activeStep === "strategy" ? t("workloadDialog.current") : currentStepIndex > 1 ? t("workloadDialog.configured") : t("workloadDialog.notConfigured"),
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
                title: t("jobDialog.podSettings"),
                status: activeStep === "pod" ? t("workloadDialog.current") : currentStepIndex > 2 ? t("workloadDialog.configured") : t("workloadDialog.notConfigured"),
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
                title: t("jobDialog.storageSettings"),
                status: activeStep === "storage" ? t("workloadDialog.current") : currentStepIndex > 3 ? t("workloadDialog.configured") : t("workloadDialog.notConfigured"),
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
                title: t("jobDialog.advancedSettings"),
                status:
                  activeStep === "advanced"
                    ? t("workloadDialog.current")
                    : hasUserProvidedMetadata(labelEntries, annotationEntries)
                      ? t("workloadDialog.configured")
                      : t("workloadDialog.notConfigured"),
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
                  <h3 className="text-[15px] font-semibold">{t("jobDialog.basicInfo")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("jobDialog.basicInfoDesc")}
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field data-invalid={Boolean(nameError)}>
                    <FieldLabel htmlFor="create-job-name">{t("jobDialog.name")}</FieldLabel>
                    <Input
                      id="create-job-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameError) setNameError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      placeholder={kind === "CronJob" ? t("jobDialog.cronJobNamePlaceholder") : t("jobDialog.namePlaceholder")}
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={isBusy || isEditMode}
                    />
                    {nameError ? (
                      <FieldError>{nameError}</FieldError>
                    ) : (
                      <FieldDescription>{t("jobDialog.nameRule")}</FieldDescription>
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
                    description={t("jobDialog.namespaceSelect")}
                    disabled={isBusy || isEditMode}
                    contentContainer={createDialogPopupLayerRef}
                  />

                  {kind === "CronJob" ? (
                    <Field data-invalid={Boolean(scheduleError)}>
                      <FieldLabel htmlFor="create-job-schedule">{t("jobDialog.schedule")}</FieldLabel>
                      <Input
                        id="create-job-schedule"
                        value={schedule}
                        onChange={(event) => {
                          setSchedule(event.target.value)
                          if (scheduleError) setScheduleError(null)
                          if (submitError) setSubmitError(null)
                        }}
                        placeholder={t("jobDialog.schedulePlaceholder")}
                        autoComplete="off"
                        aria-invalid={Boolean(scheduleError)}
                        disabled={isBusy}
                      />
                      {scheduleError ? (
                        <FieldError>{scheduleError}</FieldError>
                      ) : (
                        <FieldDescription>
                          {t("jobDialog.scheduleHint")}
                        </FieldDescription>
                      )}
                    </Field>
                  ) : null}
                  <Field className={kind === "CronJob" ? "" : "md:col-span-2"}>
                    <FieldLabel htmlFor="create-job-description">{t("jobDialog.description")}</FieldLabel>
                    <Textarea
                      id="create-job-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={t("jobDialog.descriptionPlaceholder")}
                      maxLength={256}
                      className="min-h-24"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      {t("jobDialog.descriptionHint")}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : isStrategyStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">{t("jobDialog.strategySettings")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("jobDialog.strategySettingsDesc")}
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="create-job-backoff-limit">{t("jobDialog.backoffLimit")}</FieldLabel>
                    <Input
                      id="create-job-backoff-limit"
                      value={backoffLimit}
                      onChange={(event) => setBackoffLimit(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t("jobDialog.backoffLimitPlaceholder")}
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      {t("jobDialog.backoffLimitHint")}
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-completions">{t("jobDialog.completions")}</FieldLabel>
                    <Input
                      id="create-job-completions"
                      value={completions}
                      onChange={(event) => setCompletions(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t("jobDialog.completionsPlaceholder")}
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      {t("jobDialog.completionsHint")}
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-parallelism">{t("jobDialog.parallelism")}</FieldLabel>
                    <Input
                      id="create-job-parallelism"
                      value={parallelism}
                      onChange={(event) => setParallelism(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t("jobDialog.parallelismPlaceholder")}
                      disabled={isBusy}
                    />
                    <FieldDescription>{t("jobDialog.parallelismHint")}</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-active-deadline">{t("jobDialog.activeDeadlineSeconds")}</FieldLabel>
                    <Input
                      id="create-job-active-deadline"
                      value={activeDeadlineSeconds}
                      onChange={(event) =>
                        setActiveDeadlineSeconds(normalizeIntegerInput(event.target.value))
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={t("jobDialog.activeDeadlineSecondsPlaceholder")}
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      {t("jobDialog.activeDeadlineSecondsHint")}
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : isPodStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">{t("jobDialog.podSettings")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("jobDialog.podSettingsDesc")}
                  </p>
                </div>

                <FieldGroup className="flex flex-col gap-6">
                  <Field>
                    <FieldLabel htmlFor="create-job-restart-policy">{t("jobDialog.restartPolicy")}</FieldLabel>
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
                          <SelectItem value="Never">{t("jobDialog.restartPolicyNever")}</SelectItem>
                          <SelectItem value="OnFailure">{t("jobDialog.restartPolicyOnFailure")}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {t("jobDialog.restartPolicyHint")}
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
                  <h3 className="text-[15px] font-semibold">{t("jobDialog.storageSettings")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("jobDialog.storageSettingsDesc")}
                  </p>
                </div>
                {isEditingStorageView ? (
                  <FieldGroup className="flex flex-col gap-6">
                    <Field>
                      <FieldLabel>{t("jobDialog.volumeType")}</FieldLabel>
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
                          <TabsTrigger value="persistent">{t("jobDialog.persistent")}</TabsTrigger>
                          <TabsTrigger value="ephemeral">{t("jobDialog.ephemeral")}</TabsTrigger>
                          <TabsTrigger value="hostPath">{t("jobDialog.hostPath")}</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </Field>

                    {storageVolumeDraft.volumeKind === "persistent" ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-id">{t("jobDialog.volumeName")}</FieldLabel>
                          <Input
                            id="create-job-storage-volume-id"
                            value={storageVolumeDraft.volumeId}
                            onChange={(event) => updateStorageVolumeDraft("volumeId", event.target.value)}
                            placeholder={t("jobDialog.volumeNamePlaceholder")}
                            autoComplete="off"
                            aria-invalid={
                              (storageSaveAttempted && isPersistentVolumeIdEmpty) ||
                              hasDuplicateStorageSelection
                            }
                          />
                          {hasDuplicateStorageSelection ? (
                            <FieldDescription className="text-destructive">
                              {t("jobDialog.volumeNameDuplicate")}
                            </FieldDescription>
                          ) : storageSaveAttempted && isPersistentVolumeIdEmpty ? (
                            <FieldDescription className="text-destructive">
                              {t("jobDialog.volumeNameRequired")}
                            </FieldDescription>
                          ) : null}
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-name">{t("jobDialog.selectPvc")}</FieldLabel>
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
                                    ? t("jobDialog.pvcLoading")
                                    : t("jobDialog.selectPvcPlaceholder")
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
                              {t("jobDialog.pvcRequired")}
                            </FieldDescription>
                          ) : volumeNameOptions.length === 0 && !persistentVolumeNameLoading ? (
                            <FieldDescription>{t("jobDialog.noPvc")}</FieldDescription>
                          ) : null}
                        </Field>
                      </div>
                    ) : storageVolumeDraft.volumeKind === "hostPath" ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-id">{t("jobDialog.volumeName")}</FieldLabel>
                          <Input
                            id="create-job-storage-volume-id"
                            value={storageVolumeDraft.volumeId}
                            onChange={(event) => updateStorageVolumeDraft("volumeId", event.target.value)}
                            placeholder={t("jobDialog.volumeNamePlaceholder")}
                            autoComplete="off"
                            aria-invalid={
                              (storageSaveAttempted && isHostPathVolumeIdEmpty) ||
                              hasDuplicateStorageSelection
                            }
                          />
                          {hasDuplicateStorageSelection ? (
                            <FieldDescription className="text-destructive">
                              {t("jobDialog.volumeNameDuplicate")}
                            </FieldDescription>
                          ) : storageSaveAttempted && isHostPathVolumeIdEmpty ? (
                            <FieldDescription className="text-destructive">
                              {t("jobDialog.volumeNameRequired")}
                            </FieldDescription>
                          ) : null}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="create-job-storage-volume-name">{t("jobDialog.hostPath")}</FieldLabel>
                          <Input
                            id="create-job-storage-volume-name"
                            value={storageVolumeDraft.volumeName}
                            onChange={(event) => updateStorageVolumeDraft("volumeName", event.target.value)}
                            placeholder={t("jobDialog.hostPathPlaceholder")}
                            autoComplete="off"
                            aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                          />
                          {storageSaveAttempted && isStorageVolumeNameEmpty ? (
                            <FieldDescription className="text-destructive">
                              {t("jobDialog.volumeNameRequired")}
                            </FieldDescription>
                          ) : null}
                        </Field>
                      </div>
                    ) : (
                      <Field>
                        <FieldLabel htmlFor="create-job-storage-volume-name">{t("jobDialog.volumeName")}</FieldLabel>
                        <Input
                          id="create-job-storage-volume-name"
                          value={storageVolumeDraft.volumeName}
                          onChange={(event) => {
                            const value = event.target.value
                            updateStorageVolumeDraft("volumeName", value)
                            updateStorageVolumeDraft("volumeId", value)
                          }}
                          placeholder={t("jobDialog.volumeNamePlaceholder")}
                          autoComplete="off"
                          aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                        />
                        {storageSaveAttempted && isStorageVolumeNameEmpty ? (
                          <FieldDescription className="text-destructive">
                            {t("jobDialog.volumeNameRequired")}
                          </FieldDescription>
                        ) : null}
                      </Field>
                    )}

                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-3 gap-4">
                        <FieldLabel>{t("jobDialog.container")}</FieldLabel>
                        <FieldLabel>{t("jobDialog.mountMode")}</FieldLabel>
                        <FieldLabel>{t("jobDialog.mountPath")}</FieldLabel>
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
                                aria-label={t("jobDialog.mountMode")}
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="none">{t("jobDialog.notMounted")}</SelectItem>
                                  <SelectItem value="ro">{t("jobDialog.readOnly")}</SelectItem>
                                  <SelectItem value="rw">{t("jobDialog.readWrite")}</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <Input
                              id={`create-job-storage-path-${index}`}
                              value={item.mountPath}
                              onChange={(event) =>
                                updateStorageVolumeMount(item.containerName, "mountPath", event.target.value)
                              }
                              placeholder={t("jobDialog.mountPathPlaceholder")}
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
                      <FieldLabel>{t("jobDialog.mountSourceType")}</FieldLabel>
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
                          <TabsTrigger value="configMap">{t("jobDialog.configMap")}</TabsTrigger>
                          <TabsTrigger value="secret">{t("jobDialog.secret")}</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="create-job-config-mount-name">
                        {configMountDraft.sourceKind === "configMap" ? t("jobDialog.selectConfigMap") : t("jobDialog.selectSecret")}
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
                                ? t("jobDialog.configLoading")
                                : configMountDraft.sourceKind === "configMap"
                                  ? t("jobDialog.selectConfigMap")
                                  : t("jobDialog.selectSecret")
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
                          {t("jobDialog.configRequired")}
                        </FieldDescription>
                      ) : configSourceNameOptions.length === 0 && !configResourceLoading ? (
                        <FieldDescription>
                          {t("jobDialog.noConfig").replace("{type}", configMountDraft.sourceKind === "configMap" ? t("jobDialog.configMap") : t("jobDialog.secret"))}
                        </FieldDescription>
                      ) : (
                        <FieldDescription>
                          {t("jobDialog.mountHint").replace("{type}", configMountDraft.sourceKind === "configMap" ? t("jobDialog.configMap") : t("jobDialog.secret"))}
                        </FieldDescription>
                      )}
                    </Field>

                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-3 gap-4">
                        <FieldLabel>{t("jobDialog.container")}</FieldLabel>
                        <FieldLabel>{t("jobDialog.mountMode")}</FieldLabel>
                        <FieldLabel>{t("jobDialog.mountPath")}</FieldLabel>
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
                                aria-label={t("jobDialog.mountMode")}
                                className="w-full"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="none">{t("jobDialog.notMounted")}</SelectItem>
                                  <SelectItem value="ro">{t("jobDialog.readOnly")}</SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            <Input
                              id={`create-job-config-path-${index}`}
                              value={item.mountPath}
                              onChange={(event) =>
                                updateConfigMountDraftMount(item.containerName, "mountPath", event.target.value)
                              }
                              placeholder={t("jobDialog.mountPathPlaceholder")}
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
                      <FieldLabel>{t("jobDialog.addStorage")}</FieldLabel>
                      <StorageVolumeList
                        items={savedStorageVolumes}
                        onEdit={startEditStorageVolume}
                        onRequestDelete={setPendingDeleteStorageIndex}
                        onAdd={startAddStorageVolume}
                        disabled={isBusy}
                      />
                    </Field>

                    <Field>
                      <FieldLabel>{t("jobDialog.addConfigMount")}</FieldLabel>
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
                                  {(item.sourceKind === "configMap" ? t("jobDialog.configMap") : t("jobDialog.secret")) +
                                    " · " +
                                    `${item.mounts.filter((mount) => mount.mountMode !== "none" && mount.mountPath.trim().length > 0).length} ${t("jobDialog.configMounted")}`}
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
                                  {t("actions.edit")}
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
                                  {t("actions.delete")}
                                </Button>
                              </ItemActions>
                            </Item>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                            <div className="text-sm font-semibold">{t("jobDialog.noConfigMounts")}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {t("jobDialog.addConfigMountDesc")}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={startAddConfigMount}
                          disabled={isBusy}
                        >
                          <span className="text-sm font-semibold">{t("jobDialog.addConfigMountLabel")}</span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            {t("jobDialog.addConfigMountDesc2")}
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
                  <h3 className="text-[15px] font-semibold">{t("jobDialog.advancedSettings")}</h3>
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
                      titleText={t("workloadDialog.advancedSettingsDesc")}
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
                <Button type="button" variant="outline" onClick={cancelYamlMode} disabled={isBusy}>
                  {t("jobDialog.cancel")}
                </Button>
                <Button type="button" onClick={confirmYamlMode} disabled={isBusy}>
                  {t("jobDialog.confirmSave")}
                </Button>
              </div>
            </DialogFooter>
          ) : isEditingStorageView ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelEditStorageVolume} disabled={isBusy}>
                  {t("jobDialog.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmStorageSave}
                  disabled={isBusy || hasDuplicateStorageSelection}
                >
                  {t("jobDialog.confirmSave")}
                </Button>
              </div>
            </DialogFooter>
          ) : isEditingConfigMountView ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelEditConfigMount} disabled={isBusy}>
                  {t("jobDialog.cancel")}
                </Button>
                <Button
                  type="button"
                  onClick={confirmEditConfigMount}
                  disabled={isBusy || isConfigSourceNameEmpty}
                >
                  {t("jobDialog.confirmSave")}
                </Button>
              </div>
            </DialogFooter>
          ) : isBasicStep ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    {t("jobDialog.cancel")}
                  </Button>
                </DialogClose>
                <Button type="button" onClick={() => void goNext()} disabled={isBusy}>
                  {checkingNext ? t("jobDialog.checking") : t("jobDialog.nextStep")}
                </Button>
              </div>
            </DialogFooter>
          ) : isFinalStep ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={isBusy}>
                  {t("jobDialog.previousStep")}
                </Button>
                <Button type="button" onClick={() => void handleCreate(savedConfigMounts)} disabled={isBusy}>
                  {creating ? (isEditMode ? t("jobDialog.saving") : t("jobDialog.creating")) : isEditMode ? t("jobDialog.save") : t("jobDialog.create")}
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={!canNavigateStorageView}>
                  {t("jobDialog.previousStep")}
                </Button>
                <Button type="button" onClick={() => void goNext()} disabled={!canNavigateStorageView}>
                  {t("jobDialog.nextStep")}
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
          title={t("jobDialog.deleteContainer")}
          description={
            pendingDeleteContainer
              ? t("jobDialog.confirmDeleteContainer").replace("{name}", pendingDeleteContainer.name.trim() || t("jobDialog.unnamedContainer"))
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
          title={t("jobDialog.deleteMountVolume")}
          description={
            pendingDeleteStorageIndex !== null
              ? t("jobDialog.confirmDeleteMountVolume").replace("{name}", (savedStorageVolumes[pendingDeleteStorageIndex]?.volumeId || savedStorageVolumes[pendingDeleteStorageIndex]?.volumeName || t("jobDialog.unnamedVolume")).trim())
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
          title={t("jobDialog.deleteConfigMount")}
          description={
            pendingDeleteConfigMountIndex !== null
              ? t("jobDialog.confirmDeleteConfigMount").replace("{name}", (savedConfigMounts[pendingDeleteConfigMountIndex]?.sourceName || t("jobDialog.unnamedConfig")).trim())
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



