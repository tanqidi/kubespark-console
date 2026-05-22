"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"
import {
  IconAdjustmentsHorizontal,
  IconPencil,
  IconSettings2,
  IconTrash,
} from "@tabler/icons-react"
import { parse, stringify } from "yaml"

import { useTranslations } from "@/app/lib/i18n"
import { checkConfigMapExists } from "@/app/lib/kubespark/configmaps"
import { checkSecretExists } from "@/app/lib/kubespark/secrets"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  ResourceMetadataEditor,
  hasUserProvidedMetadata,
  metadataEntriesToRecord,
  metadataRecordToEntries,
  type MetadataEntry,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ProjectNamespaceField } from "@/app/(console)/dashboard/components/resource-pages/project-namespace-field"

type ResourceKind = "configmap" | "secret"

type NamespaceOption = {
  id: string
  name: string
}

type DialogTab = "basic" | "data" | "advanced"
type DataViewMode = "list" | "edit"

type KeyValueItem = {
  id: string
  key: string
  value: string
}

type DialogSnapshot = {
  name: string
  namespace: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  secretType: string
  items: KeyValueItem[]
}

export type KeyValueDialogInitialValues = {
  name: string
  namespace: string
  description?: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  type?: string
  items: Array<{ key: string; value: string }>
}

type SubmitPayload = {
  name: string
  namespace: string
  description: string
  labels?: Record<string, string>
  annotations?: Record<string, string>
  type?: string
  items: Array<{ key: string; value: string }>
}

type CreateKeyValueResourceDialogProps = {
  kind: ResourceKind
  open: boolean
  onOpenChange: (open: boolean) => void
  namespaceOptions: NamespaceOption[]
  mode?: "create" | "edit"
  initialValues?: KeyValueDialogInitialValues | null
  onSubmit: (payload: SubmitPayload) => Promise<void>
}

type JsonObject = Record<string, unknown>

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

const MONACO_OPTIONS: EditorProps["options"] = {
  automaticLayout: true,
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  stickyScroll: { enabled: false },
  tabSize: 2,
  wordWrap: "on",
}

let nextItemId = 0

function createEmptyItem(): KeyValueItem {
  nextItemId += 1
  return {
    id: `kv-item-${nextItemId}`,
    key: "",
    value: "",
  }
}

function createItem(key = "", value = ""): KeyValueItem {
  return {
    id: createEmptyItem().id,
    key,
    value,
  }
}

const SECRET_TYPE_OPTIONS = [
  { value: "Opaque", label: "Opaque" },
  { value: "kubernetes.io/basic-auth", label: "Basic Auth" },
  { value: "kubernetes.io/dockerconfigjson", label: "Docker Config JSON" },
  { value: "kubernetes.io/tls", label: "TLS" },
]

function validateDataItemKey(key: string, t: ReturnType<typeof useTranslations>): string | null {
  const trimmedKey = key.trim()
  if (!trimmedKey) {
    return t("keyValueDialog.keyRequired")
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmedKey)) {
    return t("keyValueDialog.keyInvalid")
  }
  return null
}

function validateName(value: string, t: ReturnType<typeof useTranslations>): string | null {
  const next = value.trim().toLowerCase()
  if (!next) return t("keyValueDialog.nameRequired")
  if (next.length > 253) return t("keyValueDialog.nameRule")
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(next)) {
    return t("keyValueDialog.nameRule")
  }
  return null
}

function resolveSubmitErrorMessage(error: unknown, kind: ResourceKind, t: ReturnType<typeof useTranslations>): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()
  if (text.includes("already exists") || text.includes("状态码 409")) {
    const type = kind === "secret" ? t("keyValueDialog.secret") : t("keyValueDialog.configMap")
    return t("keyValueDialog.nameExists", { type })
  }
  return raw || t("keyValueDialog.createFailed", { type: kind === "secret" ? t("keyValueDialog.secret") : t("keyValueDialog.configMap") })
}

const DESCRIPTION_MAX_LENGTH = 256

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function buildResourceManifest(kind: ResourceKind, snapshot: DialogSnapshot) {
  const metadata: JsonObject = {}
  const labels = metadataEntriesToRecord(snapshot.labels)
  const annotations = metadataEntriesToRecord(snapshot.annotations)

  if (snapshot.name.trim()) metadata.name = snapshot.name.trim()
  if (snapshot.namespace.trim()) metadata.namespace = snapshot.namespace.trim()
  if (Object.keys(labels).length > 0) metadata.labels = labels
  if (snapshot.description.trim()) annotations.description = snapshot.description.trim()
  else delete annotations.description
  if (Object.keys(annotations).length > 0) metadata.annotations = annotations

  const manifest: JsonObject = {
    apiVersion: "v1",
    kind: kind === "secret" ? "Secret" : "ConfigMap",
    metadata,
  }

  const itemMap = Object.fromEntries(
    snapshot.items
      .map((item) => ({
        key: item.key.trim(),
        value: item.value,
      }))
      .filter((item) => item.key.length > 0)
      .map((item) => [item.key, item.value])
  )

  if (kind === "secret") {
    manifest.type = snapshot.secretType.trim() || "Opaque"
    manifest.stringData = itemMap
  } else {
    manifest.data = itemMap
  }

  return manifest
}

function buildYamlText(kind: ResourceKind, snapshot: DialogSnapshot) {
  return stringify(buildResourceManifest(kind, snapshot), {
    indent: 2,
    lineWidth: 0,
    sortMapEntries: false,
  })
}

function parseYamlText(kind: ResourceKind, yamlText: string, t: ReturnType<typeof useTranslations>): DialogSnapshot {
  const normalizedText = yamlText.trim()
  if (!normalizedText) {
    throw new Error(t("keyValueDialog.yamlRequired"))
  }

  const parsed = parse(normalizedText)
  const root = asObject(parsed)
  if (Object.keys(root).length === 0) {
    throw new Error(t("keyValueDialog.yamlInvalid"))
  }

  const expectedKind = kind === "secret" ? "Secret" : "ConfigMap"
  const actualKind = asString(root.kind)
  if (actualKind && actualKind !== expectedKind) {
    throw new Error(t("keyValueDialog.yamlKindMustBe", { kind: expectedKind }))
  }

  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
  const labels = asObject(metadata.labels)
  const itemSource =
    kind === "secret"
      ? (() => {
          const stringData = asObject(root.stringData)
          if (Object.keys(stringData).length > 0) return stringData
          return asObject(root.data)
        })()
      : asObject(root.data)

  const items = Object.entries(itemSource).map(([key, value]) =>
    createItem(key, typeof value === "string" ? value : value == null ? "" : String(value))
  )

  return {
    name: asString(metadata.name),
    namespace: asString(metadata.namespace),
    description: asString(annotations.description),
    labels: metadataRecordToEntries(
      Object.fromEntries(
        Object.entries(labels).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    ),
    annotations: metadataRecordToEntries(
      Object.fromEntries(
        Object.entries(annotations).filter(([, value]) => typeof value === "string")
      ) as Record<string, string>
    ),
    secretType: kind === "secret" ? asString(root.type) || "Opaque" : "Opaque",
    items: items.length > 0 ? items : [createEmptyItem()],
  }
}

async function checkResourceExists(kind: ResourceKind, name: string, namespace: string) {
  return kind === "secret"
    ? checkSecretExists({ name, namespace })
    : checkConfigMapExists({ name, namespace })
}

export function CreateKeyValueResourceDialog({
  kind,
  open,
  onOpenChange,
  namespaceOptions,
  mode = "create",
  initialValues = null,
  onSubmit,
}: CreateKeyValueResourceDialogProps) {
  const t = useTranslations()
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [secretType, setSecretType] = React.useState("Opaque")
  const [items, setItems] = React.useState<KeyValueItem[]>(() => [createEmptyItem()])
  const [creating, setCreating] = React.useState(false)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [yamlMode, setYamlMode] = React.useState(false)
  const [yamlText, setYamlText] = React.useState("")
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [descriptionError, setDescriptionError] = React.useState<string | null>(null)
  const [itemsError, setItemsError] = React.useState<string | null>(null)
  const [editingKeyError, setEditingKeyError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<DialogTab>("basic")
  const [dataViewMode, setDataViewMode] = React.useState<DataViewMode>("list")
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null)
  const [pendingDeleteItemId, setPendingDeleteItemId] = React.useState<string | null>(null)
  const initializedEditKeyRef = React.useRef<string | null>(null)
  const createDialogPopupLayerRef = React.useRef<HTMLDivElement | null>(null)
  const isEditMode = mode === "edit"

  const isSecret = kind === "secret"
  const title = isEditMode
    ? isSecret
      ? t("keyValueDialog.editSecret")
      : t("keyValueDialog.editConfigMap")
    : isSecret
      ? t("keyValueDialog.createSecret")
      : t("keyValueDialog.createConfigMap")
  const descriptionText = isEditMode
    ? isSecret
      ? t("keyValueDialog.editSecretDesc")
      : t("keyValueDialog.editConfigMapDesc")
    : isSecret
      ? t("keyValueDialog.createSecretDesc")
      : t("keyValueDialog.createConfigMapDesc")
  const valueLabel = t("keyValueDialog.value")
  const filledItems = React.useMemo(
    () => items.filter((item) => item.key.trim() || item.value.trim()),
    [items]
  )

  const clearInlineErrors = React.useCallback(() => {
    setNameError(null)
    setNamespaceError(null)
    setDescriptionError(null)
    setItemsError(null)
    setEditingKeyError(null)
    setSubmitError(null)
    setYamlError(null)
  }, [])

  const getSnapshot = React.useCallback(
    (): DialogSnapshot => ({
      name,
      namespace,
      description,
      labels: labelEntries,
      annotations: annotationEntries,
      secretType,
      items,
    }),
    [annotationEntries, description, items, labelEntries, name, namespace, secretType]
  )

  const applySnapshot = React.useCallback((snapshot: DialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
    setLabelEntries(snapshot.labels)
    setAnnotationEntries(snapshot.annotations)
    setMetadataEnabled(false)
    setSecretType(snapshot.secretType || "Opaque")
    setItems(snapshot.items.length > 0 ? snapshot.items : [createEmptyItem()])
    setDataViewMode("list")
    setEditingItemId(null)
  }, [])

  const lockedIdentity = React.useMemo(
    () =>
      isEditMode && initialValues
        ? {
            name: initialValues.name.trim().toLowerCase(),
            namespace: initialValues.namespace.trim(),
            secretType: initialValues.type?.trim() || "Opaque",
          }
        : null,
    [initialValues, isEditMode]
  )

  const withLockedIdentity = React.useCallback(
    (snapshot: DialogSnapshot): DialogSnapshot => {
      if (!lockedIdentity) return snapshot
      return {
        ...snapshot,
        name: lockedIdentity.name,
        namespace: lockedIdentity.namespace,
        secretType: lockedIdentity.secretType,
      }
    },
    [lockedIdentity]
  )

  React.useEffect(() => {
    if (!open) {
      setName("")
      setNamespace("")
      setDescription("")
      setMetadataEnabled(false)
      setLabelEntries([{ key: "", value: "" }])
      setAnnotationEntries([{ key: "", value: "" }])
      setSecretType("Opaque")
      setItems([createEmptyItem()])
      setCreating(false)
      setCheckingNext(false)
      setYamlMode(false)
      setYamlText("")
      setYamlError(null)
      setNameError(null)
      setNamespaceError(null)
      setDescriptionError(null)
      setItemsError(null)
      setEditingKeyError(null)
      setSubmitError(null)
      setActiveTab("basic")
      setDataViewMode("list")
      setEditingItemId(null)
      setPendingDeleteItemId(null)
      initializedEditKeyRef.current = null
      return
    }
  }, [open])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return

    const currentEditKey = `${initialValues.namespace.trim()}::${initialValues.name.trim().toLowerCase()}`
    const firstOpen = initializedEditKeyRef.current === null
    const switchedTarget = initializedEditKeyRef.current !== currentEditKey
    if (!firstOpen && !switchedTarget) return

    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
    const nextLabelEntries = metadataRecordToEntries(initialValues.labels ?? {})
    const nextAnnotationEntries = metadataRecordToEntries(initialValues.annotations ?? {})
    setLabelEntries(nextLabelEntries)
    setAnnotationEntries(nextAnnotationEntries)
    setMetadataEnabled(false)
    setSecretType(initialValues.type?.trim() || "Opaque")
    setItems(
      initialValues.items.length > 0
        ? initialValues.items.map((item) => createItem(item.key, item.value))
        : [createEmptyItem()]
    )
    setActiveTab("basic")
    setDataViewMode("list")
    setEditingItemId(null)
    setPendingDeleteItemId(null)
    setYamlMode(false)
    setYamlText("")
    clearInlineErrors()
    initializedEditKeyRef.current = currentEditKey
  }, [clearInlineErrors, initialValues, isEditMode, open])

  const editingItem = React.useMemo(
    () => items.find((item) => item.id === editingItemId) ?? null,
    [editingItemId, items]
  )

  const updateItem = React.useCallback(
    (id: string, field: "key" | "value", value: string) => {
      setItems((current) => {
        let changed = false
        const next = current.map((item) => {
          if (item.id !== id) return item
          if (item[field] === value) return item
          changed = true
          return {
            ...item,
            [field]: value,
          }
        })
        return changed ? next : current
      })
      if (itemsError) setItemsError(null)
      if (editingKeyError) setEditingKeyError(null)
      if (submitError) setSubmitError(null)
      if (yamlError) setYamlError(null)
    },
    [editingKeyError, itemsError, submitError, yamlError]
  )

  const addItem = React.useCallback(() => {
    const nextItem = createEmptyItem()
    setItems((current) => [...current, nextItem])
    setEditingItemId(nextItem.id)
    setDataViewMode("edit")
    if (itemsError) setItemsError(null)
    if (editingKeyError) setEditingKeyError(null)
    if (submitError) setSubmitError(null)
    if (yamlError) setYamlError(null)
  }, [editingKeyError, itemsError, submitError, yamlError])

  const removeItem = React.useCallback(
    (id: string) => {
      setItems((current) => {
        const next = current.filter((item) => item.id !== id)
        if (next.length > 0) return next
        const emptyItem = createEmptyItem()
        return [emptyItem]
      })
      setEditingItemId((current) => (current === id ? null : current))
      setDataViewMode("list")
      if (itemsError) setItemsError(null)
      if (editingKeyError) setEditingKeyError(null)
      if (submitError) setSubmitError(null)
      if (yamlError) setYamlError(null)
    },
    [editingKeyError, itemsError, submitError, yamlError]
  )

  const beginEditItem = React.useCallback((id: string) => {
    setEditingItemId(id)
    setDataViewMode("edit")
    if (itemsError) setItemsError(null)
    if (editingKeyError) setEditingKeyError(null)
    if (submitError) setSubmitError(null)
    if (yamlError) setYamlError(null)
  }, [editingKeyError, itemsError, submitError, yamlError])

  const pendingDeleteItem = React.useMemo(
    () => items.find((item) => item.id === pendingDeleteItemId) ?? null,
    [items, pendingDeleteItemId]
  )

  const requestDeleteItem = React.useCallback((id: string) => {
    setPendingDeleteItemId(id)
  }, [])

  const handleConfirmDeleteItem = React.useCallback(() => {
    if (!pendingDeleteItemId) return
    removeItem(pendingDeleteItemId)
    setPendingDeleteItemId(null)
  }, [pendingDeleteItemId, removeItem])

  const returnToList = React.useCallback(() => {
    if (!editingItem) {
      setDataViewMode("list")
      setEditingItemId(null)
      return
    }

    const nextKey = editingItem.key.trim()
    const keyError = validateDataItemKey(editingItem.key, t)
    if (keyError) {
      setEditingKeyError(keyError)
      return
    }

    const duplicateExists = items.some(
      (item) => item.id !== editingItem.id && item.key.trim() === nextKey
    )

    if (duplicateExists) {
      setEditingKeyError(t("keyValueDialog.keyDuplicate", { key: nextKey }))
      return
    }

    setEditingKeyError(null)
    setItemsError(null)
    setDataViewMode("list")
    setEditingItemId(null)
  }, [editingItem, items, t])

  const cancelEditItem = React.useCallback(() => {
    setEditingKeyError(null)
    setItemsError(null)
    setSubmitError(null)
    setDataViewMode("list")
    setEditingItemId(null)
  }, [])

  const goToBasicStep = React.useCallback(() => {
    setActiveTab("basic")
    setSubmitError(null)
  }, [])

  const goToDataStep = React.useCallback(() => {
    setActiveTab("data")
    setSubmitError(null)
  }, [])

  const validateDataItems = React.useCallback((draftItems: KeyValueItem[], t: ReturnType<typeof useTranslations>) => {
    const cleanedItems = draftItems
      .map((item) => ({
        key: item.key.trim(),
        value: item.value,
      }))
      .filter((item) => item.key.length > 0 || item.value.length > 0)

    let resolvedItemsError: string | null = null
    const seen = new Set<string>()

    if (cleanedItems.length === 0) {
      resolvedItemsError = t("keyValueDialog.itemsRequired")
    }

    cleanedItems.forEach((item, index) => {
      if (resolvedItemsError) return
      if (!item.key) {
        resolvedItemsError = t("keyValueDialog.itemMissingKey", { index: String(index + 1) })
        return
      }
      if (!/^[A-Za-z0-9._-]+$/.test(item.key)) {
        resolvedItemsError = t("keyValueDialog.itemKeyInvalid", { key: item.key })
        return
      }
      if (seen.has(item.key)) {
        resolvedItemsError = t("keyValueDialog.itemKeyDuplicate", { key: item.key })
        return
      }
      seen.add(item.key)
    })

    return { cleanedItems, resolvedItemsError }
  }, [])

  const goToAdvancedStep = React.useCallback(() => {
    if (creating || checkingNext) return
    const { resolvedItemsError } = validateDataItems(items, t)
    setItemsError(resolvedItemsError)
    if (resolvedItemsError) {
      setActiveTab("data")
      setDataViewMode("list")
      return
    }
    setActiveTab("advanced")
    setDataViewMode("list")
    setSubmitError(null)
  }, [checkingNext, creating, items, t, validateDataItems])

  const handleYamlModeChange = React.useCallback(
    (checked: boolean) => {
      if (creating || checkingNext) return

      if (checked) {
        setYamlText(buildYamlText(kind, getSnapshot()))
        setYamlError(null)
        setYamlMode(true)
        return
      }

      try {
        const snapshot = withLockedIdentity(parseYamlText(kind, yamlText, t))
        applySnapshot(snapshot)
        clearInlineErrors()
        setYamlMode(false)
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : t("keyValueDialog.yamlParseFailed"))
      }
    },
    [
      applySnapshot,
      checkingNext,
      clearInlineErrors,
      creating,
      getSnapshot,
      kind,
      t,
      withLockedIdentity,
      yamlText,
    ]
  )

  const enterYamlMode = React.useCallback(() => {
    handleYamlModeChange(true)
  }, [handleYamlModeChange])

  const cancelYamlMode = React.useCallback(() => {
    setYamlError(null)
    setYamlMode(false)
  }, [])

  const confirmYamlMode = React.useCallback(() => {
    try {
      const snapshot = withLockedIdentity(parseYamlText(kind, yamlText, t))
      applySnapshot(snapshot)
      clearInlineErrors()
      setYamlError(null)
      setYamlMode(false)
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : t("keyValueDialog.yamlParseFailed"))
    }
  }, [applySnapshot, clearInlineErrors, kind, t, withLockedIdentity, yamlText])

  const handleNextStep = React.useCallback(async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (creating || checkingNext) return

    const nextName = name.trim().toLowerCase()
    const nextNamespace = namespace.trim()
    const resolvedNameError = validateName(nextName, t)
    const resolvedNamespaceError = nextNamespace ? null : t("keyValueDialog.namespaceRequired")

    setNameError(resolvedNameError)
    setNamespaceError(resolvedNamespaceError)

    if (resolvedNameError || resolvedNamespaceError) {
      setActiveTab("basic")
      return
    }

    if (isEditMode) {
      setActiveTab("data")
      setDataViewMode("list")
      return
    }

    setSubmitError(null)
    setCheckingNext(true)

    try {
      const exists = await checkResourceExists(kind, nextName, nextNamespace)

      if (exists) {
        setNameError(t("keyValueDialog.nameExists", { type: isSecret ? t("keyValueDialog.secret") : t("keyValueDialog.configMap") }))
        setActiveTab("basic")
        return
      }

      setActiveTab("data")
      setDataViewMode("list")
    } catch (error) {
      setNameError(error instanceof Error ? error.message : t("keyValueDialog.nameValidationFailed"))
      setActiveTab("basic")
    } finally {
      setCheckingNext(false)
    }
  }, [checkingNext, creating, isEditMode, isSecret, kind, name, namespace, t])

  const handleSubmit = React.useCallback(
    async () => {
      if (creating || checkingNext) return
      if (!yamlMode && activeTab !== "advanced") return

      let draft = getSnapshot()

      if (yamlMode) {
        try {
          draft = withLockedIdentity(parseYamlText(kind, yamlText, t))
          applySnapshot(draft)
          setYamlError(null)
        } catch (error) {
          setYamlError(error instanceof Error ? error.message : t("keyValueDialog.yamlParseFailed"))
          return
        }
      }

      const nextName = draft.name.trim().toLowerCase()
      const nextNamespace = draft.namespace.trim()
      const nextDescription = draft.description.trim()

      const resolvedNameError = validateName(nextName, t)
      const resolvedNamespaceError = nextNamespace ? null : t("keyValueDialog.namespaceRequired")
      const resolvedDescriptionError =
        nextDescription.length <= DESCRIPTION_MAX_LENGTH ? null : t("keyValueDialog.descriptionTooLong", { maxLength: String(DESCRIPTION_MAX_LENGTH) })

      const { cleanedItems, resolvedItemsError } = validateDataItems(draft.items, t)

      setNameError(resolvedNameError)
      setNamespaceError(resolvedNamespaceError)
      setDescriptionError(resolvedDescriptionError)
      setItemsError(resolvedItemsError)
      setSubmitError(null)

      if (yamlMode) {
        if (resolvedNameError || resolvedNamespaceError || resolvedDescriptionError || resolvedItemsError) {
          setYamlError(
            resolvedNameError ?? resolvedNamespaceError ?? resolvedDescriptionError ?? resolvedItemsError
          )
          return
        }
      } else {
        if (resolvedNameError || resolvedNamespaceError || resolvedDescriptionError) {
          setActiveTab("basic")
          return
        }

        if (resolvedItemsError) {
          setActiveTab("data")
          setDataViewMode("list")
          return
        }
      }

      if (yamlMode && !isEditMode) {
        setCheckingNext(true)
        try {
          const exists = await checkResourceExists(kind, nextName, nextNamespace)
          if (exists) {
            const message = t("keyValueDialog.nameExists", { type: isSecret ? t("keyValueDialog.secret") : t("keyValueDialog.configMap") })
            setNameError(message)
            setYamlError(message)
            return
          }
        } catch (error) {
          setYamlError(error instanceof Error ? error.message : t("keyValueDialog.nameValidationFailed"))
          return
        } finally {
          setCheckingNext(false)
        }
      }

      setCreating(true)

      try {
        await onSubmit({
          name: nextName,
          namespace: nextNamespace,
          description: nextDescription,
          labels: metadataEntriesToRecord(draft.labels),
          annotations: metadataEntriesToRecord(draft.annotations),
          ...(isSecret ? { type: draft.secretType.trim() || "Opaque" } : {}),
          items: cleanedItems,
        })
        onOpenChange(false)
      } catch (error) {
        const message = resolveSubmitErrorMessage(error, kind, t)
        const normalized = message.toLowerCase()

        if (yamlMode) {
          setYamlError(message)
        } else if (
          normalized.includes("已存在") ||
          normalized.includes("already exists") ||
          normalized.includes("metadata.name")
        ) {
          setNameError(message)
          setActiveTab("basic")
        } else if (normalized.includes("namespace") || normalized.includes("项目")) {
          setNamespaceError(message)
          setActiveTab("basic")
        } else {
          setSubmitError(message)
          setActiveTab("data")
          setDataViewMode("list")
        }
      } finally {
        setCreating(false)
      }
    },
    [
      applySnapshot,
      checkingNext,
      creating,
      getSnapshot,
      isEditMode,
      isSecret,
      kind,
      activeTab,
      onOpenChange,
      onSubmit,
      t,
      withLockedIdentity,
      yamlMode,
      yamlText,
      validateDataItems,
    ]
  )

  const isBusy = creating || checkingNext
  const canNavigateStep = !isBusy && dataViewMode !== "edit"
  const isEditingDataView = !yamlMode && activeTab === "data" && dataViewMode === "edit"

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
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{descriptionText}</DialogDescription>
            </DialogHeader>
            <div className="h-full flex items-center me-20">
              <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                <span className="text-sm font-medium">{t("keyValueDialog.yamlMode")}</span>
                <Switch
                  id={`${kind}-yaml-mode`}
                  checked={yamlMode}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      enterYamlMode()
                      return
                    }
                    cancelYamlMode()
                  }}
                  disabled={isBusy}
                  aria-label={t("keyValueDialog.yamlMode")}
                />
              </div>
            </div>
          </div>

          {!yamlMode ? (
            <StepHeaderNav
              items={[
                {
                  id: "basic",
                  title: t("keyValueDialog.basicInfo"),
                  status: activeTab === "basic" ? t("keyValueDialog.current") : t("keyValueDialog.configured"),
                  active: activeTab === "basic",
                  icon: <IconSettings2 className="size-4" />,
                  disabled: !canNavigateStep,
                  onClick: goToBasicStep,
                },
                {
                  id: "data",
                  title: t("keyValueDialog.dataItems"),
                  status:
                    activeTab === "data"
                      ? t("keyValueDialog.current")
                      : filledItems.length > 0
                        ? t("keyValueDialog.configured")
                        : t("keyValueDialog.notConfigured"),
                  active: activeTab === "data",
                  icon: <IconAdjustmentsHorizontal className="size-4" />,
                  disabled: !canNavigateStep,
                  onClick: () => {
                    if (!canNavigateStep) return
                    if (activeTab === "data") {
                      setSubmitError(null)
                      return
                    }
                    if (activeTab === "basic") {
                      void handleNextStep()
                      return
                    }
                    goToDataStep()
                  },
                },
                {
                  id: "advanced",
                  title: t("keyValueDialog.advancedSettings"),
                  status:
                    activeTab === "advanced"
                      ? t("keyValueDialog.current")
                      : hasUserProvidedMetadata(labelEntries, annotationEntries)
                        ? t("keyValueDialog.configured")
                        : t("keyValueDialog.notConfigured"),
                  active: activeTab === "advanced",
                  icon: <IconAdjustmentsHorizontal className="size-4" />,
                  disabled: !canNavigateStep,
                  onClick: () => {
                    if (!canNavigateStep) return
                    if (activeTab === "basic") {
                      void handleNextStep()
                      return
                    }
                    if (activeTab === "data") {
                      goToAdvancedStep()
                      return
                    }
                    setActiveTab("advanced")
                    setDataViewMode("list")
                    setSubmitError(null)
                  },
                },
              ]}
            />
          ) : null}

          <div
            className={
              yamlMode
                ? "min-h-0 flex-1 px-6 py-6"
                : isEditingDataView
                  ? "min-h-0 flex-1 px-6 py-6"
                  : "min-h-0 flex-1 overflow-y-auto px-6 py-6"
            }
          >
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
                    loading={
                      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        YAML 编辑器加载中...
                      </div>
                    }
                  />
                </div>

                {yamlError ? <FieldError className="mt-3">{yamlError}</FieldError> : null}
              </div>
            ) : activeTab === "basic" ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">{t("keyValueDialog.basicInfo")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("keyValueDialog.basicInfoDesc")}
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field data-invalid={Boolean(nameError)}>
                    <FieldLabel htmlFor={`${kind}-create-name`}>{t("keyValueDialog.name")}</FieldLabel>
                    <Input
                      id={`${kind}-create-name`}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameError) setNameError(null)
                        if (submitError) setSubmitError(null)
                        if (yamlError) setYamlError(null)
                      }}
                      placeholder={isSecret ? t("keyValueDialog.namePlaceholder") : t("keyValueDialog.namePlaceholder")}
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={creating || isEditMode}
                    />
                    {nameError ? (
                      <FieldError>{nameError}</FieldError>
                    ) : (
                      <FieldDescription>{t("keyValueDialog.nameRule")}</FieldDescription>
                    )}
                  </Field>

                  <ProjectNamespaceField
                    id={`${kind}-create-namespace`}
                    options={namespaceOptions}
                    value={namespace}
                    onValueChange={(value) => {
                      setNamespace(value)
                      if (namespaceError) setNamespaceError(null)
                      if (submitError) setSubmitError(null)
                      if (yamlError) setYamlError(null)
                    }}
                    error={namespaceError}
                    description={t("keyValueDialog.namespaceSelect")}
                    disabled={creating || isEditMode}
                    contentContainer={createDialogPopupLayerRef}
                  />

                  {isSecret ? (
                    <Field>
                      <FieldLabel htmlFor="secret-create-type">{t("keyValueDialog.type")}</FieldLabel>
                      <Select
                        value={secretType}
                        onValueChange={(value) => {
                          setSecretType(value)
                          if (yamlError) setYamlError(null)
                        }}
                        disabled={creating || isEditMode}
                      >
                        <SelectTrigger id="secret-create-type">
                          <SelectValue placeholder={t("keyValueDialog.selectSecretType")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {SECRET_TYPE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>{t("keyValueDialog.typeDefault")}</FieldDescription>
                    </Field>
                  ) : null}

                  <Field className={isSecret ? "" : "md:col-span-2"}>
                    <FieldLabel htmlFor={`${kind}-create-description`}>
                      {t("keyValueDialog.description")}
                    </FieldLabel>
                    <Textarea
                      id={`${kind}-create-description`}
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value)
                        if (descriptionError) setDescriptionError(null)
                        if (yamlError) setYamlError(null)
                      }}
                      placeholder={t("keyValueDialog.descriptionPlaceholder")}
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      className="min-h-24"
                      disabled={creating}
                    />
                    {descriptionError ? (
                      <FieldError>{descriptionError}</FieldError>
                    ) : (
                      <FieldDescription>
                        {t("keyValueDialog.descriptionHint")}
                      </FieldDescription>
                    )}
                  </Field>
                </FieldGroup>
              </div>
            ) : activeTab === "data" ? (
              <div className={isEditingDataView ? "flex h-full min-h-0 flex-col" : ""}>
                {dataViewMode === "list" ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-[15px] font-semibold">{t("keyValueDialog.dataItems")}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t("keyValueDialog.dataItemsDesc")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
                      <div className="flex flex-col gap-0 pb-4">
                        {filledItems.length > 0 ? (
                          <ItemGroup className="gap-3">
                            {filledItems.map((item) => (
                              <Item key={item.id} variant="outline" size="sm" className="hover:bg-muted">
                                <ItemContent className="min-w-0">
                                  <ItemTitle className="min-w-0 truncate">
                                    {item.key.trim() || t("keyValueDialog.unnamedItem")}
                                  </ItemTitle>
                                  <ItemDescription className="min-w-0 truncate">
                                    {item.value.trim() || "-"}
                                  </ItemDescription>
                                </ItemContent>

                                <ItemActions className="pointer-events-none gap-1 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => beginEditItem(item.id)}
                                    disabled={creating}
                                  >
                                    <IconPencil data-icon="inline-start" />
                                    {t("actions.edit")}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => requestDeleteItem(item.id)}
                                    disabled={creating}
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    {t("actions.delete")}
                                  </Button>
                                </ItemActions>
                              </Item>
                            ))}
                          </ItemGroup>
                        ) : (
                          <div
                            className={`rounded-lg border border-dashed px-4 py-10 text-center ${itemsError === t("keyValueDialog.itemsRequired") ? "border-destructive" : ""}`}
                          >
                            <div className={`text-sm font-semibold ${itemsError === t("keyValueDialog.itemsRequired") ? "text-destructive" : ""}`}>
                              {t("keyValueDialog.dataItems")}
                            </div>
                            <div
                              className={`mt-1 text-sm ${itemsError === t("keyValueDialog.itemsRequired") ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              {t("keyValueDialog.dataItemsDesc")}
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="mt-3 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={addItem}
                          disabled={creating}
                        >
                          <span className="text-sm font-semibold">{t("keyValueDialog.addItem")}</span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            {t("keyValueDialog.addItemDesc")}
                          </span>
                        </button>

                        {itemsError && itemsError !== t("keyValueDialog.itemsRequired") ? (
                          <FieldError className="mt-4">{itemsError}</FieldError>
                        ) : null}
                        {submitError ? <FieldError className="mt-4">{submitError}</FieldError> : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {editingItem ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex min-h-0 flex-1 flex-col gap-5 pb-4">
                          <FieldGroup className="flex min-h-0 flex-1 flex-col gap-5">
                            <Field data-invalid={Boolean(editingKeyError)}>
                              <FieldLabel htmlFor={`${editingItem.id}-key`}>{t("keyValueDialog.key")}</FieldLabel>
                              <Input
                                id={`${editingItem.id}-key`}
                                value={editingItem.key}
                                onChange={(event) =>
                                  updateItem(editingItem.id, "key", event.target.value)
                                }
                                placeholder={t("keyValueDialog.keyPlaceholder")}
                                aria-invalid={Boolean(editingKeyError)}
                                disabled={creating}
                              />
                            </Field>

                            <Field className="min-h-0 flex-1">
                              <FieldLabel htmlFor={`${editingItem.id}-value`}>
                                {valueLabel}
                              </FieldLabel>
                              <div className="min-h-40 flex-1 overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner">
                                <MonacoEditor
                                  language={isSecret ? "plaintext" : "yaml"}
                                  theme="vs-dark"
                                  value={editingItem.value}
                                  onChange={(value) => {
                                    updateItem(editingItem.id, "value", value ?? "")
                                  }}
                                  options={MONACO_OPTIONS}
                                  height="100%"
                                  loading={
                                    <div className="flex h-full items-center justify-center text-sm text-slate-300">
                                      {t("keyValueDialog.editorLoading")}
                                    </div>
                                  }
                                />
                              </div>
                            </Field>
                          </FieldGroup>
                          {submitError ? <FieldError>{submitError}</FieldError> : null}
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">{t("keyValueDialog.advancedSettings")}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("keyValueDialog.advancedSettingsDesc")}
                  </p>
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
                      titleText={t("keyValueDialog.metadataTitle")}
                    />
                  </Field>
                </FieldGroup>
                {submitError ? <FieldError className="mt-4">{submitError}</FieldError> : null}
              </div>
            )}
          </div>

          {isEditingDataView ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelEditItem} disabled={isBusy}>
                  {t("keyValueDialog.cancel")}
                </Button>
                <Button type="button" onClick={returnToList} disabled={isBusy}>
                  {t("keyValueDialog.confirmSave")}
                </Button>
              </div>
            </DialogFooter>
          ) : yamlMode ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={cancelYamlMode} disabled={isBusy}>
                  {t("keyValueDialog.cancel")}
                </Button>
                <Button type="button" onClick={confirmYamlMode} disabled={isBusy}>
                  {t("keyValueDialog.confirmSave")}
                </Button>
              </div>
            </DialogFooter>
          ) : activeTab === "basic" ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    {t("keyValueDialog.cancel")}
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={(event) => handleNextStep(event)}
                  disabled={isBusy}
                >
                  {checkingNext ? t("keyValueDialog.checking") : t("keyValueDialog.nextStep")}
                </Button>
              </div>
            </DialogFooter>
          ) : activeTab === "data" ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToBasicStep}
                  disabled={isBusy}
                >
                  {t("keyValueDialog.previousStep")}
                </Button>
                <Button
                  type="button"
                  onClick={goToAdvancedStep}
                  disabled={isBusy}
                >
                  {t("keyValueDialog.nextStep")}
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToDataStep}
                  disabled={isBusy}
                >
                  {t("keyValueDialog.previousStep")}
                </Button>
                <Button type="button" onClick={() => void handleSubmit()} disabled={isBusy}>
                  {creating ? (isEditMode ? t("keyValueDialog.saving") : t("keyValueDialog.creating")) : isEditMode ? t("keyValueDialog.save") : t("keyValueDialog.create")}
                </Button>
              </div>
            </DialogFooter>
          )}
        </div>

        <DeleteConfirmDialog
          open={Boolean(pendingDeleteItem)}
          title={t("keyValueDialog.deleteItem")}
          description={
            pendingDeleteItem?.key.trim()
              ? t("keyValueDialog.confirmDeleteItem", { key: pendingDeleteItem.key.trim() })
              : t("keyValueDialog.confirmDeleteUnnamedItem")
          }
          deleting={false}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setPendingDeleteItemId(null)
          }}
          onConfirm={handleConfirmDeleteItem}
        />
      </DialogContent>
    </Dialog>
  )
}

