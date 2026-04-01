"use client"

import * as React from "react"
import { IconBraces, IconDatabase, IconPencil, IconSettings2, IconStack2, IconTrash } from "@tabler/icons-react"
import { parse, stringify } from "yaml"
import { ContainerListPanel } from "@/app/(console)/dashboard/components/resource-pages/container-list-panel"
import { CreateContainerDialog } from "@/app/(console)/dashboard/components/resource-pages/create-container-dialog"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import { StorageVolumeList } from "@/app/(console)/dashboard/components/resource-pages/storage-volume-list"
import { useContainerEditor } from "@/app/(console)/dashboard/components/resource-pages/use-container-editor"
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
} from "@/app/(console)/dashboard/components/resource-pages/create-job-dialog.logic"
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
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { fetchResourceCollection } from "@/app/lib/kubespark/common"

type CreateStep = "basic" | "pod" | "storage" | "advanced"
const STEP_ORDER: CreateStep[] = ["basic", "pod", "storage", "advanced"]
const POD_REQUIRED_MESSAGE = "请至少添加一个容器配置"
const DESCRIPTION_MAX_LENGTH = 256

type PodDialogSnapshot = {
  name: string
  namespace: string
  description: string
  storageList?: Array<{
    volumeId?: string
    volumeKind?: "persistent" | "ephemeral" | "hostPath"
    volumeName?: string
    mounts?: Array<{
      containerName: string
      mountMode: "none" | "ro" | "rw"
      mountPath: string
    }>
  }>
  configList?: Array<{
    sourceKind: "configMap" | "secret"
    sourceName: string
    mounts?: Array<{
      containerName: string
      mountMode: "none" | "ro"
      mountPath: string
    }>
  }>
}

type StorageVolumeKind = "persistent" | "ephemeral" | "hostPath"
type StorageMountMode = "none" | "ro" | "rw"
type ConfigMountSourceKind = "configMap" | "secret"

type StorageVolumeDraft = {
  volumeId: string
  volumeKind: StorageVolumeKind
  volumeName: string
  mounts: Array<{
    containerName: string
    mountMode: StorageMountMode
    mountPath: string
  }>
}

type ConfigMountDraft = {
  sourceKind: ConfigMountSourceKind
  sourceName: string
  mounts: Array<{
    containerName: string
    mountMode: "none" | "ro"
    mountPath: string
  }>
}

const EMPTY_STORAGE_VOLUME_DRAFT: StorageVolumeDraft = {
  volumeId: "",
  volumeKind: "persistent",
  volumeName: "",
  mounts: [],
}

const EMPTY_CONFIG_MOUNT_DRAFT: ConfigMountDraft = {
  sourceKind: "configMap",
  sourceName: "",
  mounts: [],
}

function resolveResourceNames(items: unknown[]): string[] {
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

function validateName(value: string): string | null {
  const text = value.trim().toLowerCase()
  if (!text) return "请输入名称"
  if (text.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(text)) return NAME_RULE_MESSAGE
  return null
}

function buildYamlText(
  snapshot: PodDialogSnapshot,
  containers: ReturnType<typeof useContainerEditor>["configuredContainers"],
  storageList?: PodDialogSnapshot["storageList"],
  configList?: PodDialogSnapshot["configList"]
): string {
  const podSpec = buildPodSpecFromContainers("Never", containers, storageList ?? [], configList ?? [])
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
      storageList: parsedJob.pod.storageList ?? [],
      configList: parsedJob.pod.configList ?? [],
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
  const [storageVolumeDraft, setStorageVolumeDraft] = React.useState<StorageVolumeDraft>(EMPTY_STORAGE_VOLUME_DRAFT)
  const [savedStorageVolumes, setSavedStorageVolumes] = React.useState<StorageVolumeDraft[]>([])
  const [editingStorageVolume, setEditingStorageVolume] = React.useState(false)
  const [editingStorageVolumeIndex, setEditingStorageVolumeIndex] = React.useState<number | null>(null)
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
  const lockedIdentityRef = React.useRef<{ name: string; namespace: string } | null>(null)

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
  const isStorageStep = activeStep === "storage"
  const isEditingStorageView = isStorageStep && editingStorageVolume
  const isEditingConfigMountView = isStorageStep && editingConfigMount
  const canNavigateStorageView = !isBusy && !containerDialogOpen && !isEditingStorageView && !isEditingConfigMountView
  const volumeNameOptions = persistentVolumeNameOptions
  const configSourceNameOptions =
    configMountDraft.sourceKind === "configMap" ? configMapNameOptions : secretNameOptions
  const isConfigSourceNameEmpty = configMountDraft.sourceName.trim().length === 0
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
    currentStorageVolumeId.length > 0 && existingStorageVolumeIds.has(currentStorageVolumeId)
  const isStorageVolumeNameEmpty = storageVolumeDraft.volumeName.trim().length === 0
  const isPersistentVolumeIdEmpty =
    storageVolumeDraft.volumeKind === "persistent" && storageVolumeDraft.volumeId.trim().length === 0
  const isHostPathVolumeIdEmpty =
    storageVolumeDraft.volumeKind === "hostPath" && storageVolumeDraft.volumeId.trim().length === 0

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
      setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
      setSavedStorageVolumes([])
      setEditingStorageVolume(false)
      setEditingStorageVolumeIndex(null)
      setPersistentVolumeNameOptions([])
      setPersistentVolumeNameLoading(false)
      setPersistentVolumeNameError(null)
      setStorageSaveAttempted(false)
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
      lockedIdentityRef.current = null
    }
  }, [open, setContainers])

  const withLockedIdentity = React.useCallback((snapshot: PodDialogSnapshot): PodDialogSnapshot => {
    if (!isEditMode) return snapshot
    const locked = lockedIdentityRef.current
    if (!locked) return snapshot
    return {
      ...snapshot,
      name: locked.name,
      namespace: locked.namespace,
    }
  }, [isEditMode])

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
      storageList: savedStorageVolumes.map((item) => ({
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
      })),
      configList: savedConfigMounts.map((item) => ({
        sourceKind: item.sourceKind,
        sourceName: item.sourceName.trim(),
        mounts: item.mounts
          .map((mount) => ({
            containerName: mount.containerName.trim(),
            mountMode: mount.mountMode,
            mountPath: mount.mountPath.trim(),
          }))
          .filter((mount) => mount.containerName.length > 0),
      })),
    }),
    [description, name, namespace, savedConfigMounts, savedStorageVolumes]
  )

  const applySnapshot = React.useCallback(
    (next: PodDialogSnapshot, parsedContainers: NonNullable<ReturnType<typeof parseJobYamlText>["pod"]["containers"]>) => {
      setName(next.name)
      setNamespace(next.namespace)
      setDescription(next.description)
      setContainers(Array.isArray(parsedContainers) ? parsedContainers.slice(0, 1) : [])
      const normalizedStorage = Array.isArray(next.storageList)
        ? next.storageList
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
                      containerName: typeof mount.containerName === "string" ? mount.containerName.trim() : "",
                      mountMode:
                        mount.mountMode === "ro" || mount.mountMode === "rw" || mount.mountMode === "none"
                          ? mount.mountMode
                          : "none",
                      mountPath: typeof mount.mountPath === "string" ? mount.mountPath.trim() : "",
                    }))
                    .filter((mount) => mount.containerName.length > 0)
                : [],
            }))
            .filter((item) => item.volumeName.length > 0 || item.mounts.length > 0)
        : []
      setSavedStorageVolumes(normalizedStorage)
      setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
      setEditingStorageVolume(false)
      setEditingStorageVolumeIndex(null)
      setStorageSaveAttempted(false)

      const normalizedConfig = Array.isArray(next.configList)
        ? next.configList
            .map((item) => ({
              sourceKind: item.sourceKind === "secret" ? "secret" : "configMap",
              sourceName: item.sourceName.trim(),
              mounts: (Array.isArray(item.mounts) ? item.mounts : [])
                .map((mount) => ({
                  containerName: mount.containerName.trim(),
                  mountMode: mount.mountMode === "ro" ? "ro" : "none",
                  mountPath: mount.mountPath.trim(),
                }))
                .filter((mount) => mount.containerName.length > 0),
            }))
            .filter((item) => item.sourceName.length > 0)
        : []
      setSavedConfigMounts(normalizedConfig)
      setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
      setEditingConfigMount(false)
      setEditingConfigMountIndex(null)
      setConfigMountSaveAttempted(false)
    },
    [setContainers]
  )

  React.useEffect(() => {
    if (!open || !isEditMode || !initialYamlText) return
    try {
      const parsed = parseYamlText(initialYamlText)
      lockedIdentityRef.current = {
        name: parsed.snapshot.name.trim(),
        namespace: parsed.snapshot.namespace.trim(),
      }
      applySnapshot(withLockedIdentity(parsed.snapshot), parsed.containers)
      setYamlText(initialYamlText)
      setYamlError(null)
      setSubmitError(null)
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
    }
  }, [applySnapshot, initialYamlText, isEditMode, open, setSubmitError, withLockedIdentity])

  const resolveStorageContainerNames = React.useCallback(() => {
    const names =
      configuredContainers.length > 0
        ? configuredContainers.map((item) => item.name.trim())
        : containers.map((item) => item.name.trim())
    return Array.from(new Set(names.filter((item) => item.length > 0)))
  }, [configuredContainers, containers])

  const startEditStorageVolume = React.useCallback(
    (index: number) => {
      setStorageVolumeDraft((current) => {
        const selected = savedStorageVolumes[index]
        const base = selected && (selected.volumeName.trim().length > 0 || selected.mounts.length > 0) ? selected : current
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
        return { ...base, mounts }
      })
      setEditingStorageVolumeIndex(index)
      setEditingStorageVolume(true)
      if (submitError) setSubmitError(null)
    },
    [resolveStorageContainerNames, savedStorageVolumes, submitError]
  )

  const startAddStorageVolume = React.useCallback(() => {
    const mounts = resolveStorageContainerNames().map((containerName) => ({
      containerName,
      mountMode: "none" as const,
      mountPath: "",
    }))
    setStorageVolumeDraft({ ...EMPTY_STORAGE_VOLUME_DRAFT, mounts })
    setEditingStorageVolumeIndex(null)
    setEditingStorageVolume(true)
    if (submitError) setSubmitError(null)
  }, [resolveStorageContainerNames, submitError])

  const cancelEditStorageVolume = React.useCallback(() => {
    if (editingStorageVolumeIndex !== null && editingStorageVolumeIndex >= 0 && editingStorageVolumeIndex < savedStorageVolumes.length) {
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
      storageVolumeDraft.volumeKind === "ephemeral" ? normalizedVolumeName : currentVolumeId || normalizedVolumeName
    const nextItem: StorageVolumeDraft = { ...storageVolumeDraft, volumeId: normalizedVolumeId }
    setSavedStorageVolumes((current) => {
      if (editingStorageVolumeIndex !== null && editingStorageVolumeIndex >= 0 && editingStorageVolumeIndex < current.length) {
        return current.map((item, index) => (index === editingStorageVolumeIndex ? nextItem : item))
      }
      return [...current, nextItem]
    })
    setEditingStorageVolumeIndex(null)
    setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
    setEditingStorageVolume(false)
    setStorageSaveAttempted(false)
  }, [editingStorageVolumeIndex, storageVolumeDraft])

  const updateStorageVolumeDraft = React.useCallback(
    <K extends keyof StorageVolumeDraft>(field: K, value: StorageVolumeDraft[K]) => {
      setStorageVolumeDraft((current) => {
        if (current[field] === value) return current
        return { ...current, [field]: value }
      })
    },
    []
  )

  const updateStorageVolumeMount = React.useCallback(
    <K extends keyof StorageVolumeDraft["mounts"][number]>(
      containerName: string,
      field: K,
      value: StorageVolumeDraft["mounts"][number][K]
    ) => {
      setStorageVolumeDraft((current) => {
        let changed = false
        const nextMounts = current.mounts.map((item) => {
          if (item.containerName !== containerName) return item
          if (item[field] === value) return item
          changed = true
          return { ...item, [field]: value }
        })
        if (!changed) return current
        return {
          ...current,
          mounts: nextMounts,
        }
      })
    },
    []
  )

  const removeStorageVolume = React.useCallback(
    (index: number) => {
      setSavedStorageVolumes((current) => current.filter((_, i) => i !== index))
      if (editingStorageVolumeIndex === index) {
        setStorageVolumeDraft(EMPTY_STORAGE_VOLUME_DRAFT)
        setEditingStorageVolumeIndex(null)
        setEditingStorageVolume(false)
      } else if (editingStorageVolumeIndex !== null && editingStorageVolumeIndex > index) {
        setEditingStorageVolumeIndex(editingStorageVolumeIndex - 1)
      }
    },
    [editingStorageVolumeIndex]
  )

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
    setPersistentVolumeNameLoading(true)
    setPersistentVolumeNameError(null)
    void fetchResourceCollection("core", "v1", "persistentvolumeclaims", namespace.trim() ? { namespace: namespace.trim() } : undefined)
      .then(({ items }) => {
        if (cancelled) return
        setPersistentVolumeNameOptions(resolveResourceNames(items))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setPersistentVolumeNameError(error instanceof Error && error.message ? error.message : "加载 PVC 失败")
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
  }, [persistentVolumeNameOptions, storageVolumeDraft.volumeKind, storageVolumeDraft.volumeName, updateStorageVolumeDraft])

  React.useEffect(() => {
    if (!open || !isStorageStep) return
    let cancelled = false
    setConfigResourceLoading(true)
    setConfigResourceError(null)
    const namespaceValue = namespace.trim()
    void Promise.all([
      fetchResourceCollection("core", "v1", "configmaps", namespaceValue ? { namespace: namespaceValue } : undefined),
      fetchResourceCollection("core", "v1", "secrets", namespaceValue ? { namespace: namespaceValue } : undefined),
    ])
      .then(([configMapsResult, secretsResult]) => {
        if (cancelled) return
        setConfigMapNameOptions(resolveResourceNames(configMapsResult.items))
        setSecretNameOptions(resolveResourceNames(secretsResult.items))
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setConfigResourceError(error instanceof Error && error.message ? error.message : "加载配置资源失败")
        setConfigMapNameOptions([])
        setSecretNameOptions([])
      })
      .finally(() => {
        if (!cancelled) setConfigResourceLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isStorageStep, namespace, open])

  React.useEffect(() => {
    const options = configMountDraft.sourceKind === "configMap" ? configMapNameOptions : secretNameOptions
    if (!configMountDraft.sourceName) return
    if (options.includes(configMountDraft.sourceName)) return
    setConfigMountDraft((current) => ({ ...current, sourceName: "" }))
  }, [configMapNameOptions, configMountDraft.sourceKind, configMountDraft.sourceName, secretNameOptions])

  const startAddConfigMount = React.useCallback(() => {
    const mounts = resolveStorageContainerNames().map((containerName) => ({
      containerName,
      mountMode: "none" as const,
      mountPath: "",
    }))
    setConfigMountDraft({ ...EMPTY_CONFIG_MOUNT_DRAFT, mounts })
    setEditingConfigMountIndex(null)
    setEditingConfigMount(true)
    setConfigMountSaveAttempted(false)
    if (submitError) setSubmitError(null)
  }, [resolveStorageContainerNames, submitError])

  const startEditConfigMount = React.useCallback(
    (index: number) => {
      const selected = savedConfigMounts[index]
      if (!selected) return
      const containerNames = resolveStorageContainerNames()
      const previousByName = new Map(selected.mounts.map((item) => [item.containerName, item]))
      const mounts = containerNames.map((containerName) => {
        const previous = previousByName.get(containerName)
        return {
          containerName,
          mountMode: previous?.mountMode ?? "none",
          mountPath: previous?.mountPath ?? "",
        }
      })
      setConfigMountDraft({
        sourceKind: selected.sourceKind,
        sourceName: selected.sourceName,
        mounts,
      })
      setEditingConfigMountIndex(index)
      setEditingConfigMount(true)
      setConfigMountSaveAttempted(false)
      if (submitError) setSubmitError(null)
    },
    [resolveStorageContainerNames, savedConfigMounts, submitError]
  )

  const cancelEditConfigMount = React.useCallback(() => {
    setEditingConfigMount(false)
    setEditingConfigMountIndex(null)
    setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
    setConfigMountSaveAttempted(false)
  }, [])

  const updateConfigMountDraft = React.useCallback(
    <K extends keyof ConfigMountDraft>(field: K, value: ConfigMountDraft[K]) => {
      setConfigMountDraft((current) => {
        if (current[field] === value) return current
        return { ...current, [field]: value }
      })
    },
    []
  )

  const updateConfigMountDraftMount = React.useCallback(
    <K extends keyof ConfigMountDraft["mounts"][number]>(
      containerName: string,
      field: K,
      value: ConfigMountDraft["mounts"][number][K]
    ) => {
      setConfigMountDraft((current) => {
        let changed = false
        const nextMounts = current.mounts.map((item) => {
          if (item.containerName !== containerName) return item
          if (item[field] === value) return item
          changed = true
          return { ...item, [field]: value }
        })
        if (!changed) return current
        return {
          ...current,
          mounts: nextMounts,
        }
      })
    },
    []
  )

  const confirmEditConfigMount = React.useCallback(() => {
    setConfigMountSaveAttempted(true)
    const sourceName = configMountDraft.sourceName.trim()
    if (!sourceName) return
    const normalized: ConfigMountDraft = {
      sourceKind: configMountDraft.sourceKind,
      sourceName,
      mounts: configMountDraft.mounts.map((item) => ({
        containerName: item.containerName.trim(),
        mountMode: item.mountMode,
        mountPath: item.mountPath.trim(),
      })),
    }
    setSavedConfigMounts((current) => {
      if (editingConfigMountIndex !== null && editingConfigMountIndex >= 0 && editingConfigMountIndex < current.length) {
        return current.map((item, index) => (index === editingConfigMountIndex ? normalized : item))
      }
      return [...current, normalized]
    })
    setEditingConfigMount(false)
    setEditingConfigMountIndex(null)
    setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
    setConfigMountSaveAttempted(false)
  }, [configMountDraft, editingConfigMountIndex])

  const removeConfigMount = React.useCallback(
    (index: number) => {
      setSavedConfigMounts((current) => current.filter((_, i) => i !== index))
      if (editingConfigMountIndex === index) {
        setEditingConfigMount(false)
        setEditingConfigMountIndex(null)
        setConfigMountDraft(EMPTY_CONFIG_MOUNT_DRAFT)
      } else if (editingConfigMountIndex !== null && editingConfigMountIndex > index) {
        setEditingConfigMountIndex(editingConfigMountIndex - 1)
      }
    },
    [editingConfigMountIndex]
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
    const normalizedDescription = description.trim()
    if (normalizedDescription.length > DESCRIPTION_MAX_LENGTH) {
      const message = `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 个字符`
      if (yamlMode) setYamlError(message)
      setSubmitError(message)
      setActiveStep("basic")
      return
    }
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
    const podSpec = buildPodSpecFromContainers("Never", configuredContainers, savedStorageVolumes, savedConfigMounts)
    setCreating(true)
    try {
      await onSubmit({
        name: name.trim(),
        namespace: namespace.trim(),
        description: normalizedDescription,
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
    yamlMode,
    name,
    namespace,
    onOpenChange,
    onSubmit,
    setSubmitError,
    validateBasic,
    validatePod,
    savedConfigMounts,
    savedStorageVolumes,
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
        className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between border-b bg-muted/15">
            <DialogHeader className="px-6 py-4">
              <DialogTitle>{isEditMode ? "编辑容器组" : "创建容器组"}</DialogTitle>
              <DialogDescription>
                {isEditMode
                  ? "编辑 Kubernetes Pod 的配置内容。"
                  : "使用 Kubernetes Pod 创建一次性容器组。"}
              </DialogDescription>
            </DialogHeader>
            <div className="h-full flex items-center me-20">
              <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                <span className="text-sm font-medium">编辑 YAML</span>
                <Switch
                  checked={yamlMode}
                  onCheckedChange={(checked) => {
                    if (creating) return
                    if (checked) {
                      setYamlText(
                        buildYamlText(
                          buildSnapshot(),
                          configuredContainers,
                          savedStorageVolumes,
                          savedConfigMounts
                        )
                      )
                      setYamlError(null)
                      setYamlMode(true)
                      return
                    }
                    try {
                      const parsed = parseYamlText(yamlText)
                      applySnapshot(withLockedIdentity(parsed.snapshot), parsed.containers)
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
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      className="min-h-24"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      描述将写入资源注解 `description`，最长 {DESCRIPTION_MAX_LENGTH} 个字符。
                    </FieldDescription>
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
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">存储设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">配置卷挂载与配置挂载，支持在当前页面直接录入并保存。</p>
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
                          <FieldLabel htmlFor="create-pod-storage-volume-id">卷名称</FieldLabel>
                          <Input
                            id="create-pod-storage-volume-id"
                            value={storageVolumeDraft.volumeId}
                            onChange={(event) => updateStorageVolumeDraft("volumeId", event.target.value)}
                            placeholder="例如：volume-data"
                            autoComplete="off"
                            aria-invalid={(storageSaveAttempted && isPersistentVolumeIdEmpty) || hasDuplicateStorageSelection}
                          />
                          {hasDuplicateStorageSelection ? (
                            <FieldDescription className="text-destructive">卷名称已存在，请回到上方已添加条目中编辑。</FieldDescription>
                          ) : storageSaveAttempted && isPersistentVolumeIdEmpty ? (
                            <FieldDescription className="text-destructive">请输入卷名称，或点击取消返回。</FieldDescription>
                          ) : null}
                        </Field>

                        <Field>
                          <FieldLabel htmlFor="create-pod-storage-volume-name">选择 PVC</FieldLabel>
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
                            <SelectTrigger id="create-pod-storage-volume-name" aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}>
                              <SelectValue placeholder={persistentVolumeNameLoading ? "PVC 加载中..." : "请选择 PVC"} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {volumeNameOptions.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {persistentVolumeNameError ? (
                            <FieldDescription className="text-destructive">{persistentVolumeNameError}</FieldDescription>
                          ) : storageSaveAttempted && isStorageVolumeNameEmpty ? (
                            <FieldDescription className="text-destructive">请选择 PVC，或点击取消返回。</FieldDescription>
                          ) : volumeNameOptions.length === 0 && !persistentVolumeNameLoading ? (
                            <FieldDescription>当前命名空间暂无可选 PVC。</FieldDescription>
                          ) : null}
                        </Field>
                      </div>
                    ) : storageVolumeDraft.volumeKind === "hostPath" ? (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="create-pod-storage-volume-id">卷名称</FieldLabel>
                          <Input
                            id="create-pod-storage-volume-id"
                            value={storageVolumeDraft.volumeId}
                            onChange={(event) => updateStorageVolumeDraft("volumeId", event.target.value)}
                            placeholder="例如：test3"
                            autoComplete="off"
                            aria-invalid={(storageSaveAttempted && isHostPathVolumeIdEmpty) || hasDuplicateStorageSelection}
                          />
                          {hasDuplicateStorageSelection ? (
                            <FieldDescription className="text-destructive">卷名称已存在，请回到上方已添加条目中编辑。</FieldDescription>
                          ) : storageSaveAttempted && isHostPathVolumeIdEmpty ? (
                            <FieldDescription className="text-destructive">请输入卷名称，或点击取消返回。</FieldDescription>
                          ) : null}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="create-pod-storage-volume-name">主机路径</FieldLabel>
                          <Input
                            id="create-pod-storage-volume-name"
                            value={storageVolumeDraft.volumeName}
                            onChange={(event) => updateStorageVolumeDraft("volumeName", event.target.value)}
                            placeholder="例如：/test3"
                            autoComplete="off"
                            aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                          />
                          {storageSaveAttempted && isStorageVolumeNameEmpty ? (
                            <FieldDescription className="text-destructive">请输入主机路径，或点击取消返回。</FieldDescription>
                          ) : null}
                        </Field>
                      </div>
                    ) : (
                      <Field>
                        <FieldLabel htmlFor="create-pod-storage-volume-name">卷名称</FieldLabel>
                        <Input
                          id="create-pod-storage-volume-name"
                          value={storageVolumeDraft.volumeName}
                          onChange={(event) => {
                            const value = event.target.value
                            updateStorageVolumeDraft("volumeName", value)
                            updateStorageVolumeDraft("volumeId", value)
                          }}
                          placeholder="例如：test2"
                          autoComplete="off"
                          aria-invalid={storageSaveAttempted && isStorageVolumeNameEmpty}
                        />
                        {storageSaveAttempted && isStorageVolumeNameEmpty ? (
                          <FieldDescription className="text-destructive">请输入卷名称，或点击取消返回。</FieldDescription>
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
                            <Input id={`create-pod-storage-container-${index}`} value={item.containerName} disabled autoComplete="off" />
                            <Select
                              value={item.mountMode}
                              onValueChange={(value) => {
                                if (value === "none" || value === "ro" || value === "rw") {
                                  updateStorageVolumeMount(item.containerName, "mountMode", value)
                                }
                              }}
                            >
                              <SelectTrigger id={`create-pod-storage-mode-${index}`} aria-label="挂载模式" className="w-full">
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
                              id={`create-pod-storage-path-${index}`}
                              value={item.mountPath}
                              onChange={(event) => updateStorageVolumeMount(item.containerName, "mountPath", event.target.value)}
                              placeholder="例如：/etc/config"
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
                      <FieldLabel>资源类型</FieldLabel>
                      <Tabs
                        value={configMountDraft.sourceKind}
                        onValueChange={(value) => {
                          if (value === "configMap" || value === "secret") {
                            updateConfigMountDraft("sourceKind", value)
                            updateConfigMountDraft("sourceName", "")
                          }
                        }}
                      >
                        <TabsList className="grid w-full max-w-md grid-cols-2">
                          <TabsTrigger value="configMap">配置字典</TabsTrigger>
                          <TabsTrigger value="secret">保密字典</TabsTrigger>
                        </TabsList>
                      </Tabs>
                    </Field>
                    <Field>
                      <FieldLabel>选择资源</FieldLabel>
                      <Select value={configMountDraft.sourceName} onValueChange={(value) => updateConfigMountDraft("sourceName", value)}>
                        <SelectTrigger aria-invalid={configMountSaveAttempted && isConfigSourceNameEmpty}>
                          <SelectValue placeholder={configResourceLoading ? "资源加载中..." : "请选择资源"} />
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
                        <FieldDescription className="text-destructive">请选择资源，或点击取消返回。</FieldDescription>
                      ) : configSourceNameOptions.length === 0 && !configResourceLoading ? (
                        <FieldDescription>当前命名空间暂无可选资源。</FieldDescription>
                      ) : null}
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
                            <Input id={`create-pod-config-container-${index}`} value={item.containerName} disabled autoComplete="off" />
                            <Select
                              value={item.mountMode}
                              onValueChange={(value) => {
                                if (value === "none" || value === "ro") {
                                  updateConfigMountDraftMount(item.containerName, "mountMode", value)
                                }
                              }}
                            >
                              <SelectTrigger id={`create-pod-config-mode-${index}`} aria-label="挂载模式" className="w-full">
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
                              id={`create-pod-config-path-${index}`}
                              value={item.mountPath}
                              onChange={(event) => updateConfigMountDraftMount(item.containerName, "mountPath", event.target.value)}
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
                            <Item key={`${item.sourceKind}-${item.sourceName}-${index}`} variant="outline" size="sm" className="hover:bg-muted">
                              <ItemContent className="min-w-0">
                                <ItemTitle className="min-w-0 truncate">{item.sourceName}</ItemTitle>
                                <ItemDescription className="min-w-0 truncate">
                                  {(item.sourceKind === "configMap" ? "配置字典" : "保密字典") +
                                    " · " +
                                    `${item.mounts.filter((mount) => mount.mountMode !== "none" && mount.mountPath.trim().length > 0).length} 个容器已配置`}
                                </ItemDescription>
                              </ItemContent>
                              <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                                <Button type="button" variant="outline" size="sm" onClick={() => startEditConfigMount(index)} disabled={isBusy}>
                                  <IconPencil data-icon="inline-start" />
                                  编辑
                                </Button>
                                <Button type="button" size="sm" variant="outline" onClick={() => setPendingDeleteConfigMountIndex(index)} disabled={isBusy}>
                                  <IconTrash data-icon="inline-start" />
                                  删除
                                </Button>
                              </ItemActions>
                            </Item>
                          ))
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                            <div className="text-sm font-semibold">暂无配置挂载</div>
                            <div className="mt-1 text-sm text-muted-foreground">可挂载配置字典或保密字典内容到容器。</div>
                          </div>
                        )}
                        <button
                          type="button"
                          className="flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={startAddConfigMount}
                          disabled={isBusy}
                        >
                          <span className="text-sm font-semibold">添加配置挂载</span>
                          <span className="mt-1 text-sm text-muted-foreground">新增一条配置字典/保密字典挂载配置。</span>
                        </button>
                      </div>
                    </Field>
                  </FieldGroup>
                )}
              </div>
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
                      applySnapshot(withLockedIdentity(parsed.snapshot), parsed.containers)
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
          ) : isEditingStorageView ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelEditStorageVolume} disabled={isBusy}>
                  取消
                </Button>
                <Button type="button" onClick={handleConfirmStorageSave} disabled={isBusy || hasDuplicateStorageSelection}>
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
                <Button type="button" onClick={confirmEditConfigMount} disabled={isBusy || isConfigSourceNameEmpty}>
                  确认保存
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
                  disabled={activeStep === "storage" ? !canNavigateStorageView : isBusy}
                >
                  上一步
                </Button>
                <Button type="button" onClick={handleNext} disabled={activeStep === "storage" ? !canNavigateStorageView : isBusy}>
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
        deleting={false}
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
            ? `确定删除配置挂载 ${(savedConfigMounts[pendingDeleteConfigMountIndex]?.sourceName || "未命名资源").trim()} 吗？`
            : ""
        }
        deleting={false}
        onConfirm={() => {
          if (pendingDeleteConfigMountIndex === null) return
          removeConfigMount(pendingDeleteConfigMountIndex)
          setPendingDeleteConfigMountIndex(null)
        }}
      />
    </Dialog>
  )
}
