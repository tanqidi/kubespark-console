"use client"

import * as React from "react"
import { IconArrowLeft, IconPencil, IconTrash } from "@tabler/icons-react"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent } from "@/components/ui/tabs"
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
  onSubmit: (payload: SubmitPayload) => Promise<void>
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

export function CreateKeyValueResourceDialog({
  kind,
  open,
  onOpenChange,
  namespaceOptions,
  onSubmit,
}: CreateKeyValueResourceDialogProps) {
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [secretType, setSecretType] = React.useState("Opaque")
  const [items, setItems] = React.useState<KeyValueItem[]>(() => [createEmptyItem()])
  const [creating, setCreating] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [itemsError, setItemsError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [activeTab, setActiveTab] = React.useState<DialogTab>("basic")
  const [dataViewMode, setDataViewMode] = React.useState<DataViewMode>("list")
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null)

  const isSecret = kind === "secret"
  const title = isSecret ? "创建保密字典" : "创建配置字典"
  const descriptionText = isSecret
    ? "使用 Kubernetes Secret 创建保密数据，数据项将通过 stringData 写入。"
    : "使用 Kubernetes ConfigMap 创建配置数据，数据项将以键值对形式写入。"
  const valueLabel = isSecret ? "密文内容" : "值"
  const filledItems = React.useMemo(
    () => items.filter((item) => item.key.trim() || item.value.trim()),
    [items]
  )

  React.useEffect(() => {
    if (!open) {
      setName("")
      setNamespace("")
      setDescription("")
      setSecretType("Opaque")
      setItems([createEmptyItem()])
      setCreating(false)
      setNameError(null)
      setNamespaceError(null)
      setItemsError(null)
      setSubmitError(null)
      setActiveTab("basic")
      setDataViewMode("list")
      setEditingItemId(null)
    }
  }, [open])

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
      if (submitError) setSubmitError(null)
    },
    [itemsError, submitError]
  )

  const addItem = React.useCallback(() => {
    const nextItem = createEmptyItem()
    setItems((current) => [...current, nextItem])
    setEditingItemId(nextItem.id)
    setDataViewMode("edit")
    if (itemsError) setItemsError(null)
  }, [itemsError])

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
      if (submitError) setSubmitError(null)
    },
    [itemsError, submitError]
  )

  const beginEditItem = React.useCallback((id: string) => {
    setEditingItemId(id)
    setDataViewMode("edit")
    if (itemsError) setItemsError(null)
    if (submitError) setSubmitError(null)
  }, [itemsError, submitError])

  const returnToList = React.useCallback(() => {
    setDataViewMode("list")
    setEditingItemId(null)
  }, [])

  const goToBasicStep = React.useCallback(() => {
    setActiveTab("basic")
    setSubmitError(null)
  }, [])

  const handleNextStep = React.useCallback(() => {
    if (creating) return

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

    setSubmitError(null)
    setActiveTab("data")
    setDataViewMode("list")
  }, [creating, name, namespace])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (creating) return

      const nextName = name.trim().toLowerCase()
      const nextNamespace = namespace.trim()
      const nextDescription = description.trim()

      const resolvedNameError = validateName(nextName)
      const resolvedNamespaceError = nextNamespace ? null : "请选择项目"

      const cleanedItems = items
        .map((item) => ({
          key: item.key.trim(),
          value: item.value,
        }))
        .filter((item) => item.key.length > 0 || item.value.length > 0)

      let resolvedItemsError: string | null = null
      const seen = new Set<string>()

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

      if (resolvedNameError || resolvedNamespaceError) {
        setActiveTab("basic")
        return
      }

      if (resolvedItemsError) {
        setActiveTab("data")
        setDataViewMode("list")
        return
      }

      setCreating(true)

      try {
        await onSubmit({
          name: nextName,
          namespace: nextNamespace,
          description: nextDescription,
          ...(isSecret ? { type: secretType } : {}),
          items: cleanedItems,
        })
        onOpenChange(false)
      } catch (error) {
        const message = resolveSubmitErrorMessage(error, kind)
        const normalized = message.toLowerCase()

        if (
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
    [creating, description, isSecret, items, kind, name, namespace, onOpenChange, onSubmit, secretType]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && creating) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-4xl"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader className="border-b bg-muted/20 px-6 py-5">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{descriptionText}</DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            className="px-6 pb-0 pt-5"
          >
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  {activeTab === "basic" ? (
                    <BreadcrumbPage>基本信息</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <button type="button" onClick={goToBasicStep}>
                        基本信息
                      </button>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {activeTab === "data" ? (
                    <BreadcrumbPage>数据设置</BreadcrumbPage>
                  ) : (
                    <span className="text-muted-foreground">数据设置</span>
                  )}
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <TabsContent value="basic" className="mt-5">
              <div className="max-h-[68vh] overflow-y-auto px-1 py-1">
                <div className="mb-5">
                  <h3 className="text-base font-semibold">基本信息</h3>
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
                      }}
                      placeholder={isSecret ? "请输入保密字典名称" : "请输入配置字典名称"}
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={creating}
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
                      }}
                      disabled={creating}
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
                        onValueChange={setSecretType}
                        disabled={creating}
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
                      onChange={(event) => setDescription(event.target.value)}
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
            </TabsContent>

            <TabsContent value="data" className="mt-5">
              <div className="max-h-[68vh] overflow-y-auto px-1 py-1">
                {dataViewMode === "list" ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <h3 className="text-base font-semibold">数据</h3>
                        <p className="text-sm text-muted-foreground">
                          管理资源中的键值对数据，空白项不会被提交。
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {filledItems.length} 项
                      </Badge>
                    </div>

                    <div className="mt-5 flex flex-col gap-0">
                      {filledItems.length > 0 ? (
                        <div className="overflow-hidden rounded-lg border">
                          {filledItems.map((item, index) => (
                            <div
                              key={item.id}
                              className="group flex items-center gap-4 border-b px-4 py-4 last:border-b-0"
                            >
                              <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-medium text-muted-foreground">
                                {String(index + 1).padStart(2, "0")}
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-foreground">
                                  {item.key.trim() || "未命名数据项"}
                                </div>
                                <div className="mt-1 line-clamp-2 whitespace-pre-wrap break-all text-sm text-muted-foreground">
                                  {item.value.trim() || "-"}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeItem(item.id)}
                                  disabled={creating}
                                >
                                  <IconTrash data-icon="inline-start" />
                                  删除
                                </Button>
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
                              </div>
                            </div>
                          ))}
                        </div>
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
                        className="mt-4 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
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
                  </>
                ) : (
                  <>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="-ml-2 w-fit"
                        onClick={returnToList}
                        disabled={creating}
                      >
                        <IconArrowLeft data-icon="inline-start" />
                        返回数据列表
                      </Button>

                      <div className="mt-3 flex items-start justify-between gap-4">
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base font-semibold">编辑数据</h3>
                          <p className="text-sm text-muted-foreground">
                            设置当前数据项的键和值。
                          </p>
                        </div>

                        {editingItem?.key.trim() ? (
                          <Badge variant="secondary" className="shrink-0">
                            {editingItem.key.trim()}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    {editingItem ? (
                      <div className="mt-5 flex flex-col gap-5">
                        <FieldGroup className="flex flex-col gap-5">
                          <Field>
                            <FieldLabel htmlFor={`${editingItem.id}-key`}>键</FieldLabel>
                            <Input
                              id={`${editingItem.id}-key`}
                              value={editingItem.key}
                              onChange={(event) =>
                                updateItem(editingItem.id, "key", event.target.value)
                              }
                              placeholder="例如：application.yaml"
                              disabled={creating}
                            />
                            <FieldDescription>
                              支持字母、数字、点、短横线和下划线。
                            </FieldDescription>
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

                        {itemsError ? <FieldError>{itemsError}</FieldError> : null}
                        {submitError ? <FieldError>{submitError}</FieldError> : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6 border-t bg-muted/10 px-6 py-4">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={creating}>
                取消
              </Button>
            </DialogClose>
            {activeTab === "basic" ? (
              <Button type="button" onClick={handleNextStep} disabled={creating}>
                下一步
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={goToBasicStep} disabled={creating}>
                  上一步
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "创建中..." : "创建"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
