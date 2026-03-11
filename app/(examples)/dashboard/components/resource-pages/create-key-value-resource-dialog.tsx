"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"
import {
  IconAdjustmentsHorizontal,
  IconDeviceFloppy,
  IconPencil,
  IconSettings2,
  IconTrash,
} from "@tabler/icons-react"
import { parse, stringify } from "yaml"

import { checkConfigMapExists, checkSecretExists } from "@/app/lib/kubespark/resource-create"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
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

type ResourceKind = "configmap" | "secret"

type NamespaceOption = {
  id: string
  name: string
}

type DialogTab = "basic" | "data"
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
  secretType: string
  items: KeyValueItem[]
}

export type KeyValueDialogInitialValues = {
  name: string
  namespace: string
  description?: string
  type?: string
  items: Array<{ key: string; value: string }>
}

type SubmitPayload = {
  name: string
  namespace: string
  description: string
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
  const annotations: JsonObject = {}

  if (snapshot.name.trim()) metadata.name = snapshot.name.trim()
  if (snapshot.namespace.trim()) metadata.namespace = snapshot.namespace.trim()
  if (snapshot.description.trim()) annotations.description = snapshot.description.trim()
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
  const [secretType, setSecretType] = React.useState("Opaque")
  const [items, setItems] = React.useState<KeyValueItem[]>(() => [createEmptyItem()])
  const [creating, setCreating] = React.useState(false)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [yamlMode, setYamlMode] = React.useState(false)
  const [yamlText, setYamlText] = React.useState("")
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [itemsError, setItemsError] = React.useState<string | null>(null)
  const [editingKeyError, setEditingKeyError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<DialogTab>("basic")
  const [dataViewMode, setDataViewMode] = React.useState<DataViewMode>("list")
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null)
  const [pendingDeleteItemId, setPendingDeleteItemId] = React.useState<string | null>(null)
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
  const valueLabel = isSecret ? "密文内容" : "值"
  const filledItems = React.useMemo(
    () => items.filter((item) => item.key.trim() || item.value.trim()),
    [items]
  )

  const clearInlineErrors = React.useCallback(() => {
    setNameError(null)
    setNamespaceError(null)
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
      secretType,
      items,
    }),
    [description, items, name, namespace, secretType]
  )

  const applySnapshot = React.useCallback((snapshot: DialogSnapshot) => {
    setName(snapshot.name)
    setNamespace(snapshot.namespace)
    setDescription(snapshot.description)
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
      }
    },
    [lockedIdentity]
  )

  React.useEffect(() => {
    if (!open) {
      setName("")
      setNamespace("")
      setDescription("")
      setSecretType("Opaque")
      setItems([createEmptyItem()])
      setCreating(false)
      setCheckingNext(false)
      setYamlMode(false)
      setYamlText("")
      setYamlError(null)
      setNameError(null)
      setNamespaceError(null)
      setItemsError(null)
      setEditingKeyError(null)
      setSubmitError(null)
      setActiveTab("basic")
      setDataViewMode("list")
      setEditingItemId(null)
      setPendingDeleteItemId(null)
    }
  }, [open])

  React.useEffect(() => {
    if (!open || !isEditMode || !initialValues) return

    setName(initialValues.name)
    setNamespace(initialValues.namespace)
    setDescription(initialValues.description ?? "")
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
  }, [clearInlineErrors, initialValues, isEditMode, open])

  const editingItem = React.useMemo(
    () => items.find((item) => item.id === editingItemId) ?? null,
    [editingItemId, items]
  )

  const updateItem = React.useCallback(
    (id: string, field: "key" | "value", value: string) => {
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                [field]: value,
              }
            : item
        )
      )
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
    const nextValue = editingItem.value.trim()

    if (!nextKey && !nextValue) {
      setEditingKeyError(null)
      setItemsError(null)
      setDataViewMode("list")
      setEditingItemId(null)
      return
    }

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

  const goToBasicStep = React.useCallback(() => {
    setActiveTab("basic")
    setSubmitError(null)
  }, [])

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
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (creating || checkingNext) return

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

      const cleanedItems = draft.items
        .map((item) => ({
          key: item.key.trim(),
          value: item.value,
        }))
        .filter((item) => item.key.length > 0 || item.value.length > 0)

      let resolvedItemsError: string | null = null
      const seen = new Set<string>()

      if (cleanedItems.length === 0) {
        resolvedItemsError = "请至少添加一个数据项"
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

      setNameError(resolvedNameError)
      setNamespaceError(resolvedNamespaceError)
      setItemsError(resolvedItemsError)
      setSubmitError(null)

      if (yamlMode) {
        if (resolvedNameError || resolvedNamespaceError || resolvedItemsError) {
          setYamlError(resolvedNameError ?? resolvedNamespaceError ?? resolvedItemsError)
          return
        }
      } else {
        if (resolvedNameError || resolvedNamespaceError) {
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
      onOpenChange,
      onSubmit,
      withLockedIdentity,
      yamlMode,
      yamlText,
    ]
  )

  const isBusy = creating || checkingNext
  const canNavigateStep = !isBusy && dataViewMode !== "edit"

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isBusy) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex max-h-[96vh] w-[min(92vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{descriptionText}</DialogDescription>
              </div>
              <label
                htmlFor={`${kind}-yaml-mode`}
                className="flex shrink-0 items-center gap-3 rounded-full border bg-background px-3 py-1.5 text-sm"
              >
                <span className="font-medium">编辑 YAML</span>
                <Switch
                  id={`${kind}-yaml-mode`}
                  checked={yamlMode}
                  onCheckedChange={handleYamlModeChange}
                  disabled={isBusy}
                />
              </label>
            </div>
          </DialogHeader>

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
                  status: activeTab === "data" ? "当前" : "未设置",
                  active: activeTab === "data",
                  icon: <IconAdjustmentsHorizontal className="size-4" />,
                  disabled: !canNavigateStep,
                  onClick: () => {
                    if (activeTab === "data") {
                      setSubmitError(null)
                      return
                    }
                    void handleNextStep()
                  },
                },
              ]}
            />
          ) : null}

          <div className="min-h-0 flex-1 px-6 py-6">
            {yamlMode ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="h-[58vh] min-h-[420px] overflow-hidden rounded-lg border">
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

                  <Field data-invalid={Boolean(namespaceError)}>
                    <FieldLabel htmlFor={`${kind}-create-namespace`}>项目</FieldLabel>
                    <Select
                      value={namespace}
                      onValueChange={(value) => {
                        setNamespace(value)
                        if (namespaceError) setNamespaceError(null)
                        if (submitError) setSubmitError(null)
                        if (yamlError) setYamlError(null)
                      }}
                      disabled={creating || isEditMode}
                    >
                      <SelectTrigger
                        id={`${kind}-create-namespace`}
                        aria-invalid={Boolean(namespaceError)}
                      >
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
                    {namespaceError ? (
                      <FieldError>{namespaceError}</FieldError>
                    ) : (
                      <FieldDescription>选择资源所属项目。</FieldDescription>
                    )}
                  </Field>

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
                        if (yamlError) setYamlError(null)
                      }}
                      placeholder="请输入描述（选填）"
                      maxLength={256}
                      className="min-h-24"
                      disabled={creating}
                    />
                    <FieldDescription>
                      描述将写入资源注解 `description`，最长 256 个字符。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : (
              <div className="">
                {dataViewMode === "list" ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-[15px] font-semibold">数据</h3>
                        <p className="text-sm text-muted-foreground">
                          管理资源中的键值对数据，空白项不会被提交。
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 max-h-[56vh] overflow-y-auto pr-2">
                      <div className="flex flex-col gap-0 pb-4">
                        {filledItems.length > 0 ? (
                          <ItemGroup className="gap-3">
                            {filledItems.map((item) => (
                              <Item
                                key={item.id}
                                variant="outline"
                                size="sm"
                                className="group rounded-lg transition-colors hover:bg-muted/20"
                              >
                                <ItemContent className="min-w-0 md:flex-row md:items-center md:gap-6">
                                  <ItemTitle className="min-w-0 flex-1 truncate text-sm">
                                    {item.key.trim() || "未命名数据项"}
                                  </ItemTitle>
                                  <ItemDescription className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                                    {item.value.trim() || "-"}
                                  </ItemDescription>
                                </ItemContent>

                                <ItemActions className="gap-1 opacity-100 transition md:pointer-events-none md:opacity-0 md:group-hover:pointer-events-auto md:group-hover:opacity-100">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => requestDeleteItem(item.id)}
                                    disabled={creating}
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => beginEditItem(item.id)}
                                    disabled={creating}
                                  >
                                    <IconPencil data-icon="inline-start" />
                                    编辑
                                  </Button>
                                </ItemActions>
                              </Item>
                            ))}
                          </ItemGroup>
                        ) : (
                          <div className="rounded-lg border border-dashed px-4 py-10 text-center">
                            <div className="text-sm font-semibold">暂无数据项</div>
                            <div className="mt-1 text-sm text-muted-foreground">
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

                        {itemsError ? <FieldError className="mt-4">{itemsError}</FieldError> : null}
                        {submitError ? <FieldError className="mt-4">{submitError}</FieldError> : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-[15px] font-semibold">编辑数据</h3>
                        <p className="text-sm text-muted-foreground">
                          设置当前数据项的键和值。
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={returnToList}
                        disabled={creating}
                      >
                        <IconDeviceFloppy data-icon="inline-start" />
                        确定保存
                      </Button>
                    </div>

                    {editingItem ? (
                      <div className="mt-4 ">
                        <div className="flex flex-col gap-5 pb-4">
                          <FieldGroup className="flex flex-col gap-5">
                            <Field data-invalid={Boolean(editingKeyError)}>
                              <FieldLabel htmlFor={`${editingItem.id}-key`}>键</FieldLabel>
                              <Input
                                id={`${editingItem.id}-key`}
                                value={editingItem.key}
                                onChange={(event) =>
                                  updateItem(editingItem.id, "key", event.target.value)
                                }
                                placeholder="例如：application.yaml"
                                aria-invalid={Boolean(editingKeyError)}
                                disabled={creating}
                              />
                              {editingKeyError ? (
                                <FieldError>{editingKeyError}</FieldError>
                              ) : (
                                <FieldDescription>
                                  支持字母、数字、点、短横线和下划线。
                                </FieldDescription>
                              )}
                            </Field>

                            <Separator />

                            <Field>
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
                                className="min-h-56"
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
            )}
          </div>

          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              {yamlMode ? (
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
              ) : activeTab === "basic" ? (
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToBasicStep}
                  disabled={isBusy || dataViewMode === "edit"}
                >
                  上一步
                </Button>
              )}

              {yamlMode ? (
                <Button type="submit" disabled={isBusy}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : checkingNext ? "校验中..." : isEditMode ? "保存" : "创建"}
                </Button>
              ) : activeTab === "basic" ? (
                <Button
                  type="button"
                  onClick={(event) => handleNextStep(event)}
                  disabled={isBusy}
                >
                  {checkingNext ? "校验中..." : "下一步"}
                </Button>
              ) : (
                <Button type="submit" disabled={isBusy || dataViewMode === "edit"}>
                  {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>

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
