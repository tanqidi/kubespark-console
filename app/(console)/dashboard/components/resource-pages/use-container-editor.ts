"use client"

import * as React from "react"
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

export type ContainerEditorDeps = {
  CONTAINER_PORT_PROTOCOL_SET: Set<string>
  buildAutoPortName: (protocol: ContainerPortProtocol, containerPort: string) => string
  createContainerDraft: () => ContainerDraft
  createContainerEnvDraft: (defaults?: {
    source?: ContainerEnvVarSource
    name?: string
    value?: string
    sourceResource?: string
    sourceKey?: string
  }) => ContainerDraft["env"][number]
  createContainerPortDraft: (index: number) => ContainerDraft["ports"][number]
  ensureUniqueContainerName: (candidate: string, usedNames: Set<string>) => string
  isAutoContainerNameForImage: (name: string, image: string) => boolean
  isAutoPortNameForProtocol: (name: string, protocol: ContainerPortProtocol) => boolean
  normalizeLifecycleMap: (value: ContainerLifecycleMap | undefined) => ContainerLifecycleMap
  normalizeProbeMap: (value: ContainerProbeMap | undefined) => ContainerProbeMap
  normalizeSecurityContextDraft: (
    value: ContainerSecurityContextDraft | undefined
  ) => ContainerSecurityContextDraft
  replaceProtocolPrefixInName: (name: string, protocol: ContainerPortProtocol) => string | null
  resolveContainerNameFromImage: (image: string) => string
  resolveDuplicateContainerEnvNameIds: (env: ContainerDraft["env"]) => string[]
  toDnsLabelFragment: (value: string) => string
  validateContainerPorts: (ports: ContainerDraft["ports"]) => ContainerPortFieldErrors
}

type ContainerEditorParams = {
  deps: ContainerEditorDeps
  submitError: string | null
  setSubmitError: (value: string | null) => void
}

export function useContainerEditor({ deps, submitError, setSubmitError }: ContainerEditorParams) {
  const [containers, setContainers] = React.useState<ContainerDraft[]>([])
  const [containerDialogOpen, setContainerDialogOpen] = React.useState(false)
  const [editingContainerId, setEditingContainerId] = React.useState<string | null>(null)
  const [pendingDeleteContainerId, setPendingDeleteContainerId] = React.useState<string | null>(null)
  const [editingImageError, setEditingImageError] = React.useState<string | null>(null)
  const [editingPortFieldErrors, setEditingPortFieldErrors] = React.useState<ContainerPortFieldErrors>({})
  const [editingEnvDuplicateIds, setEditingEnvDuplicateIds] = React.useState<string[]>([])

  const configuredContainers = React.useMemo(() => {
    const visible = containers.filter((item) => item.image.trim())
    const initContainers = visible.filter((item) => item.type === "initContainer")
    const workloadContainers = visible.filter((item) => item.type !== "initContainer")
    return [...initContainers, ...workloadContainers]
  }, [containers])

  const editingContainer = React.useMemo(
    () => containers.find((item) => item.id === editingContainerId) ?? null,
    [containers, editingContainerId]
  )

  const pendingDeleteContainer = React.useMemo(
    () => containers.find((item) => item.id === pendingDeleteContainerId) ?? null,
    [containers, pendingDeleteContainerId]
  )

  const resetEditorUiState = React.useCallback(() => {
    setContainerDialogOpen(false)
    setEditingContainerId(null)
    setPendingDeleteContainerId(null)
    setEditingImageError(null)
    setEditingPortFieldErrors({})
    setEditingEnvDuplicateIds([])
  }, [])

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
      value: string | boolean | ContainerProbeMap | ContainerLifecycleMap | ContainerSecurityContextDraft
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
                      .map((container) => deps.toDnsLabelFragment(container.name))
                      .filter(Boolean)
                  )
                  const nextAutoBaseName = deps.resolveContainerNameFromImage(nextImage)
                  const nextAutoName = nextAutoBaseName
                    ? deps.ensureUniqueContainerName(nextAutoBaseName, siblingNames)
                    : ""
                  const shouldAutoSyncName =
                    currentName.length === 0 || deps.isAutoContainerNameForImage(currentName, item.image)

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
                        ? deps.normalizeProbeMap(value as ContainerProbeMap)
                        : field === "lifecycle"
                          ? deps.normalizeLifecycleMap(value as ContainerLifecycleMap)
                          : field === "securityContext"
                            ? deps.normalizeSecurityContextDraft(value as ContainerSecurityContextDraft)
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
    [deps, editingImageError, setSubmitError, submitError]
  )

  const addContainerPort = React.useCallback(
    (id: string) => {
      setContainers((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                ports: [...item.ports, deps.createContainerPortDraft(item.ports.length)],
              }
            : item
        )
      )
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [deps, setSubmitError, submitError]
  )

  const updateContainerPort = React.useCallback(
    (containerId: string, portId: string, field: "protocol" | "name" | "containerPort", value: string) => {
      setContainers((current) =>
        current.map((item) => {
          if (item.id !== containerId) return item

          return {
            ...item,
            ports: item.ports.map((port) => {
              if (port.id !== portId) return port

              if (field === "protocol") {
                const nextProtocol = value.toUpperCase()
                if (!deps.CONTAINER_PORT_PROTOCOL_SET.has(nextProtocol)) return port
                const normalizedProtocol = nextProtocol as ContainerPortProtocol
                const replacedName = deps.replaceProtocolPrefixInName(port.name, normalizedProtocol)
                return {
                  ...port,
                  protocol: normalizedProtocol,
                  name: replacedName ?? port.name,
                }
              }

              if (field === "containerPort") {
                const autoNameBefore = deps.buildAutoPortName(port.protocol, port.containerPort)
                const autoNameAfter = deps.buildAutoPortName(port.protocol, value)
                const currentName = port.name.trim()
                const hasAutoPatternName = deps.isAutoPortNameForProtocol(currentName, port.protocol)
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
    [deps, setSubmitError, submitError]
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
    [setSubmitError, submitError]
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
            env: [...item.env, deps.createContainerEnvDraft(defaults)],
          }
        })
        const target = nextContainers.find((item) => item.id === containerId)
        setEditingEnvDuplicateIds(target ? deps.resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      if (submitError) setSubmitError(null)
    },
    [deps, setSubmitError, submitError]
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
            env: item.env.map((entry) => (entry.id === envId ? { ...entry, [field]: value } : entry)),
          }
        })
        const target = nextContainers.find((item) => item.id === containerId)
        setEditingEnvDuplicateIds(target ? deps.resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      if (submitError) setSubmitError(null)
    },
    [deps, setSubmitError, submitError]
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
        setEditingEnvDuplicateIds(target ? deps.resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      if (submitError) setSubmitError(null)
    },
    [deps, setSubmitError, submitError]
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
    [setSubmitError, submitError]
  )

  const beginEditContainer = React.useCallback(
    (id: string) => {
      setContainers((current) => {
        const nextContainers = current.map((item) =>
          item.id === id && item.ports.length === 0
            ? {
                ...item,
                ports: [deps.createContainerPortDraft(0)],
              }
            : item
        )
        const target = nextContainers.find((item) => item.id === id)
        setEditingEnvDuplicateIds(target ? deps.resolveDuplicateContainerEnvNameIds(target.env) : [])
        return nextContainers
      })
      setEditingContainerId(id)
      setContainerDialogOpen(true)
      if (editingImageError) setEditingImageError(null)
      setEditingPortFieldErrors({})
      if (submitError) setSubmitError(null)
    },
    [deps, editingImageError, setSubmitError, submitError]
  )

  const addContainer = React.useCallback(() => {
    const next = deps.createContainerDraft()
    setContainers((current) => [...current, next])
    setEditingContainerId(next.id)
    setContainerDialogOpen(true)
    if (editingImageError) setEditingImageError(null)
    setEditingPortFieldErrors({})
    setEditingEnvDuplicateIds([])
    if (submitError) setSubmitError(null)
  }, [deps, editingImageError, setSubmitError, submitError])

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
    [editingImageError, setSubmitError, submitError]
  )

  const returnToPodList = React.useCallback(() => {
    if (!editingContainer) {
      setContainerDialogOpen(false)
      setEditingContainerId(null)
      return
    }

    const nextImageError = editingContainer.image.trim() ? null : "请输入镜像地址"
    const nextPortFieldErrors = nextImageError ? {} : deps.validateContainerPorts(editingContainer.ports)
    const nextEnvDuplicateIds =
      nextImageError || Object.keys(nextPortFieldErrors).length > 0
        ? []
        : deps.resolveDuplicateContainerEnvNameIds(editingContainer.env)

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
          nextEnvDuplicateIds.length > 0 ? `${editingContainer.id}-env-${nextEnvDuplicateIds[0]}-name` : null,
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
  }, [deps, editingContainer])

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

  return {
    containers,
    setContainers,
    configuredContainers,
    containerDialogOpen,
    setContainerDialogOpen,
    editingContainerId,
    setEditingContainerId,
    pendingDeleteContainer,
    pendingDeleteContainerId,
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
  }
}
