"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconAdjustments, IconDatabase, IconEye, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  ResourceMetadataEditor,
  hasUserProvidedMetadata,
  metadataEntriesToRecord,
  metadataRecordToEntries,
  type MetadataEntry,
} from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  fetchVolumeRows,
  type PersistentVolumeClaimResourceRow,
  type PersistentVolumeResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import {
  deletePersistentVolume,
  deletePersistentVolumeClaim,
} from "@/app/lib/kubespark/resource-delete"
import { fetchResourceCollection } from "@/app/lib/kubespark/common"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import {
  checkPersistentVolumeClaimExists,
  createPersistentVolumeClaim,
} from "@/app/lib/kubespark/volumes"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { ProjectNamespaceField } from "@/app/(console)/dashboard/components/resource-pages/project-namespace-field"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type PersistentVolumeRow = PersistentVolumeResourceRow
type PersistentVolumeClaimRow = PersistentVolumeClaimResourceRow
type NamespaceOption = { id: string; name: string }
type StorageClassOption = { name: string; isDefault: boolean }
type VolumeCreateStep = "basic" | "storage" | "advanced"
type AccessMode = "ReadWriteOnce" | "ReadOnlyMany" | "ReadWriteMany" | "ReadWriteOncePod"
type VolumeMode = "Filesystem" | "Block"

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

const persistentVolumeColumns: ColumnConfig<PersistentVolumeRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "capacity", label: "容量" },
  { key: "storageClass", label: "存储类" },
  { key: "accessMode", label: "访问模式" },
  { key: "reclaimPolicy", label: "回收策略" },
  { key: "status", label: "状态", render: "status" },
  { key: "node", label: "节点" },
  { key: "age", label: "运行时间" },
]

const persistentVolumeClaimColumns: ColumnConfig<PersistentVolumeClaimRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  { key: "capacity", label: "容量" },
  { key: "storageClass", label: "存储类" },
  { key: "accessMode", label: "访问模式" },
  { key: "status", label: "状态", render: "status" },
  { key: "boundPV", label: "绑定 PV" },
  { key: "age", label: "运行时间" },
]

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"
const DESCRIPTION_MAX_LENGTH = 256

function validateVolumeName(name: string): string | null {
  const value = name.trim().toLowerCase()
  if (!value) return "请输入名称"
  if (value.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9]([-.a-z0-9]*[a-z0-9])?$/.test(value)) return NAME_RULE_MESSAGE
  return null
}

function normalizeStorageRequest(value: string): string {
  return value.replace(/[^0-9.]/g, "")
}

function isDefaultStorageClassAnnotation(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true"
}

function buildPvcYamlText(params: {
  name: string
  namespace: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  accessMode: AccessMode
  storageRequest: string
  storageUnit: string
  storageClassName: string
  volumeMode: VolumeMode
  volumeName: string
}): string {
  const requestStorage = `${params.storageRequest.trim()}${params.storageUnit}`
  const labels = metadataEntriesToRecord(params.labels)
  const annotations = metadataEntriesToRecord(params.annotations)
  if (params.description.trim()) annotations.description = params.description.trim()
  else delete annotations.description
  return stringify(
    {
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(params.namespace.trim() ? { namespace: params.namespace.trim() } : {}),
        ...(Object.keys(labels).length > 0 ? { labels } : {}),
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
      spec: {
        accessModes: [params.accessMode],
        resources: {
          requests: {
            ...(params.storageRequest.trim() ? { storage: requestStorage } : {}),
          },
        },
        ...(params.storageClassName.trim() ? { storageClassName: params.storageClassName.trim() } : {}),
        ...(params.volumeMode ? { volumeMode: params.volumeMode } : {}),
        ...(params.volumeName.trim() ? { volumeName: params.volumeName.trim() } : {}),
      },
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parseStorageRequest(raw: string): { value: string; unit: string } {
  const text = raw.trim()
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)([a-zA-Z]+)$/)
  if (!match) return { value: text, unit: "Gi" }
  return {
    value: match[1] ?? "",
    unit: match[2] ?? "Gi",
  }
}

function parsePvcYamlText(yamlText: string): {
  name: string
  namespace: string
  description: string
  labels: MetadataEntry[]
  annotations: MetadataEntry[]
  accessMode: AccessMode
  storageRequest: string
  storageUnit: string
  storageClassName: string
  volumeMode: VolumeMode
  volumeName: string
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
  if (kind && kind !== "PersistentVolumeClaim") {
    throw new Error("YAML 资源类型必须是 PersistentVolumeClaim")
  }

  const metadata =
    typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : {}
  const annotations =
    typeof metadata.annotations === "object" &&
    metadata.annotations !== null &&
    !Array.isArray(metadata.annotations)
      ? (metadata.annotations as Record<string, unknown>)
      : {}
  const labels =
    typeof metadata.labels === "object" &&
    metadata.labels !== null &&
    !Array.isArray(metadata.labels)
      ? (metadata.labels as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}
  const accessModes = Array.isArray(spec.accessModes) ? spec.accessModes : []
  const resources =
    typeof spec.resources === "object" && spec.resources !== null && !Array.isArray(spec.resources)
      ? (spec.resources as Record<string, unknown>)
      : {}
  const requests =
    typeof resources.requests === "object" &&
    resources.requests !== null &&
    !Array.isArray(resources.requests)
      ? (resources.requests as Record<string, unknown>)
      : {}
  const storageRaw = typeof requests.storage === "string" ? requests.storage : ""
  const parsedStorage = parseStorageRequest(storageRaw)

  const accessMode =
    accessModes[0] === "ReadOnlyMany" ||
    accessModes[0] === "ReadWriteMany" ||
    accessModes[0] === "ReadWriteOncePod" ||
    accessModes[0] === "ReadWriteOnce"
      ? (accessModes[0] as AccessMode)
      : "ReadWriteOnce"

  const volumeMode =
    spec.volumeMode === "Block" || spec.volumeMode === "Filesystem"
      ? (spec.volumeMode as VolumeMode)
      : "Filesystem"

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    namespace: typeof metadata.namespace === "string" ? metadata.namespace : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
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
    accessMode,
    storageRequest: parsedStorage.value,
    storageUnit: parsedStorage.unit || "Gi",
    storageClassName: typeof spec.storageClassName === "string" ? spec.storageClassName : "",
    volumeMode,
    volumeName: typeof spec.volumeName === "string" ? spec.volumeName : "",
  }
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }
  return "API request failed"
}

export function VolumesPageClient() {
  const [persistentVolumes, setPersistentVolumes] = React.useState<PersistentVolumeRow[]>([])
  const [persistentVolumeClaims, setPersistentVolumeClaims] = React.useState<
    PersistentVolumeClaimRow[]
  >([])
  const [view, setView] = React.useState<"PVC" | "PV">("PVC")
  const [pvcNamespaceQuery, setPvcNamespaceQuery] = React.useState("")
  const [pvcNameQuery, setPvcNameQuery] = React.useState("")
  const [pvNameQuery, setPvNameQuery] = React.useState("")
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("查看 Kubernetes Volume 的 YAML 内容。")
  const [pendingDeletePvcRow, setPendingDeletePvcRow] = React.useState<PersistentVolumeClaimRow | null>(null)
  const [pendingDeletePvRow, setPendingDeletePvRow] = React.useState<PersistentVolumeRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createStep, setCreateStep] = React.useState<VolumeCreateStep>("basic")
  const [creating, setCreating] = React.useState(false)
  const [checkingCreateNext, setCheckingCreateNext] = React.useState(false)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)
  const [namespaceOptions, setNamespaceOptions] = React.useState<NamespaceOption[]>([])
  const [storageClassOptions, setStorageClassOptions] = React.useState<StorageClassOption[]>([])
  const [createName, setCreateName] = React.useState("")
  const [createNamespace, setCreateNamespace] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createAccessMode, setCreateAccessMode] = React.useState<AccessMode>("ReadWriteOnce")
  const [createStorageRequest, setCreateStorageRequest] = React.useState("10")
  const [createStorageUnit, setCreateStorageUnit] = React.useState("Gi")
  const [createStorageClassName, setCreateStorageClassName] = React.useState("")
  const [createVolumeMode, setCreateVolumeMode] = React.useState<VolumeMode>("Filesystem")
  const [createVolumeName, setCreateVolumeName] = React.useState("")
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([{ key: "", value: "" }])
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createNamespaceError, setCreateNamespaceError] = React.useState<string | null>(null)
  const [createStorageError, setCreateStorageError] = React.useState<string | null>(null)
  const [createStorageClassError, setCreateStorageClassError] = React.useState<string | null>(null)
  const [createSubmitError, setCreateSubmitError] = React.useState<string | null>(null)
  const createDialogPopupLayerRef = React.useRef<HTMLDivElement | null>(null)

  const handleViewPvcYaml = React.useCallback((row: PersistentVolumeClaimRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`查看 Kubernetes PersistentVolumeClaim（${row.namespace}/${row.name}）的 YAML 内容。`)

    void fetchNamespacedResourceYaml("persistentvolumeclaims", row.namespace, row.name, {
      documentType: "persistentvolumeclaim",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Volumes] view yaml response", {
          pvc: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Volumes] view yaml request failed", {
          pvc: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const handleViewPvYaml = React.useCallback((row: PersistentVolumeRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`查看 Kubernetes PersistentVolume（${row.name}）的 YAML 内容。`)

    void fetchNamespacedResourceYaml("persistentvolumes", "", row.name, {
      group: "core",
      version: "v1",
      documentType: "persistentvolume",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Volumes] view yaml response", {
          pv: { name: row.name },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Volumes] view yaml request failed", {
          pv: { name: row.name },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDeletePvc = React.useCallback((row: PersistentVolumeClaimRow) => {
    setPendingDeletePvcRow(row)
  }, [])

  const requestDeletePv = React.useCallback((row: PersistentVolumeRow) => {
    setPendingDeletePvRow(row)
  }, [])

  const handleConfirmDeletePvc = React.useCallback(() => {
    if (!pendingDeletePvcRow || deleting) return
    setDeleting(true)
    void deletePersistentVolumeClaim(
      pendingDeletePvcRow.namespace,
      pendingDeletePvcRow.name
    )
      .then(() => {
        setPendingDeletePvcRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Volumes] delete request failed", {
          target: {
            kind: "pvc",
            name: pendingDeletePvcRow.name,
            namespace: pendingDeletePvcRow.namespace,
          },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeletePvcRow])

  const handleConfirmDeletePv = React.useCallback(() => {
    if (!pendingDeletePvRow || deleting) return
    setDeleting(true)
    void deletePersistentVolume(pendingDeletePvRow.name)
      .then(() => {
        setPendingDeletePvRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Volumes] delete request failed", {
          target: {
            kind: "pv",
            name: pendingDeletePvRow.name,
          },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeletePvRow])

  const handleDeleteSelectedPvcRows = React.useCallback(
    (selectedRows: PersistentVolumeClaimRow[]) => {
      if (selectedRows.length === 0) return
      void Promise.all(
        selectedRows.map((row) => deletePersistentVolumeClaim(row.namespace, row.name))
      ).catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Volumes] bulk delete request failed", e)
      })
    },
    []
  )

  const handleDeleteSelectedPvRows = React.useCallback((selectedRows: PersistentVolumeRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deletePersistentVolume(row.name))).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Volumes] bulk delete request failed", e)
    })
  }, [])

  const resetCreateForm = React.useCallback(() => {
    setCreateStep("basic")
    setCreateYamlMode(false)
    setCheckingCreateNext(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateName("")
    setCreateNamespace("")
    setCreateDescription("")
    setCreateAccessMode("ReadWriteOnce")
    setCreateStorageRequest("10")
    setCreateStorageUnit("Gi")
    setCreateStorageClassName("")
    setCreateVolumeMode("Filesystem")
    setCreateVolumeName("")
    setMetadataEnabled(false)
    setLabelEntries([{ key: "", value: "" }])
    setAnnotationEntries([{ key: "", value: "" }])
    setCreateNameError(null)
    setCreateNamespaceError(null)
    setCreateStorageError(null)
    setCreateStorageClassError(null)
    setCreateSubmitError(null)
  }, [])

  React.useEffect(() => {
    if (!createDialogOpen) return
    let cancelled = false
    void Promise.all([
      fetchNamespaces(),
      fetchResourceCollection("storage.k8s.io", "v1", "storageclasses"),
    ])
      .then(([namespaces, storageClasses]) => {
        if (cancelled) return
        const ns = namespaces
          .map((item) => item.name.trim())
          .filter((item) => item.length > 0)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ id: name, name }))
        setNamespaceOptions(ns)
        const classes = (
          storageClasses.items as Array<{
            metadata?: { name?: string; annotations?: Record<string, unknown> }
          }>
        )
          .map((item) => ({
            name: item.metadata?.name?.trim() ?? "",
            isDefault: isDefaultStorageClassAnnotation(
              item.metadata?.annotations?.["storageclass.kubernetes.io/is-default-class"]
            ),
          }))
          .filter((item) => item.name.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name))
        setStorageClassOptions(classes)
        const preferredStorageClassName =
          classes.find((item) => item.isDefault)?.name ?? classes[0]?.name ?? ""
        if (
          !createStorageClassName.trim() ||
          !classes.some((item) => item.name === createStorageClassName.trim())
        ) {
          setCreateStorageClassName(preferredStorageClassName)
        }
      })
      .catch((loadError: unknown) => {
        if (cancelled) return
        console.error("[Volumes] load create dialog options failed", loadError)
        setNamespaceOptions([])
        setStorageClassOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [
    createDialogOpen,
    createNamespace,
    createStorageClassName,
  ])

  const buildCreateYaml = React.useCallback(() => {
    return buildPvcYamlText({
      name: createName,
      namespace: createNamespace,
      description: createDescription,
      labels: labelEntries,
      annotations: annotationEntries,
      accessMode: createAccessMode,
      storageRequest: createStorageRequest,
      storageUnit: createStorageUnit,
      storageClassName: createStorageClassName,
      volumeMode: createVolumeMode,
      volumeName: createVolumeName,
    })
  }, [
    createAccessMode,
    annotationEntries,
    createDescription,
    createName,
    createNamespace,
    labelEntries,
    createStorageClassName,
    createStorageRequest,
    createStorageUnit,
    createVolumeMode,
    createVolumeName,
  ])

  const validateBasicStep = React.useCallback(() => {
    const nextNameError = validateVolumeName(createName)
    const nextNamespaceError = createNamespace.trim() ? null : "请选择项目"
    setCreateNameError(nextNameError)
    setCreateNamespaceError(nextNamespaceError)
    return !nextNameError && !nextNamespaceError
  }, [createName, createNamespace])

  const validateStorageStep = React.useCallback(() => {
    if (!createStorageClassName.trim()) {
      setCreateStorageClassError(storageClassOptions.length > 0 ? "请选择存储类" : "暂无可用存储类")
      return false
    }
    setCreateStorageClassError(null)

    const request = createStorageRequest.trim()
    if (!request) {
      setCreateStorageError("请输入申请容量")
      return false
    }
    const parsed = Number(request)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setCreateStorageError("申请容量必须大于 0")
      return false
    }
    setCreateStorageError(null)
    return true
  }, [createStorageClassName, createStorageRequest, storageClassOptions.length])

  const handleCreateNext = React.useCallback(async () => {
    if (creating || checkingCreateNext) return
    setCreateSubmitError(null)
    if (createStep === "basic") {
      if (!validateBasicStep()) return
      setCheckingCreateNext(true)
      try {
        const exists = await checkPersistentVolumeClaimExists({
          name: createName.trim().toLowerCase(),
          namespace: createNamespace.trim(),
        })
        if (exists) {
          setCreateNameError("卷声明名称已存在，请更换后重试")
          return
        }
        setCreateStep("storage")
      } catch (error) {
        setCreateSubmitError(error instanceof Error ? error.message : "卷声明名称校验失败，请稍后重试")
      } finally {
        setCheckingCreateNext(false)
      }
      return
    }
    if (createStep === "storage") {
      if (!validateStorageStep()) return
      setCreateStep("advanced")
    }
  }, [
    checkingCreateNext,
    createName,
    createNamespace,
    createStep,
    creating,
    validateBasicStep,
    validateStorageStep,
  ])

  const handleCreateSubmit = React.useCallback(async () => {
    if (creating) return
    setCreateSubmitError(null)

    let nextState = {
      name: createName,
      namespace: createNamespace,
      description: createDescription,
      labels: labelEntries,
      annotations: annotationEntries,
      accessMode: createAccessMode,
      storageRequest: createStorageRequest,
      storageUnit: createStorageUnit,
      storageClassName: createStorageClassName,
      volumeMode: createVolumeMode,
      volumeName: createVolumeName,
    }

    if (createYamlMode) {
      try {
        nextState = parsePvcYamlText(createYamlText)
        setCreateName(nextState.name)
        setCreateNamespace(nextState.namespace)
        setCreateDescription(nextState.description)
        setLabelEntries(nextState.labels)
        setAnnotationEntries(nextState.annotations)
        setMetadataEnabled(false)
        setCreateAccessMode(nextState.accessMode)
        setCreateStorageRequest(normalizeStorageRequest(nextState.storageRequest))
        setCreateStorageUnit(nextState.storageUnit)
        setCreateStorageClassName(nextState.storageClassName)
        setCreateVolumeMode(nextState.volumeMode)
        setCreateVolumeName(nextState.volumeName)
        setCreateYamlError(null)
      } catch (parseError: unknown) {
        setCreateYamlError(parseError instanceof Error ? parseError.message : "YAML 解析失败")
        return
      }
    }

    const validName = validateVolumeName(nextState.name)
    const validNamespace = nextState.namespace.trim() ? null : "请选择项目"
    const validDescription =
      nextState.description.trim().length <= DESCRIPTION_MAX_LENGTH
        ? null
        : `描述不能超过 ${DESCRIPTION_MAX_LENGTH} 个字符`
    const storageNumber = Number(nextState.storageRequest.trim())
    const validStorage =
      nextState.storageRequest.trim() && Number.isFinite(storageNumber) && storageNumber > 0
        ? null
        : "申请容量必须大于 0"
    const validStorageClass = nextState.storageClassName.trim()
      ? null
      : storageClassOptions.length > 0
        ? "请选择存储类"
        : "暂无可用存储类"

    setCreateNameError(validName)
    setCreateNamespaceError(validNamespace)
    setCreateStorageError(validStorage)
    setCreateStorageClassError(validStorageClass)

    if (validName || validNamespace || validDescription || validStorage || validStorageClass) {
      if (!createYamlMode) {
        if (validName || validNamespace || validDescription) {
          setCreateStep("basic")
        } else {
          setCreateStep("storage")
        }
      } else {
        setCreateYamlError(validName ?? validNamespace ?? validDescription ?? validStorageClass ?? validStorage ?? null)
      }
      return
    }

    setCreating(true)
    try {
      const exists = await checkPersistentVolumeClaimExists({
        name: nextState.name.trim().toLowerCase(),
        namespace: nextState.namespace.trim(),
      })
      if (exists) {
        const existsMessage = "卷声明名称已存在，请更换后重试"
        setCreateNameError(existsMessage)
        if (createYamlMode) setCreateYamlError(existsMessage)
        else setCreateStep("basic")
        return
      }
      await createPersistentVolumeClaim({
        name: nextState.name.trim().toLowerCase(),
        namespace: nextState.namespace.trim(),
        description: nextState.description.trim(),
        labels: metadataEntriesToRecord(nextState.labels),
        annotations: metadataEntriesToRecord(nextState.annotations),
        accessMode: nextState.accessMode,
        storageRequest: `${nextState.storageRequest.trim()}${nextState.storageUnit}`,
        storageClassName: nextState.storageClassName.trim(),
        volumeMode: nextState.volumeMode,
        volumeName: nextState.volumeName.trim(),
      })
      const { persistentVolumeClaims: pvcRows, persistentVolumes: pvRows } = await fetchVolumeRows()
      setPersistentVolumeClaims(pvcRows)
      setPersistentVolumes(pvRows)
      setError(null)
      setCreateDialogOpen(false)
      resetCreateForm()
    } catch (submitError: unknown) {
      const message = submitError instanceof Error ? submitError.message : "创建失败"
      if (createYamlMode) {
        setCreateYamlError(message)
      } else {
        setCreateSubmitError(message)
      }
    } finally {
      setCreating(false)
    }
  }, [
    createAccessMode,
    annotationEntries,
    createDescription,
    createName,
    createNamespace,
    labelEntries,
    createStorageClassName,
    createStorageRequest,
    createStorageUnit,
    storageClassOptions.length,
    createVolumeMode,
    createVolumeName,
    createYamlMode,
    createYamlText,
    creating,
    resetCreateForm,
  ])

  const pvcColumns = React.useMemo(
    () =>
      createColumns<PersistentVolumeClaimRow>({
        columns: persistentVolumeClaimColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
              </>
            ),
            onSelect: (row) => {
              handleViewPvcYaml(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {"删除"}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              requestDeletePvc(row)
            },
          },
        ],
      }),
    [handleViewPvcYaml, requestDeletePvc]
  )

  const pvColumns = React.useMemo(
    () =>
      createColumns<PersistentVolumeRow>({
        columns: persistentVolumeColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
              </>
            ),
            onSelect: (row) => {
              handleViewPvYaml(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {"删除"}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              requestDeletePv(row)
            },
          },
        ],
      }),
    [handleViewPvYaml, requestDeletePv]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const { persistentVolumeClaims: pvcRows, persistentVolumes: pvRows } =
          await fetchVolumeRows()
        if (cancelled) return
        setPersistentVolumeClaims(pvcRows)
        setPersistentVolumes(pvRows)
        setError(null)
      } catch (loadError: unknown) {
        if (cancelled) return
        if (!silent) {
          setPersistentVolumeClaims([])
          setPersistentVolumes([])
          setError(resolveErrorMessage(loadError))
        } else {
          console.error("[Volumes] polling refresh failed", loadError)
        }
      } finally {
        if (!silent && !cancelled) setLoading(false)
      }
    }

    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])
  // if (loading) {
  //   return <ResourceLoadingState />
  // } // kept for potential future use
  const pvcNamespaceOptions = React.useMemo(
    () =>
      Array.from(new Set(persistentVolumeClaims.map((row) => row.namespace)))
        .sort((a, b) => a.localeCompare(b))
        .map((namespace) => ({ id: namespace, name: namespace })),
    [persistentVolumeClaims]
  )

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{"加载失败"}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const volumeTabs = (
    <Tabs value={view} onValueChange={(value) => setView(value as "PVC" | "PV")} className="w-fit">
      <TabsList>
        <TabsTrigger value="PVC">{"持久卷声明"}</TabsTrigger>
        <TabsTrigger value="PV">{"持久卷"}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const pvcNsQuery = pvcNamespaceQuery.trim().toLowerCase()
  const pvcNmQuery = pvcNameQuery.trim().toLowerCase()
  const pvNmQuery = pvNameQuery.trim().toLowerCase()

  const filteredPvcRows = persistentVolumeClaims.filter((row) => {
    if (pvcNsQuery && row.namespace.toLowerCase() !== pvcNsQuery) return false
    if (pvcNmQuery && !row.name.toLowerCase().includes(pvcNmQuery)) return false
    return true
  })

  const filteredPvRows = persistentVolumes.filter((row) => {
    if (pvNmQuery && !row.name.toLowerCase().includes(pvNmQuery)) return false
    return true
  })

  const volumeFilters = view === "PVC" ? (
    <>
      <FilterCombobox
        options={pvcNamespaceOptions}
        value={pvcNamespaceQuery}
        onValueChange={setPvcNamespaceQuery}
        placeholder={"命名空间"}
        emptyText={"未找到命名空间"}
        className="w-40"
      />
      <Input
        value={pvcNameQuery}
        onChange={(event) => setPvcNameQuery(event.target.value)}
        placeholder={"名称"}
        className="h-9 w-40"
      />
    </>
  ) : (
    <>
      {/*<FilterCombobox
        options={[]}
        value=""
        placeholder={"命名空间"}
        className="w-40"
        disabled
        onValueChange={() => {}}
      />*/}
      <Input
        value={pvNameQuery}
        onChange={(event) => setPvNameQuery(event.target.value)}
        placeholder={"名称"}
        className="h-9 w-40"
      />
    </>
  )

  return (
    <>
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateDialogOpen(open)
          if (!open) resetCreateForm()
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
                <DialogTitle>创建持久卷声明</DialogTitle>
                <DialogDescription>使用 Kubernetes PersistentVolumeClaim 创建存储声明。</DialogDescription>
              </DialogHeader>
              <div className="h-full flex items-center me-20">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (creating) return
                      if (checked) {
                        setCreateYamlText(buildCreateYaml())
                        setCreateYamlError(null)
                        setCreateYamlMode(true)
                        return
                      }
                      try {
                        const parsed = parsePvcYamlText(createYamlText)
                        setCreateName(parsed.name)
                        setCreateNamespace(parsed.namespace)
                        setCreateDescription(parsed.description)
                        setLabelEntries(parsed.labels)
                        setAnnotationEntries(parsed.annotations)
                        setMetadataEnabled(false)
                        setCreateAccessMode(parsed.accessMode)
                        setCreateStorageRequest(normalizeStorageRequest(parsed.storageRequest))
                        setCreateStorageUnit(parsed.storageUnit)
                        setCreateStorageClassName(parsed.storageClassName)
                        setCreateVolumeMode(parsed.volumeMode)
                        setCreateVolumeName(parsed.volumeName)
                        setCreateYamlError(null)
                        setCreateYamlMode(false)
                      } catch (error) {
                        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                      }
                    }}
                    disabled={creating}
                    aria-label="编辑 YAML"
                  />
                </div>
              </div>
            </div>

            {!createYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: "基本信息",
                    status: createStep === "basic" ? "当前" : createName.trim() && createNamespace.trim() ? "已设置" : "未设置",
                    active: createStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => setCreateStep("basic"),
                  },
                  {
                    id: "storage",
                    title: "存储设置",
                    status:
                      createStep === "storage"
                        ? "当前"
                        : createStorageRequest.trim()
                          ? "已设置"
                          : "未设置",
                    active: createStep === "storage",
                    icon: <IconDatabase className="size-4" />,
                    disabled: creating,
                    onClick: () => setCreateStep("storage"),
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status:
                      createStep === "advanced"
                        ? "当前"
                        : hasUserProvidedMetadata(labelEntries, annotationEntries)
                          ? "已设置"
                          : "未设置",
                    active: createStep === "advanced",
                    icon: <IconAdjustments className="size-4" />,
                    disabled: creating,
                    onClick: () => setCreateStep("advanced"),
                  },
                ]}
              />
            ) : null}

            <div
              className={
                createYamlMode
                  ? "min-h-0 flex-1 px-6 py-6"
                  : "min-h-0 flex-1 overflow-y-auto px-6 py-6"
              }
            >
              {createYamlMode ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <MonacoEditor
                      language="yaml"
                      theme="vs-dark"
                      value={createYamlText}
                      onChange={(value) => {
                        setCreateYamlText(value ?? "")
                        if (createYamlError) setCreateYamlError(null)
                      }}
                      options={MONACO_OPTIONS}
                      height="100%"
                    />
                  </div>
                  {createYamlError ? <FieldError className="mt-3">{createYamlError}</FieldError> : null}
                </div>
              ) : createStep === "basic" ? (
                <div>
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">基本信息</h3>
                    <p className="mt-1 text-sm text-muted-foreground">填写卷声明名称、所属项目和描述信息。</p>
                  </div>
                  <FieldGroup className="grid gap-6 md:grid-cols-2">
                    <Field data-invalid={Boolean(createNameError)}>
                      <FieldLabel htmlFor="volume-create-name">名称</FieldLabel>
                      <Input
                        id="volume-create-name"
                        value={createName}
                        onChange={(event) => {
                          setCreateName(event.target.value)
                          if (createNameError) setCreateNameError(null)
                        }}
                        placeholder="请输入卷声明名称"
                        autoComplete="off"
                        aria-invalid={Boolean(createNameError)}
                        disabled={creating}
                      />
                      {createNameError ? (
                        <FieldError>{createNameError}</FieldError>
                      ) : (
                        <FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>
                      )}
                    </Field>

                    <ProjectNamespaceField
                      id="volume-create-namespace"
                      options={namespaceOptions}
                      value={createNamespace}
                      onValueChange={(value) => {
                        setCreateNamespace(value)
                        if (createNamespaceError) setCreateNamespaceError(null)
                      }}
                      error={createNamespaceError}
                      description="选择卷声明所属项目。"
                      disabled={creating}
                      contentContainer={createDialogPopupLayerRef}
                    />

                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="volume-create-description">描述</FieldLabel>
                      <Textarea
                        id="volume-create-description"
                        value={createDescription}
                        onChange={(event) => setCreateDescription(event.target.value)}
                        placeholder="请输入描述"
                        maxLength={DESCRIPTION_MAX_LENGTH}
                        className="min-h-24"
                        disabled={creating}
                      />
                      <FieldDescription>
                        描述将写入资源注解 description，最长 {DESCRIPTION_MAX_LENGTH} 个字符。
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : createStep === "storage" ? (
                <div>
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">存储设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">设置访问模式、申请容量和存储类。</p>
                  </div>
                  <FieldGroup className="grid gap-6 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="volume-create-storage-class">存储类</FieldLabel>
                      <Select
                        value={createStorageClassName}
                        onValueChange={(value) => {
                          setCreateStorageClassName(value)
                          if (createStorageClassError) setCreateStorageClassError(null)
                        }}
                        disabled={creating}
                      >
                        <SelectTrigger id="volume-create-storage-class">
                          <SelectValue placeholder="请选择存储类" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {storageClassOptions.length > 0 ? (
                              storageClassOptions.map((option) => (
                                <SelectItem key={option.name} value={option.name}>
                                  {option.name}
                                </SelectItem>
                              ))
                            ) : (
                              <SelectItem value="__none__" disabled>
                                暂无可用存储类
                              </SelectItem>
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {createStorageClassError ? <FieldError>{createStorageClassError}</FieldError> : null}
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="volume-create-access-mode">访问模式</FieldLabel>
                      <Select
                        value={createAccessMode}
                        onValueChange={(value) => {
                          if (
                            value === "ReadWriteOnce" ||
                            value === "ReadOnlyMany" ||
                            value === "ReadWriteMany" ||
                            value === "ReadWriteOncePod"
                          ) {
                            setCreateAccessMode(value)
                          }
                        }}
                        disabled={creating}
                      >
                        <SelectTrigger id="volume-create-access-mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="ReadWriteOnce">ReadWriteOnce</SelectItem>
                            <SelectItem value="ReadOnlyMany">ReadOnlyMany</SelectItem>
                            <SelectItem value="ReadWriteMany">ReadWriteMany</SelectItem>
                            <SelectItem value="ReadWriteOncePod">ReadWriteOncePod</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field data-invalid={Boolean(createStorageError)}>
                      <FieldLabel htmlFor="volume-create-storage-request">申请容量</FieldLabel>
                      <InputGroup>
                        <InputGroupInput
                          id="volume-create-storage-request"
                          value={createStorageRequest}
                          onChange={(event) => {
                            setCreateStorageRequest(normalizeStorageRequest(event.target.value))
                            if (createStorageError) setCreateStorageError(null)
                          }}
                          inputMode="decimal"
                          placeholder="10"
                          autoComplete="off"
                          aria-invalid={Boolean(createStorageError)}
                          disabled={creating}
                        />
                        <InputGroupAddon align="inline-end">
                          <InputGroupText>Gi</InputGroupText>
                        </InputGroupAddon>
                      </InputGroup>
                      {createStorageError ? <FieldError>{createStorageError}</FieldError> : null}
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div>
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">补充标签与注解信息，便于检索、分类和后续治理。</p>
                  </div>
                  <FieldGroup className="grid gap-6 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <ResourceMetadataEditor
                        checked={metadataEnabled}
                        onCheckedChange={setMetadataEnabled}
                        labels={labelEntries}
                        setLabels={setLabelEntries}
                        annotations={annotationEntries}
                        setAnnotations={setAnnotationEntries}
                        description={createDescription}
                        setDescription={setCreateDescription}
                        disabled={creating}
                      />
                    </Field>
                  </FieldGroup>
                </div>
              )}

              {createSubmitError ? <FieldError className="mt-4">{createSubmitError}</FieldError> : null}
            </div>

            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                {createYamlMode || createStep === "basic" ? (
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating || checkingCreateNext}>
                      取消
                    </Button>
                  </DialogClose>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateStep(createStep === "advanced" ? "storage" : "basic")}
                    disabled={creating || checkingCreateNext}
                  >
                    上一步
                  </Button>
                )}

                {createYamlMode || createStep === "advanced" ? (
                  <Button
                    type="button"
                    onClick={() => void handleCreateSubmit()}
                    disabled={creating || checkingCreateNext}
                  >
                    {creating ? "创建中..." : "创建"}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void handleCreateNext()} disabled={creating || checkingCreateNext}>
                    {checkingCreateNext && createStep === "basic" ? "校验中..." : "下一步"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <MonacoViewerDialog
        title="查看YAML"
        subtitle={yamlSubtitle}
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeletePvcRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeletePvcRow(null)
        }}
        title="删除持久卷声明"
        description={
          pendingDeletePvcRow ? `确定删除持久卷声明 ${pendingDeletePvcRow.name} 吗？` : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDeletePvc}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeletePvRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeletePvRow(null)
        }}
        title="删除持久卷"
        description={pendingDeletePvRow ? `确定删除持久卷 ${pendingDeletePvRow.name} 吗？` : ""}
        deleting={deleting}
        onConfirm={handleConfirmDeletePv}
      />
      {view === "PVC" ? (
        <DataTable
          data={filteredPvcRows}
          columns={pvcColumns}
          toolbarStart={volumeTabs}
          toolbarEnd={volumeFilters}
          onCreate={() => {
            resetCreateForm()
            setCreateDialogOpen(true)
          }}
          onDeleteSelectedRows={handleDeleteSelectedPvcRows}
        />
      ) : (
        <DataTable
          data={filteredPvRows}
          columns={pvColumns}
          toolbarStart={volumeTabs}
          toolbarEnd={volumeFilters}
          onDeleteSelectedRows={handleDeleteSelectedPvRows}
        />
      )}
    </>
  )
}

