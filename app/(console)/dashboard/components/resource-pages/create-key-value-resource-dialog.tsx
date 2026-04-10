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
import { Separator } from "@/components/ui/separator"
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

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"
const DATA_ITEM_REQUIRED_MESSAGE = "请至少添加一个数据项"
const DESCRIPTION_MAX_LENGTH = 256

function validateName(value: string): string | null {
  if (!value) return "请输入名称"
  if (value.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(value)) {
    return NAME_RULE_MESSAGE
  }
  return null
}

function validateDataItemKey(value: string): string | null {
  const nextKey = value.trim()
  if (!nextKey) return "请输入数据项键名"
  if (!/^[A-Za-z0-9._-]+$/.test(nextKey)) {
    return "数据项键名格式无效，仅支持字母、数字、点、短横线和下划线"
  }
  return null
}

function resolveSubmitErrorMessage(error: unknown, kind: ResourceKind): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()

  if (text.includes("already exists") || text.includes("状态码 409")) {
    return kind === "configmap"
      ? "配置字典名称已存在，请更换后重试"
      : "保密字典名称已存在，请更换后重试"
  }

  if (raw) return raw
  return kind === "configmap" ? "创建配置字典失败" : "创建保密字典失败"
}

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

function parseYamlText(kind: ResourceKind, yamlText: string): DialogSnapshot {
  const normalizedText = yamlText.trim()
  if (!normalizedText) {
    throw new Error("请输入 YAML 内容")
  }

  const parsed = parse(normalizedText)
  const root = asObject(parsed)
  if (Object.keys(root).length === 0) {
    throw new Error("YAML 内容格式无效")
  }

  const expectedKind = kind === "secret" ? "Secret" : "ConfigMap"
  const actualKind = asString(root.kind)
  if (actualKind && actualKind !== expectedKind) {
    throw new Error(`YAML 资源类型必须是 ${expectedKind}`)
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
      ? "编辑保密字典"
      : "编辑配置字典"
    : isSecret
      ? "创建保密字典"
      : "创建配置字典"
  const descriptionText = isEditMode
    ? isSecret
      ? "编辑 Kubernetes Secret 的描述与数据项内容。"
      : "编辑 Kubernetes ConfigMap 的描述与数据项内容。"
    : isSecret
      ? "使用 Kubernetes Secret 创建保密数据，数据项将通过 stringData 写入。"
      : "使用 Kubernetes ConfigMap 创建配置数据，数据项将以键值对形式写入。"
  // const valueLabel = isSecret ? "密文内容" : "值"
  const valueLabel = "值"
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
    setMetadataEnabled(hasUserProvidedMetadata(snapshot.labels, snapshot.annotations))
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
    setMetadataEnabled(hasUserProvidedMetadata(nextLabelEntries, nextAnnotationEntries))
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
    const keyError = validateDataItemKey(editingItem.key)
    if (keyError) {
      setEditingKeyError(keyError)
      return
    }

    const duplicateExists = items.some(
      (item) => item.id !== editingItem.id && item.key.trim() === nextKey
    )

    if (duplicateExists) {
      setEditingKeyError(`数据项键名 ${nextKey} 已存在，请更换后重试`)
      return
    }

    setEditingKeyError(null)
    setItemsError(null)
    setDataViewMode("list")
    setEditingItemId(null)
  }, [editingItem, items])

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

  const validateDataItems = React.useCallback((draftItems: KeyValueItem[]) => {
    const cleanedItems = draftItems
      .map((item) => ({
        key: item.key.trim(),
        value: item.value,
      }))
      .filter((item) => item.key.length > 0 || item.value.length > 0)

    let resolvedItemsError: string | null = null
    const seen = new Set<string>()

    if (cleanedItems.length === 0) {
      resolvedItemsError = DATA_ITEM_REQUIRED_MESSAGE
    }

    cleanedItems.forEach((item, index) => {
      if (resolvedItemsError) return
      if (!item.key) {
        resolvedItemsError = `第 ${index + 1} 个数据项缺少键名`
        return
      }
      if (!/^[A-Za-z0-9._-]+$/.test(item.key)) {
        resolvedItemsError = `数据项键名 ${item.key} 格式无效`
        return
      }
      if (seen.has(item.key)) {
        resolvedItemsError = `数据项键名 ${item.key} 重复`
        return
      }
      seen.add(item.key)
    })

    return { cleanedItems, resolvedItemsError }
  }, [])

  const goToAdvancedStep = React.useCallback(() => {
    if (creating || checkingNext) return
    const { resolvedItemsError } = validateDataItems(items)
    setItemsError(resolvedItemsError)
    if (resolvedItemsError) {
      setActiveTab("data")
      setDataViewMode("list")
      return
    }
    setActiveTab("advanced")
    setDataViewMode("list")
    setSubmitError(null)
  }, [checkingNext, creating, items, validateDataItems])

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
        const snapshot = withLockedIdentity(parseYamlText(kind, yamlText))
        applySnapshot(snapshot)
        clearInlineErrors()
        setYamlMode(false)
      } catch (error) {
        setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
      }
    },
    [
      applySnapshot,
      checkingNext,
      clearInlineErrors,
      creating,
      getSnapshot,
      kind,
      withLockedIdentity,
      yamlText,
    ]
  )

  const handleNextStep = React.useCallback(async (event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    if (creating || checkingNext) return

    const nextName = name.trim().toLowerCase()
    const nextNamespace = namespace.trim()
    const resolvedNameError = validateName(nextName)
    const resolvedNamespaceError = nextNamespace ? null : "请选择项目"

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
        setNameError(isSecret ? "保密字典名称已存在，请更换后重试" : "配置字典名称已存在，请更换后重试")
        setActiveTab("basic")
        return
      }

      setActiveTab("data")
      setDataViewMode("list")
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "名称校验失败，请稍后重试")
      setActiveTab("basic")
    } finally {
      setCheckingNext(false)
    }
  }, [checkingNext, creating, isEditMode, isSecret, kind, name, namespace])

  const handleSubmit = React.useCallback(
    async () => {
      if (creating || checkingNext) return
      if (!yamlMode && activeTab !== "advanced") return

      let draft = getSnapshot()

      if (yamlMode) {
        try {
          draft = withLockedIdentity(parseYamlText(kind, yamlText))
          applySnapshot(draft)
          setYamlError(null)
        } catch (error) {
          setYamlError(error instanceof Error ? error.message : "YAML 解析失败")
          return
        }
      }

      const nextName = draft.name.trim().toLowerCase()
      const nextNamespace = draft.namespace.trim()
      const nextDescription = draft.description.trim()

      const resolvedNameError = validateName(nextName)
      const resolvedNamespaceError = nextNamespace ? null : "请选择项目"
      const resolvedDescriptionError =
        nextDescription.length <= DESCRIPTION_MAX_LENGTH ? null : `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 个字符`

      const { cleanedItems, resolvedItemsError } = validateDataItems(draft.items)

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
            const message = isSecret ? "保密字典名称已存在，请更换后重试" : "配置字典名称已存在，请更换后重试"
            setNameError(message)
            setYamlError(message)
            return
          }
        } catch (error) {
          setYamlError(error instanceof Error ? error.message : "名称校验失败，请稍后重试")
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
        const message = resolveSubmitErrorMessage(error, kind)
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
                <span className="text-sm font-medium">编辑 YAML</span>
                <Switch
                  id={`${kind}-yaml-mode`}
                  checked={yamlMode}
                  onCheckedChange={handleYamlModeChange}
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
                  status: activeTab === "basic" ? "当前" : "已设置",
                  active: activeTab === "basic",
                  icon: <IconSettings2 className="size-4" />,
                  disabled: !canNavigateStep,
                  onClick: goToBasicStep,
                },
                {
                  id: "data",
                  title: "数据设置",
                  status:
                    activeTab === "data"
                      ? "当前"
                      : filledItems.length > 0
                        ? "已设置"
                        : "未设置",
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
                  title: "高级设置",
                  status:
                    activeTab === "advanced"
                      ? "当前"
                      : hasUserProvidedMetadata(labelEntries, annotationEntries)
                        ? "已设置"
                        : "未设置",
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
                  <h3 className="text-[15px] font-semibold">基本信息</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    填写资源名称、所属项目以及描述信息。
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field data-invalid={Boolean(nameError)}>
                    <FieldLabel htmlFor={`${kind}-create-name`}>名称</FieldLabel>
                    <Input
                      id={`${kind}-create-name`}
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameError) setNameError(null)
                        if (submitError) setSubmitError(null)
                        if (yamlError) setYamlError(null)
                      }}
                      placeholder={isSecret ? "请输入保密字典名称" : "请输入配置字典名称"}
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={creating || isEditMode}
                    />
                    {nameError ? (
                      <FieldError>{nameError}</FieldError>
                    ) : (
                      <FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>
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
                    description="选择资源所属项目。"
                    disabled={creating || isEditMode}
                    contentContainer={createDialogPopupLayerRef}
                  />

                  {isSecret ? (
                    <Field>
                      <FieldLabel htmlFor="secret-create-type">类型</FieldLabel>
                      <Select
                        value={secretType}
                        onValueChange={(value) => {
                          setSecretType(value)
                          if (yamlError) setYamlError(null)
                        }}
                        disabled={creating || isEditMode}
                      >
                        <SelectTrigger id="secret-create-type">
                          <SelectValue placeholder="请选择 Secret 类型" />
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
                      <FieldDescription>默认使用 Opaque 类型。</FieldDescription>
                    </Field>
                  ) : null}

                  <Field className={isSecret ? "" : "md:col-span-2"}>
                    <FieldLabel htmlFor={`${kind}-create-description`}>
                      描述
                    </FieldLabel>
                    <Textarea
                      id={`${kind}-create-description`}
                      value={description}
                      onChange={(event) => {
                        setDescription(event.target.value)
                        if (descriptionError) setDescriptionError(null)
                        if (yamlError) setYamlError(null)
                      }}
                      placeholder="请输入描述"
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      className="min-h-24"
                      disabled={creating}
                    />
                    {descriptionError ? (
                      <FieldError>{descriptionError}</FieldError>
                    ) : (
                      <FieldDescription>
                        描述将写入资源注解 description，最长 {DESCRIPTION_MAX_LENGTH} 个字符。
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
                        <h3 className="text-[15px] font-semibold">数据</h3>
                        <p className="text-sm text-muted-foreground">
                          管理资源中的键值对数据，可随时新增或编辑。
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
                                    {item.key.trim() || "未命名数据项"}
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
                                    编辑
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => requestDeleteItem(item.id)}
                                    disabled={creating}
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                </ItemActions>
                              </Item>
                            ))}
                          </ItemGroup>
                        ) : (
                          <div
                            className={`rounded-lg border border-dashed px-4 py-10 text-center ${itemsError === DATA_ITEM_REQUIRED_MESSAGE ? "border-destructive" : ""}`}
                          >
                            <div className={`text-sm font-semibold ${itemsError === DATA_ITEM_REQUIRED_MESSAGE ? "text-destructive" : ""}`}>暂无数据项</div>
                            <div
                              className={`mt-1 text-sm ${itemsError === DATA_ITEM_REQUIRED_MESSAGE ? "text-destructive" : "text-muted-foreground"}`}
                            >
                              先添加一组键值对，再继续创建资源。
                            </div>
                          </div>
                        )}

                        <button
                          type="button"
                          className="mt-3 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                          onClick={addItem}
                          disabled={creating}
                        >
                          <span className="text-sm font-semibold">添加数据</span>
                          <span className="mt-1 text-sm text-muted-foreground">
                            添加新的键值对数据项。
                          </span>
                        </button>

                        {itemsError && itemsError !== DATA_ITEM_REQUIRED_MESSAGE ? (
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
                              <FieldLabel htmlFor={`${editingItem.id}-key`}>键</FieldLabel>
                              <Input
                                id={`${editingItem.id}-key`}
                                value={editingItem.key}
                                onChange={(event) =>
                                  updateItem(editingItem.id, "key", event.target.value)
                                }
                                placeholder="application.yaml"
                                aria-invalid={Boolean(editingKeyError)}
                                disabled={creating}
                              />
                              {/*{editingKeyError ? (
                                <FieldError>{editingKeyError}</FieldError>
                              ) : (
                                <FieldDescription>
                                  支持字母、数字、点、短横线和下划线。
                                </FieldDescription>
                              )}*/}
                            </Field>

                            {/*<Separator />*/}

                            <Field className="min-h-0 flex-1">
                              <FieldLabel htmlFor={`${editingItem.id}-value`}>
                                {valueLabel}
                              </FieldLabel>
                              <Textarea
                                id={`${editingItem.id}-value`}
                                value={editingItem.value}
                                onChange={(event) =>
                                  updateItem(editingItem.id, "value", event.target.value)
                                }
                                placeholder={isSecret ? "请输入密文内容" : "请输入配置内容"}
                                className="min-h-40 flex-1"
                                disabled={creating}
                              />
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
                  <h3 className="text-[15px] font-semibold">高级设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    补充标签与注解信息，便于检索、分类和后续治理。
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
                      titleText="统一管理资源的标签与注解信息。"
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
                  取消
                </Button>
                <Button type="button" onClick={returnToList} disabled={isBusy}>
                  确认保存
                </Button>
              </div>
            </DialogFooter>
          ) : yamlMode ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
                <Button type="button" onClick={() => void handleSubmit()} disabled={isBusy}>
                  {creating
                    ? isEditMode
                      ? "保存中..."
                      : "创建中..."
                    : checkingNext
                      ? "校验中..."
                      : isEditMode
                        ? "保存"
                        : "创建"}
                </Button>
              </div>
            </DialogFooter>
          ) : activeTab === "basic" ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={(event) => handleNextStep(event)}
                  disabled={isBusy}
                >
                  {checkingNext ? "校验中..." : "下一步"}
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
                  上一步
                </Button>
                <Button
                  type="button"
                  onClick={goToAdvancedStep}
                  disabled={isBusy}
                >
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
                  onClick={goToDataStep}
                  disabled={isBusy}
                >
                  上一步
                </Button>
                <Button type="button" onClick={() => void handleSubmit()} disabled={isBusy}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                </Button>
              </div>
            </DialogFooter>
          )}
        </div>

        <DeleteConfirmDialog
          open={Boolean(pendingDeleteItem)}
          title="删除数据项"
          description={
            pendingDeleteItem?.key.trim()
              ? `确定要删除数据项 ${pendingDeleteItem.key.trim()} 吗？`
              : "确定要删除该数据项吗？"
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

