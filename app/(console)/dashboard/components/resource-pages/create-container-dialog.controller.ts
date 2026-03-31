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
} from "@/app/(console)/dashboard/components/resource-pages/create-container-dialog.logic"

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

type DraftRequiredFieldErrors = {
  command?: string
  httpPort?: string
  tcpPort?: string
}

function createDefaultProbeDraftFieldErrors(): Record<ProbeSectionKey, DraftRequiredFieldErrors> {
  return {
    liveness: {},
    readiness: {},
    startup: {},
  }
}

function createDefaultLifecycleDraftFieldErrors(): Record<LifecycleSectionKey, DraftRequiredFieldErrors> {
  return {
    postStart: {},
    preStop: {},
  }
}

function resolveDraftRequiredFieldErrors(
  draft: Pick<ContainerProbeDraft, "mode" | "command" | "httpPort" | "tcpPort">
): DraftRequiredFieldErrors {
  const isValidPort = (raw: string) => {
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535
  }
  if (draft.mode === "command") {
    return draft.command.trim() ? {} : { command: "请输入命令" }
  }
  if (draft.mode === "http") {
    if (!draft.httpPort.trim()) return {}
    return isValidPort(draft.httpPort.trim()) ? {} : { httpPort: "端口范围需在 1-65535" }
  }
  if (draft.mode === "tcp") {
    if (!draft.tcpPort.trim()) return {}
    return isValidPort(draft.tcpPort.trim()) ? {} : { tcpPort: "TCP 端口范围需在 1-65535" }
  }
  return {}
}

function normalizeProbeDraftForConfirm(draft: ContainerProbeDraft): ContainerProbeDraft {
  const normalizedPath = draft.httpPath.trim() ? draft.httpPath.trim() : "/"
  const normalizedHttpPort = draft.httpPort.trim() ? draft.httpPort.trim() : "80"
  const normalizedTcpPort = draft.tcpPort.trim() ? draft.tcpPort.trim() : "80"
  return {
    ...draft,
    httpPath: normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`,
    httpPort: normalizedHttpPort,
    tcpPort: normalizedTcpPort,
    initialDelaySeconds: draft.initialDelaySeconds.trim() ? draft.initialDelaySeconds.trim() : "0",
    timeoutSeconds: draft.timeoutSeconds.trim() ? draft.timeoutSeconds.trim() : "1",
    periodSeconds: draft.periodSeconds.trim() ? draft.periodSeconds.trim() : "10",
    successThreshold: draft.successThreshold.trim() ? draft.successThreshold.trim() : "1",
    failureThreshold: draft.failureThreshold.trim() ? draft.failureThreshold.trim() : "3",
    command: draft.command.trim(),
  }
}

function normalizeLifecycleDraftForConfirm(
  draft: ContainerLifecycleActionDraft
): ContainerLifecycleActionDraft {
  const normalizedPath = draft.httpPath.trim() ? draft.httpPath.trim() : "/"
  const normalizedHttpPort = draft.httpPort.trim() ? draft.httpPort.trim() : "80"
  const normalizedTcpPort = draft.tcpPort.trim() ? draft.tcpPort.trim() : "80"
  return {
    ...draft,
    httpPath: normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`,
    httpPort: normalizedHttpPort,
    tcpPort: normalizedTcpPort,
    command: draft.command.trim(),
  }
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
  const [probeDraftFieldErrors, setProbeDraftFieldErrors] = React.useState<
    Record<ProbeSectionKey, DraftRequiredFieldErrors>
  >(createDefaultProbeDraftFieldErrors)
  const [probePopoverOpen, setProbePopoverOpen] = React.useState<Record<ProbeSectionKey, boolean>>(
    createDefaultProbePopoverOpenState
  )
  const [lifecycleState, setLifecycleState] = React.useState<Record<LifecycleSectionKey, LifecycleSectionState>>(
    createDefaultLifecycleState
  )
  const [lifecycleDraftFieldErrors, setLifecycleDraftFieldErrors] = React.useState<
    Record<LifecycleSectionKey, DraftRequiredFieldErrors>
  >(createDefaultLifecycleDraftFieldErrors)
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
      setProbeDraftFieldErrors((current) => ({
        ...current,
        [section]: {},
      }))
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
    setProbeDraftFieldErrors((current) => ({
      ...current,
      [section]: {},
    }))
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
    const normalizedDraft = normalizeProbeDraftForConfirm(probeState[section].draft)
    const validationErrors = resolveDraftRequiredFieldErrors(normalizedDraft)
    if (Object.keys(validationErrors).length > 0) {
      setProbeDraftFieldErrors((current) => ({
        ...current,
        [section]: validationErrors,
      }))
      return
    }
    setProbeDraftFieldErrors((current) => ({
      ...current,
      [section]: {},
    }))
    const next = {
      ...probeState,
      [section]: {
        ...probeState[section],
        enabled: true,
        draft: normalizedDraft,
      },
    }
    setProbeState(next)
    onChange("probes", buildProbeMapFromState(next))
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange, probeState])

  const clearProbeEdit = React.useCallback((section: ProbeSectionKey) => {
    setProbeDraftFieldErrors((current) => ({
      ...current,
      [section]: {},
    }))
    const nextDraft = createDefaultProbeDraft()
    probeDraftSnapshotRef.current[section] = { ...nextDraft }
    const next = {
      ...probeState,
      [section]: {
        enabled: false,
        draft: nextDraft,
      },
    }
    setProbeState(next)
    onChange("probes", buildProbeMapFromState(next))
    setProbePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange, probeState])

  const updateLifecycleDraft = React.useCallback(
    (
      section: LifecycleSectionKey,
      field: LifecycleDraftField,
      value: string | ProbeMode | "HTTP" | "HTTPS"
    ) => {
      setLifecycleDraftFieldErrors((current) => ({
        ...current,
        [section]: {},
      }))
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
    setLifecycleDraftFieldErrors((current) => ({
      ...current,
      [section]: {},
    }))
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
    const normalizedDraft = normalizeLifecycleDraftForConfirm(lifecycleState[section].draft)
    const validationErrors = resolveDraftRequiredFieldErrors(normalizedDraft)
    if (Object.keys(validationErrors).length > 0) {
      setLifecycleDraftFieldErrors((current) => ({
        ...current,
        [section]: validationErrors,
      }))
      return
    }
    setLifecycleDraftFieldErrors((current) => ({
      ...current,
      [section]: {},
    }))
    const next = {
      ...lifecycleState,
      [section]: {
        ...lifecycleState[section],
        enabled: true,
        draft: normalizedDraft,
      },
    }
    setLifecycleState(next)
    onChange("lifecycle", buildLifecycleMapFromState(next))
    setLifecyclePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange, lifecycleState])

  const clearLifecycleEdit = React.useCallback((section: LifecycleSectionKey) => {
    setLifecycleDraftFieldErrors((current) => ({
      ...current,
      [section]: {},
    }))
    const nextDraft = createDefaultLifecycleActionDraft()
    lifecycleDraftSnapshotRef.current[section] = { ...nextDraft }
    const next = {
      ...lifecycleState,
      [section]: {
        enabled: false,
        draft: nextDraft,
      },
    }
    setLifecycleState(next)
    onChange("lifecycle", buildLifecycleMapFromState(next))
    setLifecyclePopoverOpen((current) => ({
      ...current,
      [section]: false,
    }))
  }, [onChange, lifecycleState])

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
    setProbeDraftFieldErrors(createDefaultProbeDraftFieldErrors())
    setProbePopoverOpen(createDefaultProbePopoverOpenState())
    setLifecycleState(createLifecycleStateFromContainer(container?.lifecycle))
    setLifecycleDraftFieldErrors(createDefaultLifecycleDraftFieldErrors())
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
    lifecycleDraftFieldErrors,
    lifecyclePopoverOpen,
    lifecycleState,
    probeDraftFieldErrors,
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
