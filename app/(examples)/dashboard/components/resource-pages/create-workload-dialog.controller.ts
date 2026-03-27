"use client"

import * as React from "react"

import { checkWorkloadExists } from "@/app/lib/kubespark/workloads"
import type {
  ConfigMountInput,
  CreateWorkloadDialogProps,
  CreateStep,
  SchedulingPolicy,
  WorkloadDialogSnapshot,
} from "@/app/(examples)/dashboard/components/resource-pages/create-workload-dialog.logic"
import {
  CONTAINER_PORT_PROTOCOL_SET,
  POD_REQUIRED_MESSAGE,
  STEP_ORDER,
  buildAutoPortName,
  buildWorkloadManifest,
  buildWorkloadYamlText,
  createContainerDraft,
  createContainerDraftFromInitial,
  createContainerEnvDraft,
  createContainerPortDraft,
  ensureUniqueContainerName,
  isAutoContainerNameForImage,
  isAutoPortNameForProtocol,
  normalizeLifecycleMap,
  normalizeIntegerInput,
  normalizeProbeMap,
  normalizeSecurityContextDraft,
  parseWorkloadYamlText,
  replaceProtocolPrefixInName,
  resolveContainerNameFromImage,
  resolveDuplicateContainerEnvNameIds,
  resolveSubmitErrorMessage,
  toDnsLabelFragment,
  validateContainerPorts,
  validateName,
} from "@/app/(examples)/dashboard/components/resource-pages/create-workload-dialog.logic"
import { useContainerEditor } from "@/app/(examples)/dashboard/components/resource-pages/use-container-editor"

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

export function useCreateWorkloadDialogController(props: CreateWorkloadDialogProps) {
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
  const [schedule, setSchedule] = React.useState("")
  const [backoffLimit, setBackoffLimit] = React.useState("")
  const [completions, setCompletions] = React.useState("")
  const [parallelism, setParallelism] = React.useState("")
  const [activeDeadlineSeconds, setActiveDeadlineSeconds] = React.useState("")
  const [rollingUpdateEnabled, setRollingUpdateEnabled] = React.useState(false)
  const [rollingUpdateType, setRollingUpdateType] =
    React.useState<"RollingUpdate" | "Recreate">("RollingUpdate")
  const [rollingUpdateMaxUnavailable, setRollingUpdateMaxUnavailable] = React.useState("25%")
  const [rollingUpdateMaxSurge, setRollingUpdateMaxSurge] = React.useState("25%")
  const [restartPolicy, setRestartPolicy] = React.useState<"Always">("Always")
  const [terminationGracePeriodSeconds, setTerminationGracePeriodSeconds] = React.useState("30")
  const [serviceAccountName, setServiceAccountName] = React.useState("default")
  const [schedulingPolicyEnabled, setSchedulingPolicyEnabled] = React.useState(true)
  const [schedulingPolicy, setSchedulingPolicy] = React.useState<SchedulingPolicy>("default")
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
  const isPodStep = activeStep === "pod"
  const isStorageStep = activeStep === "storage"
  const isFinalStep = currentStepIndex === STEP_ORDER.length - 1
  const isEditingPodView = containerDialogOpen
  const isEditingStorageView = isStorageStep && editingStorageVolume
  const canNavigateStep = !isBusy && !isEditingPodView && !isEditingStorageView

  const dialogTitle = isEditMode ? `编辑 ${kind}` : `创建 ${kind}`
  const dialogDescription = isEditMode
    ? `编辑 Kubernetes ${kind} 的配置内容。`
    : `使用 Kubernetes ${kind} 创建工作负载。`

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setName("")
      setNamespace("")
      setDescription("")
      setSchedule("")
      setBackoffLimit("")
      setCompletions("")
      setParallelism("")
      setActiveDeadlineSeconds("")
      setRollingUpdateEnabled(false)
      setRollingUpdateType("RollingUpdate")
      setRollingUpdateMaxUnavailable("25%")
      setRollingUpdateMaxSurge("25%")
      setRestartPolicy("Always")
      setTerminationGracePeriodSeconds("30")
      setServiceAccountName("default")
      setSchedulingPolicyEnabled(true)
      setSchedulingPolicy("default")
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
    }
  }, [open, kind, resetEditorUiState, setContainers])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return

    setActiveStep("basic")
    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
    setSchedule("")
    setBackoffLimit(initialValues.strategy?.backoffLimit ?? "")
    setCompletions(initialValues.strategy?.completions ?? "")
    setParallelism(initialValues.strategy?.parallelism ?? "")
    setActiveDeadlineSeconds(initialValues.strategy?.activeDeadlineSeconds ?? "")
    setRollingUpdateEnabled(initialValues.strategy?.rollingUpdateEnabled === true)
    setRollingUpdateType(
      initialValues.strategy?.rollingUpdateType === "Recreate" ? "Recreate" : "RollingUpdate"
    )
    setRollingUpdateMaxUnavailable(initialValues.strategy?.rollingUpdateMaxUnavailable?.trim() || "25%")
    setRollingUpdateMaxSurge(initialValues.strategy?.rollingUpdateMaxSurge?.trim() || "25%")
    setRestartPolicy("Always")
    setTerminationGracePeriodSeconds(initialValues.pod?.terminationGracePeriodSeconds?.trim() || "30")
    setServiceAccountName(initialValues.pod?.serviceAccountName?.trim() || "default")
    setSchedulingPolicyEnabled(initialValues.pod?.schedulingPolicyEnabled !== false)
    setSchedulingPolicy(initialValues.pod?.schedulingPolicy ?? "default")
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
    (): WorkloadDialogSnapshot => {
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
        schedule,
        strategy: {
          backoffLimit,
          completions,
          parallelism,
          activeDeadlineSeconds,
          rollingUpdateEnabled,
          rollingUpdateType,
          rollingUpdateMaxUnavailable,
          rollingUpdateMaxSurge,
        },
        pod: {
          restartPolicy,
          terminationGracePeriodSeconds,
          serviceAccountName,
          schedulingPolicyEnabled,
          schedulingPolicy,
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
      editingStorageVolume,
      editingStorageVolumeIndex,
      name,
      namespace,
      schedule,
      parallelism,
      rollingUpdateEnabled,
      rollingUpdateType,
      rollingUpdateMaxUnavailable,
      rollingUpdateMaxSurge,
      restartPolicy,
      terminationGracePeriodSeconds,
      serviceAccountName,
      schedulingPolicyEnabled,
      schedulingPolicy,
      savedStorageVolumes,
      storageVolumeDraft,
    ]
  )

  const applySnapshot = React.useCallback((snapshot: WorkloadDialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
    setSchedule(snapshot.schedule)
    setBackoffLimit(snapshot.strategy.backoffLimit)
    setCompletions(snapshot.strategy.completions)
    setParallelism(snapshot.strategy.parallelism)
    setActiveDeadlineSeconds(snapshot.strategy.activeDeadlineSeconds)
    setRollingUpdateEnabled(snapshot.strategy.rollingUpdateEnabled === true)
    setRollingUpdateType(
      snapshot.strategy.rollingUpdateType === "Recreate" ? "Recreate" : "RollingUpdate"
    )
    setRollingUpdateMaxUnavailable(snapshot.strategy.rollingUpdateMaxUnavailable?.trim() || "25%")
    setRollingUpdateMaxSurge(snapshot.strategy.rollingUpdateMaxSurge?.trim() || "25%")
    setRestartPolicy(snapshot.pod.restartPolicy)
    setTerminationGracePeriodSeconds(snapshot.pod.terminationGracePeriodSeconds?.trim() || "30")
    setServiceAccountName(snapshot.pod.serviceAccountName?.trim() || "default")
    setSchedulingPolicyEnabled(snapshot.pod.schedulingPolicyEnabled !== false)
    setSchedulingPolicy(snapshot.pod.schedulingPolicy ?? "default")
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
    (snapshot: WorkloadDialogSnapshot): WorkloadDialogSnapshot => {
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
    (checked: boolean, configMounts?: ConfigMountInput[]) => {
      if (isBusy) return

      if (checked) {
        const source = withLockedIdentity(getSnapshot())
        setYamlText(
          buildWorkloadYamlText(
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
        const parsed = parseWorkloadYamlText(kind, yamlText)
        applySnapshot(withLockedIdentity(parsed))
        setYamlError(null)
        setYamlMode(false)
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
      }
    },
    [applySnapshot, getSnapshot, isBusy, kind, withLockedIdentity, yamlText]
  )

  const runBasicValidation = React.useCallback(async (source?: Pick<WorkloadDialogSnapshot, "name" | "namespace">) => {
    const nextName = (lockedIdentity?.name ?? source?.name ?? name).trim().toLowerCase()
    const nextNamespace = (lockedIdentity?.namespace ?? source?.namespace ?? namespace).trim()
    const nextNameError = validateName(nextName)
    const nextNamespaceError = nextNamespace ? null : "请选择项目"
    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    setScheduleError(null)
    if (nextNameError || nextNamespaceError) {
      const firstInvalidFieldId = resolveFirstInvalidFieldId([
        {
          invalid: Boolean(nextNameError),
          fieldId: "create-job-name",
        },
        {
          invalid: Boolean(nextNamespaceError),
          fieldId: "create-job-namespace",
        },
      ])
      if (firstInvalidFieldId) {
        scrollAndFocusFieldById(firstInvalidFieldId)
      }
      return false
    }

    if (isEditMode) return true

    const exists = await checkWorkloadExists(kind, nextNamespace, nextName)
    if (exists) {
      setNameError("工作负载名称已存在，请更换后重试")
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
    async (configMounts?: ConfigMountInput[]) => {
      if (isBusy || (!isFinalStep && !yamlMode)) return

      setSubmitError(null)
      setCreating(true)
      try {
        let source = getSnapshot()
        if (yamlMode) {
          try {
            source = withLockedIdentity(parseWorkloadYamlText(kind, yamlText))
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
        setScheduleError(null)
        if (nextNameError || nextNamespaceError) {
          if (yamlMode) {
            setYamlError(nextNameError ?? nextNamespaceError)
          } else {
            setActiveStep("basic")
          }
          return
        }

        if (!isEditMode) {
          const exists = await checkWorkloadExists(kind, normalizedNamespace, normalizedName)
          if (exists) {
            const existsError = "工作负载名称已存在，请更换后重试"
            setNameError(existsError)
            if (yamlMode) {
              setYamlError(existsError)
            } else {
              setActiveStep("basic")
            }
            return
          }
        }

        const normalizedSnapshot: WorkloadDialogSnapshot = {
          ...source,
          name: normalizedName,
          namespace: normalizedNamespace,
          description: source.description.trim(),
          schedule: "",
          pod: {
            ...source.pod,
            restartPolicy: "Always",
            terminationGracePeriodSeconds:
              normalizeIntegerInput(source.pod.terminationGracePeriodSeconds) || "30",
            serviceAccountName: source.pod.serviceAccountName.trim() || "default",
            schedulingPolicyEnabled: source.pod.schedulingPolicyEnabled !== false,
            schedulingPolicy:
              source.pod.schedulingPolicy === "spread" ||
              source.pod.schedulingPolicy === "concentrated"
                ? source.pod.schedulingPolicy
                : "default",
          },
        }
        const configMountList =
          Array.isArray(configMounts) && configMounts.length > 0
            ? configMounts
            : normalizedSnapshot.pod.configList ?? []
        const manifest = buildWorkloadManifest(
          kind,
          normalizedSnapshot,
          normalizedSnapshot.pod.storageList ?? [],
          configMountList
        )
        await onSubmit({
          kind,
          name: normalizedName,
          namespace: normalizedNamespace,
          payload: manifest,
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
    lockedIdentity,
    name,
    nameError,
    namespace,
    namespaceError,
    parallelism,
    rollingUpdateEnabled,
    rollingUpdateType,
    rollingUpdateMaxUnavailable,
    rollingUpdateMaxSurge,
    pendingDeleteContainer,
    removeContainer,
    removeContainerEnv,
    removeContainerPort,
    removeStorageVolume,
    restartPolicy,
    terminationGracePeriodSeconds,
    serviceAccountName,
    schedulingPolicyEnabled,
    schedulingPolicy,
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
    setRollingUpdateEnabled,
    setRollingUpdateType,
    setRollingUpdateMaxUnavailable,
    setRollingUpdateMaxSurge,
    setPendingDeleteContainerId,
    setRestartPolicy,
    setTerminationGracePeriodSeconds,
    setServiceAccountName,
    setSchedulingPolicyEnabled,
    setSchedulingPolicy,
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
