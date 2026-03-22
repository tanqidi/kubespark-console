"use client"

import * as React from "react"

import { checkJobExists } from "@/app/lib/kubespark/jobs"
import type {
  CreateJobDialogProps,
  CreateStep,
  JobDialogSnapshot,
} from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.logic"
import {
  CRON_SCHEDULE_REQUIRED_MESSAGE,
  DEFAULT_CRON_SCHEDULE,
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
} from "@/app/(examples)/dashboard/components/resource-pages/create-job-dialog.logic"
import type {
  ContainerDraft,
  ContainerEnvVarSource,
  ContainerLifecycleMap,
  ContainerPortProtocol,
  ContainerProbeMap,
  ContainerSecurityContextDraft,
} from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog.logic"
import {
  resolveFirstContainerPortErrorFieldId,
  resolveFirstInvalidFieldId,
  scrollAndFocusFieldById,
  type ContainerPortFieldErrors,
} from "@/app/lib/kubespark/form-validation"

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

function createStorageVolumeId() {
  return `volume-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}`
}

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
  const [schedule, setSchedule] = React.useState(kind === "CronJob" ? DEFAULT_CRON_SCHEDULE : "")
  const [backoffLimit, setBackoffLimit] = React.useState("")
  const [completions, setCompletions] = React.useState("")
  const [parallelism, setParallelism] = React.useState("")
  const [activeDeadlineSeconds, setActiveDeadlineSeconds] = React.useState("")
  const [restartPolicy, setRestartPolicy] = React.useState<"Never" | "OnFailure">("Never")
  const [containers, setContainers] = React.useState<ContainerDraft[]>([])
  const [containerDialogOpen, setContainerDialogOpen] = React.useState(false)
  const [editingContainerId, setEditingContainerId] = React.useState<string | null>(null)
  const [pendingDeleteContainerId, setPendingDeleteContainerId] = React.useState<string | null>(null)
  const [editingImageError, setEditingImageError] = React.useState<string | null>(null)
  const [editingPortFieldErrors, setEditingPortFieldErrors] = React.useState<ContainerPortFieldErrors>({})
  const [editingEnvDuplicateIds, setEditingEnvDuplicateIds] = React.useState<string[]>([])
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
  const [savedStorageVolume, setSavedStorageVolume] = React.useState<StorageVolumeDraft>(EMPTY_STORAGE_VOLUME_DRAFT)
  const [editingStorageVolume, setEditingStorageVolume] = React.useState(false)

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
      setSchedule(kind === "CronJob" ? DEFAULT_CRON_SCHEDULE : "")
      setBackoffLimit("")
      setCompletions("")
      setParallelism("")
      setActiveDeadlineSeconds("")
      setRestartPolicy("Never")
      setContainers([])
      setContainerDialogOpen(false)
      setEditingContainerId(null)
      setPendingDeleteContainerId(null)
      setEditingImageError(null)
      setEditingPortFieldErrors({})
      setEditingEnvDuplicateIds([])
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
      setSavedStorageVolume(EMPTY_STORAGE_VOLUME_DRAFT)
      setEditingStorageVolume(false)
    }
  }, [open, kind])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return

    setActiveStep("basic")
    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
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
    setContainerDialogOpen(false)
    setEditingContainerId(null)
    setPendingDeleteContainerId(null)
    setEditingImageError(null)
    setEditingPortFieldErrors({})
    setEditingEnvDuplicateIds([])
    setNameError(null)
    setNamespaceError(null)
    setScheduleError(null)
    setSubmitError(null)
    setYamlMode(false)
    setYamlText("")
    setYamlError(null)
    setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    setSavedStorageVolume(EMPTY_STORAGE_VOLUME_DRAFT)
    setEditingStorageVolume(false)
  }, [initialValues, isEditMode, kind, open])

  const configuredContainers = React.useMemo(
    () => {
      const visible = containers.filter((item) => item.image.trim())
      const initContainers = visible.filter((item) => item.type === "initContainer")
      const workloadContainers = visible.filter((item) => item.type !== "initContainer")
      return [...initContainers, ...workloadContainers]
    },
    [containers]
  )

  const resolveStorageContainerNames = React.useCallback(() => {
    const names =
      configuredContainers.length > 0
        ? configuredContainers.map((item) => item.name.trim())
        : containers.map((item) => item.name.trim())
    return Array.from(new Set(names.filter((item) => item.length > 0)))
  }, [configuredContainers, containers])

  const startEditStorageVolume = React.useCallback(() => {
    setStorageVolumeDraft((current) => {
      const base =
        savedStorageVolume.volumeName.trim().length > 0 || savedStorageVolume.mounts.length > 0
          ? savedStorageVolume
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
    setEditingStorageVolume(true)
    if (submitError) setSubmitError(null)
  }, [resolveStorageContainerNames, savedStorageVolume, submitError])

  const cancelEditStorageVolume = React.useCallback(() => {
    setStorageVolumeDraft(savedStorageVolume)
    setEditingStorageVolume(false)
  }, [savedStorageVolume])

  const confirmEditStorageVolume = React.useCallback(() => {
    const normalizedVolumeName = storageVolumeDraft.volumeName.trim()
    const normalizedVolumeId =
      storageVolumeDraft.volumeKind === "persistent" && normalizedVolumeName
        ? normalizedVolumeName
        : storageVolumeDraft.volumeId.trim() ||
          (normalizedVolumeName ? createStorageVolumeId() : "")

    setSavedStorageVolume((current) => ({
      ...storageVolumeDraft,
      volumeId: normalizedVolumeId || current.volumeId.trim(),
    }))
    setEditingStorageVolume(false)
  }, [storageVolumeDraft])

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

  const removeStorageVolume = React.useCallback(() => {
    setSavedStorageVolume(EMPTY_STORAGE_VOLUME_DRAFT)
    setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    setEditingStorageVolume(false)
  }, [])

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

  const pendingDeleteContainer = React.useMemo(
    () => containers.find((item) => item.id === pendingDeleteContainerId) ?? null,
    [containers, pendingDeleteContainerId]
  )

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
    (): JobDialogSnapshot => ({
      name,
      namespace,
      description,
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
      },
    }),
    [
      activeDeadlineSeconds,
      backoffLimit,
      completions,
      containers,
      description,
      name,
      namespace,
      schedule,
      parallelism,
      restartPolicy,
    ]
  )

  const applySnapshot = React.useCallback((snapshot: JobDialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
    setSchedule(snapshot.schedule)
    setBackoffLimit(snapshot.strategy.backoffLimit)
    setCompletions(snapshot.strategy.completions)
    setParallelism(snapshot.strategy.parallelism)
    setActiveDeadlineSeconds(snapshot.strategy.activeDeadlineSeconds)
    setRestartPolicy(snapshot.pod.restartPolicy)
    setContainers(snapshot.pod.containers)
    setNameError(null)
    setNamespaceError(null)
    setScheduleError(null)
    setSubmitError(null)
  }, [])

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
    (checked: boolean) => {
      if (isBusy) return

      if (checked) {
        setYamlText(
          buildJobYamlText(kind, withLockedIdentity(getSnapshot()), {
            volumeId: savedStorageVolume.volumeId,
            volumeKind: savedStorageVolume.volumeKind,
            volumeName: savedStorageVolume.volumeName,
            mounts: savedStorageVolume.mounts,
          })
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
    [applySnapshot, getSnapshot, isBusy, kind, savedStorageVolume, withLockedIdentity, yamlText]
  )

  const updateContainer = React.useCallback(
    (
      id: string,
      field:
        | "name"
        | "type"
        | "image"
        | "imagePullPolicy"
        | "command"
        | "args"
        | "syncHostTimezone"
        | "cpuRequest"
        | "cpuLimit"
        | "memoryRequestMi"
        | "memoryLimitMi"
        | "probes"
        | "lifecycle"
        | "securityContext",
      value:
        | string
        | boolean
        | ContainerProbeMap
        | ContainerLifecycleMap
        | ContainerSecurityContextDraft
    ) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === id
            ? (() => {
                if (field === "image") {
                  const nextImage = typeof value === "string" ? value : ""
                  const currentName = item.name.trim()
                  const siblingNames = new Set(
                    current
                      .filter((container) => container.id !== item.id)
                      .map((container) => toDnsLabelFragment(container.name))
                      .filter(Boolean)
                  )
                  const nextAutoBaseName = resolveContainerNameFromImage(nextImage)
                  const nextAutoName = nextAutoBaseName
                    ? ensureUniqueContainerName(nextAutoBaseName, siblingNames)
                    : ""
                  const shouldAutoSyncName =
                    currentName.length === 0 ||
                    isAutoContainerNameForImage(currentName, item.image)

                  return {
                    ...item,
                    image: nextImage,
                    ...(shouldAutoSyncName ? { name: nextAutoName } : {}),
                  }
                }

                return {
                  ...item,
                  [field]:
                    field === "syncHostTimezone"
                      ? value === true
                      : field === "probes"
                        ? normalizeProbeMap(value as ContainerProbeMap)
                        : field === "lifecycle"
                          ? normalizeLifecycleMap(value as ContainerLifecycleMap)
                        : field === "securityContext"
                          ? normalizeSecurityContextDraft(value)
                          : value,
                }
              })()
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
                const currentName = port.name.trim()
                const hasAutoPatternName = isAutoPortNameForProtocol(currentName, port.protocol)
                const shouldAutoRename =
                  currentName.length === 0 ||
                  hasAutoPatternName ||
                  (Boolean(autoNameBefore) && currentName === autoNameBefore)
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

  const addContainerEnv = React.useCallback(
    (
      containerId: string,
      defaults?: {
        source?: ContainerEnvVarSource
        name?: string
        value?: string
        sourceResource?: string
        sourceKey?: string
      }
    ) => {
      setContainers((current) => {
        const nextContainers = current.map((item) => {
          if (item.id !== containerId) return item
          return {
            ...item,
            env: [...item.env, createContainerEnvDraft(defaults)],
          }
        })
        const target = nextContainers.find((item) => item.id === containerId)
        setEditingEnvDuplicateIds(target ? resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const updateContainerEnv = React.useCallback(
    (
      containerId: string,
      envId: string,
      field: "source" | "name" | "value" | "sourceResource" | "sourceKey",
      value: string
    ) => {
      setContainers((current) => {
        const nextContainers = current.map((item) => {
          if (item.id !== containerId) return item
          return {
            ...item,
            env: item.env.map((entry) =>
              entry.id === envId
                ? {
                    ...entry,
                    [field]: value,
                  }
                : entry
            ),
          }
        })
        const target = nextContainers.find((item) => item.id === containerId)
        setEditingEnvDuplicateIds(target ? resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const removeContainerEnv = React.useCallback(
    (containerId: string, envId: string) => {
      setContainers((current) => {
        const nextContainers = current.map((item) => {
          if (item.id !== containerId) return item
          return {
            ...item,
            env: item.env.filter((entry) => entry.id !== envId),
          }
        })
        const target = nextContainers.find((item) => item.id === containerId)
        setEditingEnvDuplicateIds(target ? resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const clearContainerEnv = React.useCallback(
    (containerId: string) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === containerId
            ? {
                ...item,
                env: [],
              }
            : item
        )
      )
      setEditingEnvDuplicateIds([])
      if (submitError) setSubmitError(null)
    },
    [submitError]
  )

  const beginEditContainer = React.useCallback(
    (id: string) => {
      setContainers((current) => {
        const nextContainers = current.map((item) =>
          item.id === id && item.ports.length === 0
            ? {
                ...item,
                ports: [createContainerPortDraft(0)],
              }
            : item
        )
        const target = nextContainers.find((item) => item.id === id)
        setEditingEnvDuplicateIds(target ? resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
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
    setEditingEnvDuplicateIds([])
    if (submitError) setSubmitError(null)
  }, [editingImageError, submitError])

  const removeContainer = React.useCallback(
    (id: string) => {
      setContainers((current) => current.filter((item) => item.id !== id))
      setEditingContainerId((current) => (current === id ? null : current))
      setPendingDeleteContainerId((current) => (current === id ? null : current))
      if (editingImageError) setEditingImageError(null)
      setEditingPortFieldErrors({})
      setEditingEnvDuplicateIds([])
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

    // Required checks follow visual order: image -> ports (row by row) -> env duplicate names.
    const nextImageError = editingContainer.image.trim() ? null : "请输入镜像地址"
    const nextPortFieldErrors = nextImageError ? {} : validateContainerPorts(editingContainer.ports)
    const nextEnvDuplicateIds =
      nextImageError || Object.keys(nextPortFieldErrors).length > 0
        ? []
        : resolveDuplicateContainerEnvNameIds(editingContainer.env)

    setEditingImageError(nextImageError)
    setEditingPortFieldErrors(nextPortFieldErrors)
    setEditingEnvDuplicateIds(nextEnvDuplicateIds)

    const firstPortErrorFieldId = resolveFirstContainerPortErrorFieldId(
      editingContainer.id,
      editingContainer.ports,
      nextPortFieldErrors
    )
    const firstInvalidFieldId = resolveFirstInvalidFieldId([
      { invalid: Boolean(nextImageError), fieldId: `${editingContainer.id}-image` },
      { invalid: Boolean(firstPortErrorFieldId), fieldId: firstPortErrorFieldId },
      {
        invalid: nextEnvDuplicateIds.length > 0,
        fieldId:
          nextEnvDuplicateIds.length > 0
            ? `${editingContainer.id}-env-${nextEnvDuplicateIds[0]}-name`
            : null,
      },
    ])
    if (firstInvalidFieldId) {
      scrollAndFocusFieldById(firstInvalidFieldId)
      return
    }

    setEditingImageError(null)
    setEditingPortFieldErrors({})
    setEditingEnvDuplicateIds([])
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
    setEditingEnvDuplicateIds([])
    setContainerDialogOpen(false)
    setEditingContainerId(null)
  }, [editingContainerId])

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
    async () => {
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
        const normalizedSchedule = kind === "CronJob" ? source.schedule.trim() : ""
        const nextNameError = validateName(normalizedName)
        const nextNamespaceError = normalizedNamespace ? null : "请选择项目"
        const nextScheduleError = kind === "CronJob" && !normalizedSchedule ? CRON_SCHEDULE_REQUIRED_MESSAGE : null
        setNameError(nextNameError)
        setNamespaceError(nextNamespaceError)
        setScheduleError(nextScheduleError)
        if (nextNameError || nextNamespaceError || nextScheduleError) {
          if (yamlMode) {
            setYamlError(nextNameError ?? nextNamespaceError ?? nextScheduleError)
          } else {
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

        const normalizedStorageName = savedStorageVolume.volumeName.trim()
        const normalizedStorageId =
          savedStorageVolume.volumeKind === "persistent"
            ? normalizedStorageName
            : savedStorageVolume.volumeId.trim() ||
              (normalizedStorageName ? createStorageVolumeId() : "")
        const normalizedStorageMounts = savedStorageVolume.mounts
          .map((item) => ({
            containerName: item.containerName.trim(),
            mountMode: item.mountMode,
            mountPath: item.mountPath.trim(),
          }))
          .filter(
            (item) =>
              item.containerName.length > 0 &&
              (item.mountMode === "ro" || item.mountMode === "rw") &&
              item.mountPath.length > 0
          )
        const normalizedStorage =
          normalizedStorageName && normalizedStorageId
            ? {
                volumeId: normalizedStorageId,
                volumeKind: savedStorageVolume.volumeKind,
                volumeName: normalizedStorageName,
                mounts: normalizedStorageMounts,
              }
            : undefined

        const pod =
          source.pod.restartPolicy === "OnFailure" || normalizedContainers.length > 0 || normalizedStorage
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
              }
            : undefined

        await onSubmit({
          kind,
          name: normalizedName,
          namespace: normalizedNamespace,
          description: source.description.trim(),
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
      savedStorageVolume,
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
    savedStorageVolume,
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
