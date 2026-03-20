"use client"

import * as React from "react"
import {
  fetchConfigMapKeyRefOptions,
  type ConfigMapKeyRefOption,
} from "@/app/lib/kubespark/configmaps"
import {
  resolveFirstContainerEditorErrorFieldId,
  type ContainerPortFieldErrors,
  scrollAndFocusFieldById,
} from "@/app/lib/kubespark/form-validation"
import {
  fetchSecretKeyRefOptions,
  type SecretKeyRefOption,
} from "@/app/lib/kubespark/secrets"
import {
  buildLifecycleMapFromState,
  buildProbeMapFromState,
  createDefaultExtensionState,
  createDefaultLifecycleActionDraft,
  createDefaultLifecyclePopoverOpenState,
  createDefaultLifecycleState,
  createDefaultProbeDraft,
  createDefaultProbePopoverOpenState,
  createDefaultProbeState,
  createDefaultSecurityContextDraft,
  createLifecycleStateFromContainer,
  createProbeStateFromContainer,
  hasEnabledSecurityContext,
  resolveDuplicateEnvNameIds,
  type ContainerDraft,
  type ContainerEnvVarSource,
  type ContainerExtensionOptionKey,
  type ContainerLifecycleActionDraft,
  type ContainerLifecycleMap,
  type ContainerProbeDraft,
  type ContainerProbeMap,
  type ContainerSecurityContextDraft,
  type EnvBatchSource,
  type LifecycleDraftField,
  type LifecycleSectionKey,
  type LifecycleSectionState,
  type ProbeMode,
  type ProbeDraftField,
  type ProbeSectionKey,
  type ProbeSectionState,
} from "@/app/(examples)/dashboard/components/resource-pages/create-container-dialog.logic"

type CreateContainerDialogControllerProps = {
  open: boolean
  namespace: string
  container: ContainerDraft | null
  imageError: string | null
  portFieldErrors: ContainerPortFieldErrors
  envDuplicateIds: string[]
  onAddEnv: (defaults?: {
    source?: ContainerEnvVarSource
    name?: string
    value?: string
    sourceResource?: string
    sourceKey?: string
  }) => void
  onChange: (
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
  ) => void
}

export function useCreateContainerDialogController(props: CreateContainerDialogControllerProps) {
  const {
    open,
    namespace,
    container,
    imageError,
    portFieldErrors,
    envDuplicateIds,
    onAddEnv,
    onChange,
  } = props
  const [configMapKeyRefOptions, setConfigMapKeyRefOptions] = React.useState<ConfigMapKeyRefOption[]>([])
  const [secretKeyRefOptions, setSecretKeyRefOptions] = React.useState<SecretKeyRefOption[]>([])
  const [envBatchPopoverOpen, setEnvBatchPopoverOpen] = React.useState(false)
  const [probeState, setProbeState] = React.useState<Record<ProbeSectionKey, ProbeSectionState>>(
    createDefaultProbeState
  )
  const [probePopoverOpen, setProbePopoverOpen] = React.useState<Record<ProbeSectionKey, boolean>>(
    createDefaultProbePopoverOpenState
  )
  const [lifecycleState, setLifecycleState] = React.useState<Record<LifecycleSectionKey, LifecycleSectionState>>(
    createDefaultLifecycleState
  )
  const [lifecyclePopoverOpen, setLifecyclePopoverOpen] = React.useState<
    Record<LifecycleSectionKey, boolean>
  >(createDefaultLifecyclePopoverOpenState)
  const [envBatchSource, setEnvBatchSource] = React.useState<EnvBatchSource>("configMap")
  const [envBatchResourceName, setEnvBatchResourceName] = React.useState("")
  const [envBatchSelectedKeys, setEnvBatchSelectedKeys] = React.useState<string[]>([])
  const [extensionState, setExtensionState] = React.useState<Record<ContainerExtensionOptionKey, boolean>>(
    createDefaultExtensionState
  )
  const extensionStateContainerIdRef = React.useRef<string | null>(null)
  const containerId = container?.id ?? null
  const syncHostTimezoneEnabled = container?.syncHostTimezone ?? false
  const startupCommandEnabled = (container?.command.trim().length ?? 0) > 0 || (container?.args.trim().length ?? 0) > 0
  const envEnabled = (container?.env.length ?? 0) > 0
  const securityContextEnabled = React.useMemo(
    () => hasEnabledSecurityContext(container?.securityContext),
    [container?.securityContext]
  )
  const securityContextDraft = React.useMemo(
    () => container?.securityContext ?? createDefaultSecurityContextDraft(),
    [container?.securityContext]
  )
  const probeEnabled = React.useMemo(() => {
    const probes = container?.probes
    if (!probes) return false
    return Boolean(probes.liveness || probes.readiness || probes.startup)
  }, [container?.probes])
  const lifecycleEnabled = React.useMemo(() => {
    const lifecycle = container?.lifecycle
    if (!lifecycle) return false
    return Boolean(lifecycle.postStart || lifecycle.preStop)
  }, [container?.lifecycle])
  const envBatchResources = envBatchSource === "configMap" ? configMapKeyRefOptions : secretKeyRefOptions
  const envBatchCurrentResource = React.useMemo(
    () => envBatchResources.find((item) => item.name === envBatchResourceName),
    [envBatchResources, envBatchResourceName]
  )
  const envBatchKeys = React.useMemo(
    () => envBatchCurrentResource?.keys ?? [],
    [envBatchCurrentResource]
  )
  const envBatchKeySet = React.useMemo(() => new Set(envBatchSelectedKeys), [envBatchSelectedKeys])
  const envBatchAllChecked = envBatchKeys.length > 0 && envBatchSelectedKeys.length === envBatchKeys.length
  const probeDraftSnapshotRef = React.useRef<Record<ProbeSectionKey, ContainerProbeDraft>>({
    liveness: createDefaultProbeDraft(),
    readiness: createDefaultProbeDraft(),
    startup: createDefaultProbeDraft(),
  })
  const lifecycleDraftSnapshotRef = React.useRef<Record<LifecycleSectionKey, ContainerLifecycleActionDraft>>({
    postStart: createDefaultLifecycleActionDraft(),
    preStop: createDefaultLifecycleActionDraft(),
  })
  const localDuplicateEnvIds = React.useMemo(
    () => resolveDuplicateEnvNameIds(container?.env ?? []),
    [container?.env]
  )
  const envDuplicateIdSet = React.useMemo(
    () => new Set([...envDuplicateIds, ...localDuplicateEnvIds]),
    [envDuplicateIds, localDuplicateEnvIds]
  )

  const updateProbeDraft = React.useCallback(
    (section: ProbeSectionKey, field: ProbeDraftField, value: string | ProbeMode | "HTTP" | "HTTPS") => {
      setProbeState((current) => ({
        ...current,
        [section]: {
          ...current[section],
          draft: {
            ...current[section].draft,
            [field]: value,
          },
        },
      }))
    },
    []
  )

  const handleProbePopoverOpenChange = React.useCallback(
    (section: ProbeSectionKey, nextOpen: boolean) => {
      if (nextOpen) {
        probeDraftSnapshotRef.current[section] = { ...probeState[section].draft }
      }
      setProbePopoverOpen((current) => ({
        ...current,
        [section]: nextOpen,
      }))
    },
    [probeState]
  )

  const cancelProbeEdit = React.useCallback((section: ProbeSectionKey) => {
    setProbeState((current) => ({
      ...current,
      [section]: {
        ...current[section],
        draft: { ...probeDraftSnapshotRef.current[section] },
      },
    }))
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [])

  const confirmProbeEdit = React.useCallback((section: ProbeSectionKey) => {
    setProbeState((current) => {
      const next = {
        ...current,
        [section]: {
          ...current[section],
          enabled: true,
        },
      }
      onChange("probes", buildProbeMapFromState(next))
      return next
    })
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange])

  const clearProbeEdit = React.useCallback((section: ProbeSectionKey) => {
    const nextDraft = createDefaultProbeDraft()
    probeDraftSnapshotRef.current[section] = { ...nextDraft }
    setProbeState((current) => {
      const next = {
        ...current,
        [section]: {
          enabled: false,
          draft: nextDraft,
        },
      }
      onChange("probes", buildProbeMapFromState(next))
      return next
    })
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange])

  const updateLifecycleDraft = React.useCallback(
    (
      section: LifecycleSectionKey,
      field: LifecycleDraftField,
      value: string | ProbeMode | "HTTP" | "HTTPS"
    ) => {
      setLifecycleState((current) => ({
        ...current,
        [section]: {
          ...current[section],
          draft: {
            ...current[section].draft,
            [field]: value,
          },
        },
      }))
    },
    []
  )

  const handleLifecyclePopoverOpenChange = React.useCallback(
    (section: LifecycleSectionKey, nextOpen: boolean) => {
      if (nextOpen) {
        lifecycleDraftSnapshotRef.current[section] = { ...lifecycleState[section].draft }
      }
      setLifecyclePopoverOpen((current) => ({
        ...current,
        [section]: nextOpen,
      }))
    },
    [lifecycleState]
  )

  const cancelLifecycleEdit = React.useCallback((section: LifecycleSectionKey) => {
    setLifecycleState((current) => ({
      ...current,
      [section]: {
        ...current[section],
        draft: { ...lifecycleDraftSnapshotRef.current[section] },
      },
    }))
    setLifecyclePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [])

  const confirmLifecycleEdit = React.useCallback((section: LifecycleSectionKey) => {
    setLifecycleState((current) => {
      const next = {
        ...current,
        [section]: {
          ...current[section],
          enabled: true,
        },
      }
      onChange("lifecycle", buildLifecycleMapFromState(next))
      return next
    })
    setLifecyclePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange])

  const clearLifecycleEdit = React.useCallback((section: LifecycleSectionKey) => {
    const nextDraft = createDefaultLifecycleActionDraft()
    lifecycleDraftSnapshotRef.current[section] = { ...nextDraft }
    setLifecycleState((current) => {
      const next = {
        ...current,
        [section]: {
          enabled: false,
          draft: nextDraft,
        },
      }
      onChange("lifecycle", buildLifecycleMapFromState(next))
      return next
    })
    setLifecyclePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange])

  const firstErrorFieldId = React.useMemo(() => {
    if (!container) return null
    return resolveFirstContainerEditorErrorFieldId({
      containerId: container.id,
      imageError,
      ports: container.ports,
      portFieldErrors,
    })
  }, [container, imageError, portFieldErrors])

  React.useEffect(() => {
    if (!firstErrorFieldId) return
    scrollAndFocusFieldById(firstErrorFieldId)
  }, [firstErrorFieldId])

  React.useEffect(() => {
    if (!containerId) return
    const isContainerChanged = extensionStateContainerIdRef.current !== containerId
    extensionStateContainerIdRef.current = containerId
    setExtensionState((current) => ({
      ...createDefaultExtensionState(),
      healthCheck: probeEnabled,
      lifecycle: isContainerChanged ? lifecycleEnabled : current.lifecycle || lifecycleEnabled,
      startupCommand: isContainerChanged
        ? startupCommandEnabled
        : current.startupCommand || startupCommandEnabled,
      env: envEnabled,
      securityContext: isContainerChanged
        ? securityContextEnabled
        : current.securityContext || securityContextEnabled,
      syncHostTimezone: syncHostTimezoneEnabled,
    }))
    setProbeState(createProbeStateFromContainer(container?.probes))
    setProbePopoverOpen(createDefaultProbePopoverOpenState())
    setLifecycleState(createLifecycleStateFromContainer(container?.lifecycle))
    setLifecyclePopoverOpen(createDefaultLifecyclePopoverOpenState())
  }, [
    containerId,
    envEnabled,
    lifecycleEnabled,
    probeEnabled,
    securityContextEnabled,
    startupCommandEnabled,
    syncHostTimezoneEnabled,
    container?.probes,
    container?.lifecycle,
  ])

  React.useEffect(() => {
    if (!open) return
    const ns = namespace.trim()
    if (!ns) {
      setConfigMapKeyRefOptions([])
      setSecretKeyRefOptions([])
      return
    }

    let cancelled = false

    void Promise.all([
      fetchConfigMapKeyRefOptions(ns),
      fetchSecretKeyRefOptions(ns),
    ])
      .then(([configMapOptions, secretOptions]) => {
        if (cancelled) return
        setConfigMapKeyRefOptions(configMapOptions)
        setSecretKeyRefOptions(secretOptions)
      })
      .catch(() => {
        if (cancelled) return
        setConfigMapKeyRefOptions([])
        setSecretKeyRefOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [open, namespace])

  React.useEffect(() => {
    if (!open) {
      extensionStateContainerIdRef.current = null
      setEnvBatchPopoverOpen(false)
      setEnvBatchSelectedKeys([])
      return
    }
    if (configMapKeyRefOptions.length > 0) {
      setEnvBatchSource("configMap")
      setEnvBatchResourceName(configMapKeyRefOptions[0]?.name ?? "")
      return
    }
    if (secretKeyRefOptions.length > 0) {
      setEnvBatchSource("secret")
      setEnvBatchResourceName(secretKeyRefOptions[0]?.name ?? "")
      return
    }
    setEnvBatchResourceName("")
  }, [open, configMapKeyRefOptions, secretKeyRefOptions])

  React.useEffect(() => {
    if (!envBatchPopoverOpen) return
    if (envBatchResources.length === 0) {
      setEnvBatchResourceName("")
      setEnvBatchSelectedKeys([])
      return
    }
    if (!envBatchResources.some((item) => item.name === envBatchResourceName)) {
      setEnvBatchResourceName(envBatchResources[0]?.name ?? "")
      setEnvBatchSelectedKeys([])
    }
  }, [envBatchPopoverOpen, envBatchResources, envBatchResourceName])

  React.useEffect(() => {
    setEnvBatchSelectedKeys((current) => current.filter((key) => envBatchKeys.includes(key)))
  }, [envBatchKeys])

  const toggleEnvBatchKey = React.useCallback((key: string, checked: boolean) => {
    setEnvBatchSelectedKeys((current) => {
      if (checked) {
        if (current.includes(key)) return current
        return [...current, key]
      }
      return current.filter((item) => item !== key)
    })
  }, [])

  const confirmEnvBatchImport = React.useCallback(() => {
    if (!envBatchResourceName.trim() || envBatchSelectedKeys.length === 0) return
    envBatchSelectedKeys.forEach((keyName) => {
      onAddEnv({
        source: envBatchSource,
        name: keyName,
        sourceResource: envBatchResourceName,
        sourceKey: keyName,
        value: "",
      })
    })
    setEnvBatchPopoverOpen(false)
    setEnvBatchSelectedKeys([])
  }, [envBatchResourceName, envBatchSelectedKeys, onAddEnv, envBatchSource])

  return {
    cancelLifecycleEdit,
    cancelProbeEdit,
    clearLifecycleEdit,
    clearProbeEdit,
    configMapKeyRefOptions,
    confirmEnvBatchImport,
    confirmLifecycleEdit,
    confirmProbeEdit,
    envBatchAllChecked,
    envBatchKeySet,
    envBatchKeys,
    envBatchPopoverOpen,
    envBatchResourceName,
    envBatchResources,
    envBatchSelectedKeys,
    envBatchSource,
    envDuplicateIdSet,
    extensionState,
    handleLifecyclePopoverOpenChange,
    handleProbePopoverOpenChange,
    lifecyclePopoverOpen,
    lifecycleState,
    probePopoverOpen,
    probeState,
    secretKeyRefOptions,
    securityContextDraft,
    setEnvBatchPopoverOpen,
    setEnvBatchResourceName,
    setEnvBatchSelectedKeys,
    setEnvBatchSource,
    setExtensionState,
    setLifecyclePopoverOpen,
    setLifecycleState,
    setProbePopoverOpen,
    setProbeState,
    toggleEnvBatchKey,
    updateLifecycleDraft,
    updateProbeDraft,
  }
}
