"use client"

import * as React from "react"

import { resolveFirstInvalidFieldId, scrollAndFocusFieldById } from "@/app/lib/kubespark/form-validation"
import { checkJobExists } from "@/app/lib/kubespark/jobs"
import type {
  CreateJobDialogProps,
  CreateStep,
  JobConfigInput,
  JobDialogSnapshot,
} from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog.logic"
import {
  CONTAINER_PORT_PROTOCOL_SET,
  CRON_SCHEDULE_REQUIRED_MESSAGE,
  DEFAULT_CRON_SCHEDULE,
  POD_REQUIRED_MESSAGE,
  STEP_ORDER,
  buildAutoPortName,
  buildJobYamlText,
  createContainerDraft,
  createContainerDraftFromInitial,
  createContainerEnvDraft,
  createContainerPortDraft,
  ensureUniqueContainerName,
  hasSecurityContextValue,
  isAutoContainerNameForImage,
  isAutoPortNameForProtocol,
  normalizeLifecycleMap,
  normalizeProbeMap,
  normalizeSecurityContextDraft,
  parseEditorTextToStringList,
  parseJobYamlText,
  replaceProtocolPrefixInName,
  resolveContainerNameFromImage,
  resolveDuplicateContainerEnvNameIds,
  resolveSubmitErrorMessage,
  toDnsLabelFragment,
  toOptionalNonNegativeInt,
  validateContainerPorts,
  validateName,
} from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog.logic"
import { useContainerEditor } from "@/app/(console)/dashboard/components/resource-pages/use-container-editor"
import {
  hasUserProvidedMetadata,
  metadataEntriesToRecord,
  metadataRecordToEntries,
  type MetadataEntry,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"

type StorageVolumeKind = "persistent" | "ephemeral" | "hostPath"
type StorageMountMode = "none" | "ro" | "rw"

type StorageContainerMount = {
  containerName: string
  mountMode: StorageMountMode
  mountPath: string
}

type StorageVolumeDraft = {
  volumeId: string
  volumeKind: StorageVolumeKind
  volumeName: string
  mounts: StorageContainerMount[]
}

const EMPTY_STORAGE_VOLUME_DRAFT: StorageVolumeDraft = {
  volumeId: "",
  volumeKind: "persistent",
  volumeName: "",
  mounts: [],
}

const DESCRIPTION_MAX_LENGTH = 256

export function useCreateJobDialogController(props: CreateJobDialogProps) {
  const {
    open,
    onOpenChange,
    kind,
    mode = "create",
    initialValues = null,
    onSubmit,
  } = props
  const isEditMode = mode === "edit"
  const [activeStep, setActiveStep] = React.useState<CreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [schedule, setSchedule] = React.useState(kind === "CronJob" ? DEFAULT_CRON_SCHEDULE : "")
  const [backoffLimit, setBackoffLimit] = React.useState("")
  const [completions, setCompletions] = React.useState("")
  const [parallelism, setParallelism] = React.useState("")
  const [activeDeadlineSeconds, setActiveDeadlineSeconds] = React.useState("")
  const [restartPolicy, setRestartPolicy] = React.useState<"Never" | "OnFailure">("Never")
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [scheduleError, setScheduleError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [yamlMode, setYamlMode] = React.useState(false)
  const [yamlText, setYamlText] = React.useState("")
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [storageVolumeDraft, setStorageVolumeDraft] = React.useState<StorageVolumeDraft>(EMPTY_STORAGE_VOLUME_DRAFT)
  const [savedStorageVolumes, setSavedStorageVolumes] = React.useState<StorageVolumeDraft[]>([])
  const [editingStorageVolumeIndex, setEditingStorageVolumeIndex] = React.useState<number | null>(null)
  const [editingStorageVolume, setEditingStorageVolume] = React.useState(false)
  const initializedEditKeyRef = React.useRef<string | null>(null)
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
    resetEditorUiState,
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
    submitError,
    setSubmitError,
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
  })

  const isBusy = checkingNext || creating
  const currentStepIndex = STEP_ORDER.indexOf(activeStep)
  const isBasicStep = activeStep === "basic"
  const isStrategyStep = activeStep === "strategy"
  const isPodStep = activeStep === "pod"
  const isStorageStep = activeStep === "storage"
  const isFinalStep = activeStep === "advanced"
  const isEditingPodView = containerDialogOpen
  const isEditingStorageView = isStorageStep && editingStorageVolume
  const canNavigateStep = !isBusy && !isEditingPodView && !isEditingStorageView

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
      setMetadataEnabled(false)
      setLabelEntries([{ key: "", value: "" }])
      setAnnotationEntries([{ key: "", value: "" }])
      setSchedule(kind === "CronJob" ? DEFAULT_CRON_SCHEDULE : "")
      setBackoffLimit("")
      setCompletions("")
      setParallelism("")
      setActiveDeadlineSeconds("")
      setRestartPolicy("Never")
      setContainers([])
      resetEditorUiState()
      setNameError(null)
      setNamespaceError(null)
      setScheduleError(null)
      setSubmitError(null)
      setYamlMode(false)
      setYamlText("")
      setYamlError(null)
      setCheckingNext(false)
      setCreating(false)
      setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
      setSavedStorageVolumes([])
      setEditingStorageVolumeIndex(null)
      setEditingStorageVolume(false)
      initializedEditKeyRef.current = null
    }
  }, [open, kind, resetEditorUiState, setContainers])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return
    const currentEditKey = `${initialValues.namespace.trim()}::${initialValues.name.trim().toLowerCase()}`
    const firstOpen = initializedEditKeyRef.current === null
    const switchedTarget = initializedEditKeyRef.current !== currentEditKey
    if (!firstOpen && !switchedTarget) return

    setActiveStep("basic")
    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
    const initialLabelEntries = metadataRecordToEntries(initialValues.labels ?? {})
    const initialAnnotationEntries = metadataRecordToEntries(initialValues.annotations ?? {})
    setLabelEntries(initialLabelEntries)
    setAnnotationEntries(initialAnnotationEntries)
    setMetadataEnabled(hasUserProvidedMetadata(initialLabelEntries, initialAnnotationEntries))
    setSchedule((initialValues.schedule ?? "").trim() || (kind === "CronJob" ? DEFAULT_CRON_SCHEDULE : ""))
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
    resetEditorUiState()
    setNameError(null)
    setNamespaceError(null)
    setScheduleError(null)
    setSubmitError(null)
    setYamlMode(false)
    setYamlText("")
    setYamlError(null)
    const initialStorageItems = Array.isArray(initialValues.pod?.storageList)
      ? initialValues.pod?.storageList
      : initialValues.pod?.storage
        ? [initialValues.pod.storage]
        : []

    const normalizedStorageItems = initialStorageItems
      .map((storageItem) => ({
        volumeId: typeof storageItem.volumeId === "string" ? storageItem.volumeId : "",
        volumeKind:
          storageItem.volumeKind === "ephemeral" ||
          storageItem.volumeKind === "hostPath" ||
          storageItem.volumeKind === "persistent"
            ? storageItem.volumeKind
            : "persistent",
        volumeName: typeof storageItem.volumeName === "string" ? storageItem.volumeName : "",
        mounts: Array.isArray(storageItem.mounts)
          ? storageItem.mounts
              .map((item) => ({
                containerName: typeof item.containerName === "string" ? item.containerName.trim() : "",
                mountMode:
                  item.mountMode === "ro" || item.mountMode === "rw" || item.mountMode === "none"
                    ? item.mountMode
                    : "none",
                mountPath: typeof item.mountPath === "string" ? item.mountPath.trim() : "",
              }))
              .filter((item) => item.containerName.length > 0)
          : [],
      }))
      .filter((item) => item.volumeName.trim().length > 0 || item.mounts.length > 0)

    setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    setSavedStorageVolumes(normalizedStorageItems)
    setEditingStorageVolumeIndex(null)
    setEditingStorageVolume(false)
    initializedEditKeyRef.current = currentEditKey
  }, [initialValues, isEditMode, kind, open, resetEditorUiState, setContainers])

  const resolveStorageContainerNames = React.useCallback(() => {
    const names =
      configuredContainers.length > 0
        ? configuredContainers.map((item) => item.name.trim())
        : containers.map((item) => item.name.trim())
    return Array.from(new Set(names.filter((item) => item.length > 0)))
  }, [configuredContainers, containers])

  const startEditStorageVolume = React.useCallback((index: number) => {
    setStorageVolumeDraft((current) => {
      const selected = savedStorageVolumes[index]
      const base =
        selected && (selected.volumeName.trim().length > 0 || selected.mounts.length > 0)
          ? selected
          : current
      const containerNames = resolveStorageContainerNames()
      const previousByName = new Map(base.mounts.map((item) => [item.containerName, item]))
      const mounts = containerNames.map((containerName) => {
        const previous = previousByName.get(containerName)
        return {
          containerName,
          mountMode: previous?.mountMode ?? "none",
          mountPath: previous?.mountPath ?? "",
        }
      })
      return {
        ...base,
        mounts,
      }
    })
    setEditingStorageVolumeIndex(index)
    setEditingStorageVolume(true)
    if (submitError) setSubmitError(null)
  }, [resolveStorageContainerNames, savedStorageVolumes, submitError])

  const startAddStorageVolume = React.useCallback(() => {
    const containerNames = resolveStorageContainerNames()
    const mounts = containerNames.map((containerName) => ({
      containerName,
      mountMode: "none" as const,
      mountPath: "",
    }))

    setStorageVolumeDraft({
      ...EMPTY_STORAGE_VOLUME_DRAFT,
      mounts,
    })
    setEditingStorageVolumeIndex(null)
    setEditingStorageVolume(true)
    if (submitError) setSubmitError(null)
  }, [resolveStorageContainerNames, submitError])

  const cancelEditStorageVolume = React.useCallback(() => {
    if (
      editingStorageVolumeIndex !== null &&
      editingStorageVolumeIndex >= 0 &&
      editingStorageVolumeIndex < savedStorageVolumes.length
    ) {
      setStorageVolumeDraft(savedStorageVolumes[editingStorageVolumeIndex] ?? EMPTY_STORAGE_VOLUME_DRAFT)
    } else {
      setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    }
    setEditingStorageVolumeIndex(null)
    setEditingStorageVolume(false)
  }, [editingStorageVolumeIndex, savedStorageVolumes])

  const confirmEditStorageVolume = React.useCallback(() => {
    const normalizedVolumeName = storageVolumeDraft.volumeName.trim()
    if (!normalizedVolumeName) return
    const currentVolumeId = storageVolumeDraft.volumeId.trim()
    const normalizedVolumeId =
      storageVolumeDraft.volumeKind === "ephemeral"
        ? normalizedVolumeName
        : currentVolumeId || normalizedVolumeName

    const nextItem: StorageVolumeDraft = {
      ...storageVolumeDraft,
      volumeId: normalizedVolumeId,
    }
    setSavedStorageVolumes((current) => {
      if (
        editingStorageVolumeIndex !== null &&
        editingStorageVolumeIndex >= 0 &&
        editingStorageVolumeIndex < current.length
      ) {
        return current.map((item, index) => (index === editingStorageVolumeIndex ? nextItem : item))
      }
      return [...current, nextItem]
    })
    setEditingStorageVolumeIndex(null)
    setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    setEditingStorageVolume(false)
  }, [editingStorageVolumeIndex, storageVolumeDraft])

  const updateStorageVolumeDraft = React.useCallback(
    <K extends keyof StorageVolumeDraft>(field: K, value: StorageVolumeDraft[K]) => {
      setStorageVolumeDraft((current) => ({
        ...current,
        [field]: value,
      }))
    },
    []
  )

  const updateStorageVolumeMount = React.useCallback(
    <K extends keyof Omit<StorageContainerMount, "containerName">>(
      containerName: string,
      field: K,
      value: StorageContainerMount[K]
    ) => {
      setStorageVolumeDraft((current) => ({
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

  const removeStorageVolume = React.useCallback((index: number) => {
    setSavedStorageVolumes((current) => current.filter((_, i) => i !== index))
    if (editingStorageVolumeIndex === index) {
      setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
      setEditingStorageVolumeIndex(null)
      setEditingStorageVolume(false)
    } else if (editingStorageVolumeIndex !== null && editingStorageVolumeIndex > index) {
      setEditingStorageVolumeIndex(editingStorageVolumeIndex - 1)
    }
  }, [editingStorageVolumeIndex])

  const goPrev = React.useCallback(() => {
    if (isBusy || isBasicStep) return
    const previousStep = STEP_ORDER[Math.max(0, currentStepIndex - 1)]
    setActiveStep(previousStep)
    setSubmitError(null)
  }, [currentStepIndex, isBasicStep, isBusy])

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
    (): JobDialogSnapshot => {
      const normalizedStorageList = savedStorageVolumes.map((item) => ({
        volumeId: item.volumeId.trim(),
        volumeKind: item.volumeKind,
        volumeName: item.volumeName.trim(),
        mounts: item.mounts
          .map((mount) => ({
            containerName: mount.containerName.trim(),
            mountMode: mount.mountMode,
            mountPath: mount.mountPath.trim(),
          }))
          .filter((mount) => mount.containerName.length > 0),
      }))

      if (editingStorageVolume) {
        const normalizedDraftVolumeName = storageVolumeDraft.volumeName.trim()
        const normalizedDraftVolumeId =
          storageVolumeDraft.volumeKind === "ephemeral"
            ? normalizedDraftVolumeName
            : storageVolumeDraft.volumeId.trim() || normalizedDraftVolumeName
        const normalizedDraftMounts = storageVolumeDraft.mounts
          .map((mount) => ({
            containerName: mount.containerName.trim(),
            mountMode: mount.mountMode,
            mountPath: mount.mountPath.trim(),
          }))
          .filter((mount) => mount.containerName.length > 0)

        if (normalizedDraftVolumeName.length > 0 || normalizedDraftMounts.length > 0) {
          const draftItem = {
            volumeId: normalizedDraftVolumeId,
            volumeKind: storageVolumeDraft.volumeKind,
            volumeName: normalizedDraftVolumeName,
            mounts: normalizedDraftMounts,
          }
          if (
            editingStorageVolumeIndex !== null &&
            editingStorageVolumeIndex >= 0 &&
            editingStorageVolumeIndex < normalizedStorageList.length
          ) {
            normalizedStorageList[editingStorageVolumeIndex] = draftItem
          } else {
            normalizedStorageList.push(draftItem)
          }
        }
      }

      return {
        name,
        namespace,
        description,
        labels: metadataEntriesToRecord(labelEntries),
        annotations: metadataEntriesToRecord(annotationEntries),
        schedule,
        strategy: {
          backoffLimit,
          completions,
          parallelism,
          activeDeadlineSeconds,
        },
        pod: {
          restartPolicy,
          containers,
          ...(normalizedStorageList.length > 0
            ? {
                storageList: normalizedStorageList,
              }
            : {}),
        },
      }
    },
    [
      activeDeadlineSeconds,
      backoffLimit,
      completions,
      containers,
      description,
      annotationEntries,
      editingStorageVolume,
      editingStorageVolumeIndex,
      labelEntries,
      name,
      namespace,
      schedule,
      parallelism,
      restartPolicy,
      savedStorageVolumes,
      storageVolumeDraft,
    ]
  )

  const applySnapshot = React.useCallback((snapshot: JobDialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
    const nextLabelEntries = metadataRecordToEntries(snapshot.labels)
    const nextAnnotationEntries = metadataRecordToEntries(snapshot.annotations)
    setLabelEntries(nextLabelEntries)
    setAnnotationEntries(nextAnnotationEntries)
    setMetadataEnabled(hasUserProvidedMetadata(nextLabelEntries, nextAnnotationEntries))
    setSchedule(snapshot.schedule)
    setBackoffLimit(snapshot.strategy.backoffLimit)
    setCompletions(snapshot.strategy.completions)
    setParallelism(snapshot.strategy.parallelism)
    setActiveDeadlineSeconds(snapshot.strategy.activeDeadlineSeconds)
    setRestartPolicy(snapshot.pod.restartPolicy)
    setContainers(snapshot.pod.containers)
    const nextStorageVolumes = Array.isArray(snapshot.pod.storageList)
      ? snapshot.pod.storageList
          .map((item) => ({
            volumeId: typeof item.volumeId === "string" ? item.volumeId.trim() : "",
            volumeKind:
              item.volumeKind === "ephemeral" ||
              item.volumeKind === "hostPath" ||
              item.volumeKind === "persistent"
                ? item.volumeKind
                : "persistent",
            volumeName: typeof item.volumeName === "string" ? item.volumeName.trim() : "",
            mounts: Array.isArray(item.mounts)
              ? item.mounts
                  .map((mount) => ({
                    containerName:
                      typeof mount.containerName === "string" ? mount.containerName.trim() : "",
                    mountMode:
                      mount.mountMode === "ro" || mount.mountMode === "rw" || mount.mountMode === "none"
                        ? mount.mountMode
                        : "none",
                    mountPath: typeof mount.mountPath === "string" ? mount.mountPath.trim() : "",
                  }))
                  .filter((mount) => mount.containerName.length > 0)
              : [],
          }))
          .filter((item) => item.volumeId.length > 0 || item.volumeName.length > 0 || item.mounts.length > 0)
      : []
    setSavedStorageVolumes(nextStorageVolumes)
    setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    setEditingStorageVolumeIndex(null)
    setEditingStorageVolume(false)
    setNameError(null)
    setNamespaceError(null)
    setScheduleError(null)
    setSubmitError(null)
  }, [setContainers])

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
    (checked: boolean, configMounts?: JobConfigInput[]) => {
      if (isBusy) return

      if (checked) {
        const source = withLockedIdentity(getSnapshot())
        setYamlText(
          buildJobYamlText(
            kind,
            source,
            source.pod.storageList ?? [],
            configMounts ?? source.pod.configList ?? []
          )
        )
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

  const runBasicValidation = React.useCallback(async (source?: Pick<JobDialogSnapshot, "name" | "namespace" | "schedule">) => {
    const nextName = (lockedIdentity?.name ?? source?.name ?? name).trim().toLowerCase()
    const nextNamespace = (lockedIdentity?.namespace ?? source?.namespace ?? namespace).trim()
    const nextSchedule = kind === "CronJob" ? (source?.schedule ?? schedule).trim() : ""
    const nextNameError = validateName(nextName)
    const nextNamespaceError = nextNamespace ? null : "请选择项目"
    const nextScheduleError = kind === "CronJob" && !nextSchedule ? CRON_SCHEDULE_REQUIRED_MESSAGE : null
    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    setScheduleError(nextScheduleError)
    if (nextNameError || nextNamespaceError || nextScheduleError) {
      const firstInvalidFieldId = resolveFirstInvalidFieldId([
        {
          invalid: Boolean(nextNameError),
          fieldId: "create-job-name",
        },
        {
          invalid: Boolean(nextNamespaceError),
          fieldId: "create-job-namespace",
        },
        {
          invalid: Boolean(nextScheduleError),
          fieldId: "create-job-schedule",
        },
      ])
      if (firstInvalidFieldId) {
        scrollAndFocusFieldById(firstInvalidFieldId)
      }
      return false
    }

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
  }, [isEditMode, kind, lockedIdentity?.name, lockedIdentity?.namespace, name, namespace, schedule])

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
    async (configMounts?: JobConfigInput[]) => {
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
        const normalizedDescription = source.description.trim()
        const normalizedSchedule = kind === "CronJob" ? source.schedule.trim() : ""
        const nextNameError = validateName(normalizedName)
        const nextNamespaceError = normalizedNamespace ? null : "请选择项目"
        const nextScheduleError = kind === "CronJob" && !normalizedSchedule ? CRON_SCHEDULE_REQUIRED_MESSAGE : null
        const nextDescriptionError =
          normalizedDescription.length <= DESCRIPTION_MAX_LENGTH
            ? null
            : `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 个字符`
        setNameError(nextNameError)
        setNamespaceError(nextNamespaceError)
        setScheduleError(nextScheduleError)
        if (nextNameError || nextNamespaceError || nextScheduleError || nextDescriptionError) {
          if (yamlMode) {
            setYamlError(nextNameError ?? nextNamespaceError ?? nextScheduleError ?? nextDescriptionError)
          } else {
            if (nextDescriptionError) setSubmitError(nextDescriptionError)
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
            const normalizedEnv = item.env
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
            const normalizedPorts = item.ports
              .map((port) => ({
                protocol: port.protocol,
                name: port.name.trim(),
                containerPort: port.containerPort.trim(),
              }))
              .filter((port) => /^\d+$/.test(port.containerPort))
            const normalizedCommand = parseEditorTextToStringList(item.command)
            const normalizedArgs = parseEditorTextToStringList(item.args)
            const normalizedProbes = normalizeProbeMap(item.probes)
            const normalizedLifecycle = normalizeLifecycleMap(item.lifecycle)
            const normalizedSecurityContext = normalizeSecurityContextDraft(item.securityContext)

            return {
              name: item.name.trim(),
              type: item.type,
              image: item.image.trim(),
              imagePullPolicy: item.imagePullPolicy,
              ...(normalizedCommand.length > 0 ? { command: normalizedCommand } : {}),
              ...(normalizedArgs.length > 0 ? { args: normalizedArgs } : {}),
              ...(item.syncHostTimezone ? { syncHostTimezone: true } : {}),
              ...(normalizedEnv.length > 0 ? { env: normalizedEnv } : {}),
              cpuRequest: item.cpuRequest.trim(),
              cpuLimit: item.cpuLimit.trim(),
              memoryRequestMi: item.memoryRequestMi.trim(),
              memoryLimitMi: item.memoryLimitMi.trim(),
              ...(hasSecurityContextValue(normalizedSecurityContext)
                ? { securityContext: normalizedSecurityContext }
                : {}),
              ...(normalizedPorts.length > 0 ? { ports: normalizedPorts } : {}),
              ...(Object.keys(normalizedProbes).length > 0 ? { probes: normalizedProbes } : {}),
              ...(Object.keys(normalizedLifecycle).length > 0 ? { lifecycle: normalizedLifecycle } : {}),
            }
          })
          .filter((item) => item.image.length > 0)

        const normalizedStorageList = (source.pod.storageList ?? [])
          .map((storageItem) => {
            const normalizedStorageName =
              typeof storageItem.volumeName === "string" ? storageItem.volumeName.trim() : ""
            const currentStorageId = typeof storageItem.volumeId === "string" ? storageItem.volumeId.trim() : ""
            const normalizedStorageId =
              storageItem.volumeKind === "ephemeral"
                ? normalizedStorageName
                : currentStorageId || normalizedStorageName
            const normalizedStorageMounts = (Array.isArray(storageItem.mounts) ? storageItem.mounts : [])
              .map((item) => ({
                containerName: typeof item.containerName === "string" ? item.containerName.trim() : "",
                mountMode: item.mountMode,
                mountPath: typeof item.mountPath === "string" ? item.mountPath.trim() : "",
              }))
              .filter(
                (item) =>
                  item.containerName.length > 0 &&
                  (item.mountMode === "ro" || item.mountMode === "rw") &&
                  item.mountPath.length > 0
              )
            if (!normalizedStorageName || !normalizedStorageId) return null
            return {
              volumeId: normalizedStorageId,
              volumeKind: storageItem.volumeKind,
              volumeName: normalizedStorageName,
              mounts: normalizedStorageMounts,
            }
          })
          .filter(
            (
              item
            ): item is {
              volumeId: string
              volumeKind: StorageVolumeKind
              volumeName: string
              mounts: Array<{ containerName: string; mountMode: "ro" | "rw"; mountPath: string }>
            } => Boolean(item)
          )
        const normalizedStorage = normalizedStorageList[0]
        const normalizedConfigList = (Array.isArray(configMounts) ? configMounts : source.pod.configList ?? [])
          .map((configItem) => {
            const sourceKind = configItem.sourceKind === "secret" ? "secret" : "configMap"
            const sourceName = typeof configItem.sourceName === "string" ? configItem.sourceName.trim() : ""
            const mounts = (Array.isArray(configItem.mounts) ? configItem.mounts : [])
              .map((item) => ({
                containerName: typeof item.containerName === "string" ? item.containerName.trim() : "",
                mountMode: item.mountMode,
                mountPath: typeof item.mountPath === "string" ? item.mountPath.trim() : "",
              }))
              .filter((item) => item.containerName.length > 0)
            if (!sourceName) return null
            return {
              sourceKind,
              sourceName,
              mounts,
            }
          })
          .filter(
            (
              item
            ): item is {
              sourceKind: "configMap" | "secret"
              sourceName: string
              mounts: Array<{ containerName: string; mountMode: "none" | "ro"; mountPath: string }>
            } => Boolean(item)
          )

        const pod =
          source.pod.restartPolicy === "OnFailure" ||
          normalizedContainers.length > 0 ||
          normalizedStorageList.length > 0 ||
          normalizedConfigList.length > 0
            ? {
                ...(source.pod.restartPolicy === "OnFailure"
                  ? { restartPolicy: source.pod.restartPolicy }
                  : {}),
                ...(normalizedContainers.length > 0
                  ? {
                      containers: normalizedContainers,
                    }
                  : {}),
                ...(normalizedStorage ? { storage: normalizedStorage } : {}),
                ...(normalizedStorageList.length > 0 ? { storageList: normalizedStorageList } : {}),
                ...(normalizedConfigList.length > 0 ? { configList: normalizedConfigList } : {}),
              }
            : undefined

        await onSubmit({
          kind,
          name: normalizedName,
          namespace: normalizedNamespace,
          description: normalizedDescription,
          labels: source.labels,
          annotations: source.annotations,
          ...(kind === "CronJob" ? { schedule: normalizedSchedule } : {}),
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

  return {
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
    currentStepIndex,
    cancelEditStorageVolume,
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
    isEditMode,
    isEditingStorageView,
    editingStorageVolumeIndex,
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
    updateStorageVolumeDraft,
    updateStorageVolumeMount,
    updateContainer,
    updateContainerEnv,
    updateContainerPort,
    yamlError,
    yamlMode,
    yamlText,
  }
}

