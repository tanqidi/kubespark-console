
"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconAdjustments, IconEye, IconPencil, IconPlus, IconRoute2, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { AdvancedToggleCard } from "@/app/(console)/dashboard/components/resource-pages/advanced-toggle-card"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { fetchResourceCollection } from "@/app/lib/kubespark/common"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { deleteIngress } from "@/app/lib/kubespark/resource-delete"
import {
  fetchRouteRows,
  type RouteResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import {
  checkIngressExists,
  createIngress,
  fetchIngressFormValues,
  updateIngress,
  type IngressPathType,
} from "@/app/lib/kubespark/routes"
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
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

type RouteRow = RouteResourceRow
type RouteCreateStep = "basic" | "rule" | "advanced"
type RouteRuleViewMode = "list" | "edit"
type NamespaceOption = { id: string; name: string }
type ServiceOption = { name: string; ports: number[] }
type PathType = IngressPathType
type RouteProtocol = "HTTP" | "HTTPS"
type MetadataEntry = { key: string; value: string }
type RouteRuleItem = {
  host: string
  path: string
  serviceName: string
  servicePort: string
  protocol: RouteProtocol
  tlsSecretName: string
}
const DEFAULT_PATH_TYPE: PathType = "ImplementationSpecific"

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

const routeColumns: ColumnConfig<RouteRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  { key: "path", label: "路径" },
  { key: "service", label: "服务" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新日期" },
]

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字和连字符（-），必须以小写字母或数字开头和结尾，最长 253 个字符。"
const ROUTE_RULE_REQUIRED_MESSAGE = "先添加一条路由规则，再继续创建资源。"

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function validateRouteName(name: string): string | null {
  const value = name.trim().toLowerCase()
  if (!value) return "请输入名称"
  if (value.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) return NAME_RULE_MESSAGE
  return null
}

function validateHost(host: string): string | null {
  const value = host.trim()
  if (!value) return "请输入域名"
  return null
}

function validatePath(path: string): string | null {
  const value = path.trim()
  if (!value) return "请输入路径"
  if (!value.startsWith("/")) return "路径必须以 / 开头"
  return null
}

function validateServicePortText(portText: string): string | null {
  const value = portText.trim()
  if (!value || !/^\d+$/.test(value)) return "服务端口必须是 1-65535 的整数"
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return "服务端口必须是 1-65535 的整数"
  }
  return null
}

function normalizeServicePortInput(rawValue: string): string {
  const digits = rawValue.replace(/[^0-9]/g, "").slice(0, 5)
  if (!digits) return ""
  const port = Number(digits)
  if (!Number.isFinite(port)) return ""
  if (port > 65535) return "65535"
  return digits
}

function normalizeRuleItem(item: RouteRuleItem): RouteRuleItem {
  return {
    host: item.host.trim(),
    path: item.path.trim(),
    serviceName: item.serviceName.trim(),
    servicePort: normalizeServicePortInput(item.servicePort),
    protocol: item.protocol,
    tlsSecretName: item.tlsSecretName.trim(),
  }
}

function normalizeHostKey(host: string): string {
  return host.trim().toLowerCase()
}

function buildRouteYamlText(params: {
  name: string
  namespace: string
  description: string
  rules: RouteRuleItem[]
  ingressClassName: string
}): string {
  const normalizedRules = params.rules.map(normalizeRuleItem).filter((rule) => rule.host && rule.path && rule.serviceName && rule.servicePort)
  const tlsMap = new Map<string, Set<string>>()
  const pathsByHost = new Map<
    string,
    Array<{
      path: string
      serviceName: string
      servicePort: string
    }>
  >()
  normalizedRules.forEach((rule) => {
    if (rule.protocol !== "HTTPS" || !rule.tlsSecretName) return
    const hosts = tlsMap.get(rule.tlsSecretName) ?? new Set<string>()
    hosts.add(rule.host)
    tlsMap.set(rule.tlsSecretName, hosts)
  })
  normalizedRules.forEach((rule) => {
    const paths = pathsByHost.get(rule.host) ?? []
    paths.push({
      path: rule.path,
      serviceName: rule.serviceName,
      servicePort: rule.servicePort,
    })
    pathsByHost.set(rule.host, paths)
  })
  return stringify(
    {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(params.namespace.trim() ? { namespace: params.namespace.trim() } : {}),
        ...(
          params.description.trim()
            ? {
                annotations: {
                  ...(params.description.trim() ? { description: params.description.trim() } : {}),
                },
              }
            : {}
        ),
      },
      spec: {
        ...(params.ingressClassName.trim()
          ? { ingressClassName: params.ingressClassName.trim() }
          : {}),
        ...(tlsMap.size > 0
          ? {
              tls: Array.from(tlsMap.entries()).map(([secretName, hosts]) => ({
                secretName,
                hosts: Array.from(hosts),
              })),
            }
          : {}),
        rules: Array.from(pathsByHost.entries()).map(([host, paths]) => ({
          host,
          http: {
            paths: paths.map((pathRule) => ({
              path: pathRule.path,
              pathType: DEFAULT_PATH_TYPE,
              backend: {
                service: {
                  name: pathRule.serviceName,
                  port: { number: Number(pathRule.servicePort) },
                },
              },
            })),
          },
        })),
      },
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parseRouteYamlText(yamlText: string): {
  name: string
  namespace: string
  description: string
  rules: RouteRuleItem[]
  host: string
  path: string
  serviceName: string
  servicePort: string
  pathType: PathType
  protocol: RouteProtocol
  tlsSecretName: string
  ingressClassName: string
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
  if (kind && kind !== "Ingress") {
    throw new Error("YAML 资源类型必须是 Ingress")
  }

  const metadata = asObject(root.metadata)
  const annotations = asObject(metadata.annotations)
  const spec = asObject(root.spec)
  const tlsEntries = Array.isArray(spec.tls) ? spec.tls : []
  const tlsSecretByHost = new Map<string, string>()
  tlsEntries.forEach((entry) => {
    const tlsEntry = asObject(entry)
    const secretName = typeof tlsEntry.secretName === "string" ? tlsEntry.secretName : ""
    const hosts = Array.isArray(tlsEntry.hosts) ? tlsEntry.hosts : []
    hosts.forEach((host) => {
      if (typeof host === "string" && host.trim()) tlsSecretByHost.set(host.trim(), secretName)
    })
  })
  const rules = Array.isArray(spec.rules) ? spec.rules : []
  const parsedRules: RouteRuleItem[] = []
  rules.forEach((rule) => {
    const ruleObj = asObject(rule)
    const host = typeof ruleObj.host === "string" ? ruleObj.host : ""
    const http = asObject(ruleObj.http)
    const paths = Array.isArray(http.paths) ? http.paths : []
    paths.forEach((pathItem) => {
      const firstPath = asObject(pathItem)
      const backend = asObject(firstPath.backend)
      const service = asObject(backend.service)
      const port = asObject(service.port)
      const servicePort = asNumber(port.number)
      const tlsSecretName = tlsSecretByHost.get(host) ?? ""
      parsedRules.push({
        host,
        path: typeof firstPath.path === "string" ? firstPath.path : "",
        serviceName: typeof service.name === "string" ? service.name : "",
        servicePort: servicePort && servicePort > 0 ? normalizeServicePortInput(String(servicePort)) : "",
        protocol: tlsSecretName ? "HTTPS" : "HTTP",
        tlsSecretName,
      })
    })
  })
  const firstRule = parsedRules[0] ?? {
    host: "",
    path: "/",
    serviceName: "",
    servicePort: "",
    protocol: "HTTP" as RouteProtocol,
    tlsSecretName: "",
  }

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    namespace: typeof metadata.namespace === "string" ? metadata.namespace : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
    rules: parsedRules,
    host: firstRule.host,
    path: firstRule.path,
    serviceName: firstRule.serviceName,
    servicePort: firstRule.servicePort,
    pathType: DEFAULT_PATH_TYPE,
    protocol: firstRule.protocol,
    tlsSecretName: firstRule.tlsSecretName,
    ingressClassName: typeof spec.ingressClassName === "string" ? spec.ingressClassName : "",
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
export function RoutesPageClient() {
  const createDialogContainerRef = React.useRef<HTMLDivElement | null>(null)
  const createDialogPopupLayerRef = React.useRef<HTMLDivElement | null>(null)
  const [rows, setRows] = React.useState<RouteRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<RouteRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editingRouteRef, setEditingRouteRef] = React.useState<{ name: string; namespace: string } | null>(null)
  const [createStep, setCreateStep] = React.useState<RouteCreateStep>("basic")
  const [createRuleViewMode, setCreateRuleViewMode] = React.useState<RouteRuleViewMode>("list")
  const [creating, setCreating] = React.useState(false)
  const [checkingCreateNext, setCheckingCreateNext] = React.useState(false)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)

  const [namespaceOptions, setNamespaceOptions] = React.useState<NamespaceOption[]>([])
  const [serviceOptions, setServiceOptions] = React.useState<ServiceOption[]>([])
  const [secretOptions, setSecretOptions] = React.useState<string[]>([])

  const [createName, setCreateName] = React.useState("")
  const [createNamespace, setCreateNamespace] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createHost, setCreateHost] = React.useState("")
  const [createPath, setCreatePath] = React.useState("/")
  const [createServiceName, setCreateServiceName] = React.useState("")
  const [createServicePort, setCreateServicePort] = React.useState("")
  const [createProtocol, setCreateProtocol] = React.useState<RouteProtocol>("HTTP")
  const [createTlsSecretName, setCreateTlsSecretName] = React.useState("")
  const [createRules, setCreateRules] = React.useState<RouteRuleItem[]>([])
  const [editingRuleIndex, setEditingRuleIndex] = React.useState<number | null>(null)
  const [pendingDeleteRuleHostKey, setPendingDeleteRuleHostKey] = React.useState<string | null>(null)
  const [createIngressClassName, setCreateIngressClassName] = React.useState("")

  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createNamespaceError, setCreateNamespaceError] = React.useState<string | null>(null)
  const [createHostError, setCreateHostError] = React.useState<string | null>(null)
  const [createPathError, setCreatePathError] = React.useState<string | null>(null)
  const [createServiceError, setCreateServiceError] = React.useState<string | null>(null)
  const [createServicePortError, setCreateServicePortError] = React.useState<string | null>(null)
  const [createTlsSecretError, setCreateTlsSecretError] = React.useState<string | null>(null)
  const [createSubmitError, setCreateSubmitError] = React.useState<string | null>(null)
  const [metadataEnabled, setMetadataEnabled] = React.useState(false)
  const [annotationEntries, setAnnotationEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [labelEntries, setLabelEntries] = React.useState<MetadataEntry[]>([
    { key: "", value: "" },
  ])
  const [ruleRowErrorMap, setRuleRowErrorMap] = React.useState<Record<number, string>>({})
  const [ruleSaveAttempted, setRuleSaveAttempted] = React.useState(false)
  const [draftHostKey, setDraftHostKey] = React.useState<string | null>(null)
  const createServicePortRef = React.useRef("")
  const isEditMode = Boolean(editingRouteRef)

  React.useEffect(() => {
    createServicePortRef.current = createServicePort
  }, [createServicePort])

  const hasConfiguredRule = React.useMemo(
    () => createRules.length > 0,
    [createRules]
  )
  const currentHostKey = React.useMemo(() => normalizeHostKey(createHost), [createHost])
  const editingSourceHostKey = React.useMemo(() => {
    if (editingRuleIndex === null) return null
    const target = createRules[editingRuleIndex]
    return target ? normalizeHostKey(target.host) : null
  }, [createRules, editingRuleIndex])
  const activeHostSourceKey = editingSourceHostKey ?? draftHostKey ?? currentHostKey
  const currentHostPathRuleIndexes = React.useMemo(() => {
    if (activeHostSourceKey === null) return []
    return createRules.reduce<number[]>((acc, rule, index) => {
      if (normalizeHostKey(rule.host) === activeHostSourceKey) acc.push(index)
      return acc
    }, [])
  }, [activeHostSourceKey, createRules])
  const duplicatePathRuleIndexSet = React.useMemo(() => {
    const indexSet = new Set<number>()
    const pathFirstIndex = new Map<string, number>()
    currentHostPathRuleIndexes.forEach((index) => {
      const rule = createRules[index]
      if (!rule) return
      const key = rule.path.trim()
      if (!key) return
      const first = pathFirstIndex.get(key)
      if (first === undefined) {
        pathFirstIndex.set(key, index)
        return
      }
      indexSet.add(first)
      indexSet.add(index)
    })
    return indexSet
  }, [createRules, currentHostPathRuleIndexes])
  const routeRuleHostGroups = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        host: string
        protocol: RouteProtocol
        tlsSecretName: string
        summaries: string[]
      }
    >()
    createRules.forEach((rule) => {
      const hostKey = normalizeHostKey(rule.host)
      if (!hostKey) return
      const summary = `${rule.path || "-"} -> ${rule.serviceName || "-"}:${rule.servicePort || "-"}`
      const existing = groups.get(hostKey)
      if (existing) {
        existing.summaries.push(summary)
        return
      }
      groups.set(hostKey, {
        host: rule.host || "-",
        protocol: rule.protocol,
        tlsSecretName: rule.tlsSecretName,
        summaries: [summary],
      })
    })
    return Array.from(groups.entries()).map(([hostKey, group]) => ({ hostKey, ...group }))
  }, [createRules])
  const canNavigateCreateSteps = !creating && !(createStep === "rule" && createRuleViewMode === "edit")

  const resetCreateForm = React.useCallback(() => {
    setEditingRouteRef(null)
    setCreateStep("basic")
    setCreateRuleViewMode("list")
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCheckingCreateNext(false)
    setCreateName("")
    setCreateNamespace("")
    setCreateDescription("")
    setCreateHost("")
    setCreatePath("/")
    setCreateServiceName("")
    setCreateServicePort("")
    setCreateProtocol("HTTP")
    setCreateTlsSecretName("")
    setCreateRules([])
    setDraftHostKey(null)
    setEditingRuleIndex(null)
    setPendingDeleteRuleHostKey(null)
    setCreateIngressClassName("")
    setCreateNameError(null)
    setCreateNamespaceError(null)
    setCreateHostError(null)
    setCreatePathError(null)
    setCreateServiceError(null)
    setCreateServicePortError(null)
    setCreateTlsSecretError(null)
    setCreateSubmitError(null)
    setMetadataEnabled(false)
    setAnnotationEntries([{ key: "", value: "" }])
    setLabelEntries([{ key: "", value: "" }])
    setRuleRowErrorMap({})
    setRuleSaveAttempted(false)
  }, [])

  React.useEffect(() => {
    if (!createDialogOpen) return
    let cancelled = false
    void fetchNamespaces()
      .then((namespaces) => {
        if (cancelled) return
        const mapped = namespaces
          .map((item) => item.name.trim())
          .filter((item) => item.length > 0)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ id: name, name }))
        setNamespaceOptions(mapped)
        if (!createNamespace && mapped.length > 0) {
          setCreateNamespace(mapped[0]?.name ?? "")
        }
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("[Routes] load namespace options failed", loadError)
        setNamespaceOptions([])
      })
    return () => {
      cancelled = true
    }
  }, [createDialogOpen, createNamespace])

  React.useEffect(() => {
    if (!createDialogOpen) return
    const namespace = createNamespace.trim()
    if (!namespace) {
      setServiceOptions([])
      setSecretOptions([])
      setCreateServiceName("")
      setCreateServicePort("")
      setCreateTlsSecretName("")
      return
    }

    let cancelled = false
    void fetchResourceCollection("core", "v1", "services", { namespace })
      .then((result) => {
        if (cancelled) return
        const mapped = (
          result.items as Array<{
            metadata?: { name?: string }
            spec?: { ports?: Array<{ port?: number }> }
          }>
        )
          .map((item) => ({
            name: item.metadata?.name?.trim() ?? "",
            ports:
              item.spec?.ports
                ?.map((port) => (typeof port.port === "number" ? port.port : null))
                .filter((port): port is number => typeof port === "number" && port > 0) ?? [],
          }))
          .filter((item) => item.name.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name))
        setServiceOptions(mapped)

        const currentServiceExists = mapped.some((item) => item.name === createServiceName)
        if (!currentServiceExists) {
          setCreateServiceName("")
        } else {
          const selected = mapped.find((item) => item.name === createServiceName)
          if (selected?.ports.length === 1) {
            setCreateServicePort(String(selected.ports[0]))
          } else if (!createServicePortRef.current.trim()) {
            setCreateServicePort("")
          }
        }
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("[Routes] load service options failed", loadError)
        setServiceOptions([])
      })

    void fetchResourceCollection("core", "v1", "secrets", { namespace })
      .then((result) => {
        if (cancelled) return
        const names = (
          result.items as Array<{
            metadata?: { name?: string }
          }>
        )
          .map((item) => item.metadata?.name?.trim() ?? "")
          .filter((name) => name.length > 0)
          .sort((a, b) => a.localeCompare(b))
        setSecretOptions(names)
        if (createProtocol === "HTTPS" && !names.includes(createTlsSecretName)) {
          setCreateTlsSecretName("")
        }
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("[Routes] load secret options failed", loadError)
        setSecretOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [createDialogOpen, createNamespace, createProtocol, createServiceName, createTlsSecretName])

  React.useEffect(() => {
    if (createProtocol === "HTTP") {
      if (createTlsSecretName) setCreateTlsSecretName("")
      if (createTlsSecretError) setCreateTlsSecretError(null)
    }
  }, [createProtocol, createTlsSecretError, createTlsSecretName])

  React.useEffect(() => {
    if (createStep !== "rule" || createRuleViewMode !== "edit") return
    if (editingRuleIndex !== null) return
    if (draftHostKey === null) return

    const nextHostKey = normalizeHostKey(createHost)
    if (nextHostKey === draftHostKey) return

    setCreateRules((current) =>
      current.map((rule) =>
        normalizeHostKey(rule.host) === draftHostKey
          ? normalizeRuleItem({
              ...rule,
              host: createHost,
              protocol: createProtocol,
              tlsSecretName: createProtocol === "HTTPS" ? createTlsSecretName : "",
            })
          : rule
      )
    )
    setDraftHostKey(nextHostKey)
  }, [
    createHost,
    createProtocol,
    createRuleViewMode,
    createStep,
    createTlsSecretName,
    draftHostKey,
    editingRuleIndex,
  ])

  const buildCreateYaml = React.useCallback(() => {
    return buildRouteYamlText({
      name: createName,
      namespace: createNamespace,
      description: createDescription,
      rules: createRules,
      ingressClassName: createIngressClassName,
    })
  }, [
    createDescription,
    createIngressClassName,
    createName,
    createNamespace,
    createRules,
  ])

  const validateBasicStep = React.useCallback(() => {
    const nameError = validateRouteName(createName)
    const namespaceError = createNamespace.trim() ? null : "请选择项目"
    setCreateNameError(nameError)
    setCreateNamespaceError(namespaceError)
    return !nameError && !namespaceError
  }, [createName, createNamespace])

  const validateRuleStep = React.useCallback(() => {
    const hostError = validateHost(createHost)
    const pathError = validatePath(createPath)
    const serviceError = createServiceName.trim() ? null : "请选择服务"
    const servicePortError = validateServicePortText(createServicePort)
    const tlsSecretError =
      createProtocol === "HTTPS" && !createTlsSecretName.trim()
        ? "请选择 HTTPS 保密字典"
        : null
    const normalizedHost = createHost.trim().toLowerCase()
    const duplicateHost = createRules.some((rule, index) => {
      if (editingRuleIndex !== null && index === editingRuleIndex) return false
      return rule.host.trim().toLowerCase() === normalizedHost
    })
    const duplicateHostError = duplicateHost
      ? `域名 ${createHost.trim()} 重复，请更换后重试`
      : null
    setCreateHostError(hostError)
    setCreatePathError(pathError)
    setCreateServiceError(serviceError)
    setCreateServicePortError(servicePortError)
    setCreateTlsSecretError(tlsSecretError)
    if (!hostError && duplicateHostError) setCreateHostError(duplicateHostError)
    return !hostError && !pathError && !serviceError && !servicePortError && !tlsSecretError && !duplicateHostError
  }, [createHost, createPath, createProtocol, createRules, createServiceName, createServicePort, createTlsSecretName, editingRuleIndex])

  const beginEditRule = React.useCallback(() => {
    setCreateSubmitError(null)
    setRuleSaveAttempted(false)
    setCreateHost("")
    setCreatePath("/")
    setCreateServiceName("")
    setCreateServicePort("")
    setCreateProtocol("HTTP")
    setCreateTlsSecretName("")
    setCreateHostError(null)
    setCreatePathError(null)
    setCreateServiceError(null)
    setCreateServicePortError(null)
    setCreateTlsSecretError(null)
    setRuleRowErrorMap({})
    setDraftHostKey("")
    setCreateRules((current) => [
      ...current,
      normalizeRuleItem({
        host: "",
        path: "/",
        serviceName: "",
        servicePort: "",
        protocol: "HTTP",
        tlsSecretName: "",
      }),
    ])
    setEditingRuleIndex(null)
    setCreateRuleViewMode("edit")
  }, [])

  const cancelEditRule = React.useCallback(() => {
    setCreateSubmitError(null)
    if (editingRuleIndex === null && draftHostKey !== null) {
      setCreateRules((current) =>
        current.filter((rule) => normalizeHostKey(rule.host) !== draftHostKey)
      )
    }
    setDraftHostKey(null)
    setEditingRuleIndex(null)
    setRuleRowErrorMap({})
    setCreateRuleViewMode("list")
  }, [draftHostKey, editingRuleIndex])

  const saveRuleDraft = React.useCallback((options?: { stayInEdit?: boolean }) => {
    setCreateSubmitError(null)
    setRuleRowErrorMap({})
    const hostError = validateHost(createHost)
    const tlsSecretError =
      createProtocol === "HTTPS" && !createTlsSecretName.trim()
        ? "请选择 HTTPS 保密字典"
        : null
    setCreateHostError(hostError)
    setCreateTlsSecretError(tlsSecretError)
    setCreatePathError(null)
    setCreateServiceError(null)
    setCreateServicePortError(null)
    if (hostError || tlsSecretError) return false
    const targetIndexes = createRules.reduce<number[]>((acc, rule, index) => {
      if (normalizeHostKey(rule.host) === activeHostSourceKey) acc.push(index)
      return acc
    }, [])
    if (targetIndexes.length === 0) {
      setRuleSaveAttempted(true)
      return false
    }

    const rowErrors: Record<number, string> = {}
    for (let i = 0; i < targetIndexes.length; i += 1) {
      const index = targetIndexes[i] ?? 0
      const rule = createRules[index]
      if (!rule) continue
      const pathError = validatePath(rule.path)
      if (pathError) {
        rowErrors[index] = pathError
        continue
      }
      if (!rule.serviceName.trim()) {
        rowErrors[index] = "请选择服务"
        continue
      }
      const portError = validateServicePortText(rule.servicePort)
      if (portError) {
        rowErrors[index] = portError
      }
    }
    const hostPathSet = new Map<string, number>()
    for (let i = 0; i < targetIndexes.length; i += 1) {
      const index = targetIndexes[i] ?? 0
      const rule = createRules[index]
      if (!rule) continue
      const pathKey = rule.path.trim()
      const firstIndex = hostPathSet.get(pathKey)
      if (firstIndex !== undefined) {
        rowErrors[firstIndex] = "路径重复"
        rowErrors[index] = "路径重复"
      } else {
        hostPathSet.set(pathKey, index)
      }
    }
    if (Object.keys(rowErrors).length > 0) {
      setRuleRowErrorMap(rowErrors)
      return false
    }

    setCreateRules((current) =>
      current.map((rule, index) =>
        targetIndexes.includes(index)
          ? normalizeRuleItem({
              ...rule,
              host: createHost,
              protocol: createProtocol,
              tlsSecretName: createProtocol === "HTTPS" ? createTlsSecretName : "",
            })
          : rule
      )
    )
    setRuleSaveAttempted(false)
    setRuleRowErrorMap({})
    setDraftHostKey(null)
    setCreateRuleViewMode(options?.stayInEdit ? "edit" : "list")
    setEditingRuleIndex(null)
    return true
  }, [activeHostSourceKey, createHost, createProtocol, createRules, createTlsSecretName])

  const addPathRule = React.useCallback(() => {
    setCreateRules((current) => [
      ...current,
      normalizeRuleItem({
        host: createHost,
        path: "/",
        serviceName: "",
        servicePort: "",
        protocol: createProtocol,
        tlsSecretName: createProtocol === "HTTPS" ? createTlsSecretName : "",
      }),
    ])
    setRuleSaveAttempted(false)
    setCreateSubmitError(null)
    setRuleRowErrorMap({})
  }, [createHost, createProtocol, createTlsSecretName])

  const handleCreateNext = React.useCallback(async () => {
    if (creating || checkingCreateNext) return
    setCreateSubmitError(null)
    if (createStep === "basic") {
      if (!validateBasicStep()) return
      if (isEditMode) {
        setRuleSaveAttempted(false)
        setCreateStep("rule")
        return
      }
      setCheckingCreateNext(true)
      try {
        const exists = await checkIngressExists({
          name: createName.trim().toLowerCase(),
          namespace: createNamespace.trim(),
        })
        if (exists) {
          setCreateNameError("路由名称已存在，请更换后重试")
          return
        }
        setRuleSaveAttempted(false)
        setCreateStep("rule")
      } catch (checkError) {
        setCreateSubmitError(checkError instanceof Error ? checkError.message : "路由名称校验失败，请稍后重试")
      } finally {
        setCheckingCreateNext(false)
      }
      return
    }
    if (createStep === "rule") {
      if (createRuleViewMode === "edit") {
        const saved = saveRuleDraft()
        if (!saved) return
      }
      if (!hasConfiguredRule) {
        setRuleSaveAttempted(true)
        return
      }
      setCreateStep("advanced")
    }
  }, [
    createRuleViewMode,
    checkingCreateNext,
    createName,
    createNamespace,
    createStep,
    creating,
    hasConfiguredRule,
    isEditMode,
    saveRuleDraft,
    validateBasicStep,
  ])

  const handleCreateSubmit = React.useCallback(async () => {
    if (creating) return
    setCreateSubmitError(null)
    setRuleSaveAttempted(false)

    let draft = {
      name: createName,
      namespace: createNamespace,
      description: createDescription,
      rules: createRules.map((rule) => normalizeRuleItem(rule)),
      ingressClassName: createIngressClassName,
      host: createHost,
      path: createPath,
      serviceName: createServiceName,
      servicePort: createServicePort,
      pathType: DEFAULT_PATH_TYPE,
      protocol: createProtocol,
      tlsSecretName: createTlsSecretName,
    }

    if (createYamlMode) {
      try {
        draft = parseRouteYamlText(createYamlText)
        if (isEditMode && editingRouteRef) {
          draft = {
            ...draft,
            name: editingRouteRef.name,
            namespace: editingRouteRef.namespace,
          }
        }
        setCreateName(draft.name)
        setCreateNamespace(draft.namespace)
        setCreateDescription(draft.description)
        setCreateHost(draft.host)
        setCreatePath(draft.path || "/")
        setCreateServiceName(draft.serviceName)
        setCreateServicePort(draft.servicePort)
        setCreateProtocol(draft.protocol)
        setCreateTlsSecretName(draft.tlsSecretName)
        setCreateRules(
          draft.rules.length > 0
            ? draft.rules.map((rule) => normalizeRuleItem(rule))
            : []
        )
        setCreateIngressClassName(draft.ingressClassName)
        setCreateRuleViewMode("list")
        setCreateYamlError(null)
      } catch (parseError) {
        setCreateYamlError(parseError instanceof Error ? parseError.message : "YAML 解析失败")
        return
      }
    }

    const nameError = validateRouteName(draft.name)
    const namespaceError = draft.namespace.trim() ? null : "请选择项目"
    const normalizedRules = draft.rules.map((rule) => normalizeRuleItem(rule))
    const hostError = normalizedRules.length === 0 ? ROUTE_RULE_REQUIRED_MESSAGE : null
    const hasInvalidRule = normalizedRules.some((rule) => {
      if (validateHost(rule.host)) return true
      if (validatePath(rule.path)) return true
      if (!rule.serviceName) return true
      if (validateServicePortText(rule.servicePort)) return true
      if (rule.protocol === "HTTPS" && !rule.tlsSecretName) return true
      return false
    })
    const duplicatePathHost = (() => {
      const hostPathSet = new Set<string>()
      for (const rule of normalizedRules) {
        const hostKey = normalizeHostKey(rule.host)
        const pathKey = rule.path.trim()
        if (!hostKey || !pathKey) continue
        const combined = `${hostKey}::${pathKey}`
        if (hostPathSet.has(combined)) return rule.host
        hostPathSet.add(combined)
      }
      return ""
    })()
    const pathError = hostError
      ? null
      : hasInvalidRule
          ? "存在未完整填写的路由规则"
          : null
    const serviceError = null
    const servicePortError = null
    const tlsSecretError = null

    setCreateNameError(nameError)
    setCreateNamespaceError(namespaceError)
    setCreateHostError(hostError)
    setCreatePathError(pathError)
    setCreateServiceError(serviceError)
    setCreateServicePortError(servicePortError)
    setCreateTlsSecretError(tlsSecretError)

    const firstError =
      nameError || namespaceError || hostError || pathError || serviceError || servicePortError || tlsSecretError
    if (firstError) {
      if (!createYamlMode) {
        if (nameError || namespaceError) setCreateStep("basic")
        else setCreateStep("rule")
      } else {
        setCreateYamlError(firstError)
      }
      return
    }
    if (duplicatePathHost) {
      const hostKey = normalizeHostKey(duplicatePathHost)
      const targetIndex = normalizedRules.findIndex(
        (rule) => normalizeHostKey(rule.host) === hostKey
      )
      if (!createYamlMode) {
        setCreateStep("rule")
        setCreateRuleViewMode("edit")
      }
      if (targetIndex >= 0) {
        const target = normalizedRules[targetIndex]
        if (target) {
          setCreateHost(target.host)
          setCreateProtocol(target.protocol)
          setCreateTlsSecretName(target.tlsSecretName)
          setEditingRuleIndex(
            createRules.findIndex((rule) => normalizeHostKey(rule.host) === hostKey)
          )
        }
      }
      return
    }

    setCreating(true)
    try {
      const payload = {
        name: draft.name.trim().toLowerCase(),
        namespace: draft.namespace.trim(),
        host: normalizedRules[0]?.host ?? "",
        path: normalizedRules[0]?.path ?? "/",
        serviceName: normalizedRules[0]?.serviceName ?? "",
        servicePort: Number(normalizedRules[0]?.servicePort ?? 0),
        pathType: DEFAULT_PATH_TYPE,
        protocol: normalizedRules[0]?.protocol ?? "HTTP",
        tlsSecretName:
          normalizedRules[0]?.protocol === "HTTPS" ? normalizedRules[0]?.tlsSecretName ?? "" : "",
        rules: normalizedRules.map((rule) => ({
          host: rule.host,
          path: rule.path,
          serviceName: rule.serviceName,
          servicePort: Number(rule.servicePort),
          pathType: DEFAULT_PATH_TYPE,
          protocol: rule.protocol,
          tlsSecretName: rule.protocol === "HTTPS" ? rule.tlsSecretName : "",
        })),
        ingressClassName: draft.ingressClassName.trim(),
        description: draft.description.trim(),
      }
      if (isEditMode) {
        await updateIngress(payload)
      } else {
        await createIngress(payload)
      }
      const mapped = await fetchRouteRows()
      setRows(mapped)
      setError(null)
      setCreateDialogOpen(false)
      resetCreateForm()
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : isEditMode ? "保存失败" : "创建失败"
      if (createYamlMode) {
        setCreateYamlError(message)
      } else {
        setCreateSubmitError(message)
      }
    } finally {
      setCreating(false)
    }
  }, [
    createDescription,
    createHost,
    createIngressClassName,
    createName,
    createNamespace,
    createPath,
    createProtocol,
    createRules,
    createServiceName,
    createServicePort,
    createTlsSecretName,
    createYamlMode,
    createYamlText,
    editingRouteRef,
    isEditMode,
    creating,
    resetCreateForm,
  ])

  const handleViewYaml = React.useCallback((row: RouteRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedResourceYaml("ingresses", row.namespace, row.name, {
      documentType: "ingress",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Routes] view yaml response", {
          ingress: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Routes] view yaml request failed", {
          ingress: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: RouteRow) => {
    setPendingDeleteRow(row)
  }, [])

  const requestEditRuleItem = React.useCallback((hostKey: string) => {
    const index = createRules.findIndex((rule) => normalizeHostKey(rule.host) === hostKey)
    if (index < 0) return
    const target = createRules[index]
    if (!target) return
    setCreateHost(target.host)
    setCreatePath(target.path || "/")
    setCreateServiceName(target.serviceName)
    setCreateServicePort(target.servicePort)
    setCreateProtocol(target.protocol)
    setCreateTlsSecretName(target.tlsSecretName)
    setCreateHostError(null)
    setCreatePathError(null)
    setCreateServiceError(null)
    setCreateServicePortError(null)
    setCreateTlsSecretError(null)
    setDraftHostKey(hostKey)
    setEditingRuleIndex(index)
    setCreateRuleViewMode("edit")
  }, [createRules])

  const removeRuleItem = React.useCallback((targetIndex: number) => {
    setCreateRules((current) => current.filter((_, index) => index !== targetIndex))
    setRuleRowErrorMap((current) => {
      const next: Record<number, string> = {}
      Object.entries(current).forEach(([key, message]) => {
        const index = Number(key)
        if (!Number.isInteger(index)) return
        if (index < targetIndex) next[index] = message
        if (index > targetIndex) next[index - 1] = message
      })
      return next
    })
    if (editingRuleIndex !== null && editingRuleIndex === targetIndex) {
      setEditingRuleIndex(null)
      setCreateRuleViewMode("list")
    } else if (editingRuleIndex !== null && editingRuleIndex > targetIndex) {
      setEditingRuleIndex(editingRuleIndex - 1)
    }
  }, [editingRuleIndex])

  const requestDeleteRuleItem = React.useCallback((hostKey: string) => {
    setPendingDeleteRuleHostKey(hostKey)
  }, [])

  const handleConfirmDeleteRuleItem = React.useCallback(() => {
    if (!pendingDeleteRuleHostKey) return
    setCreateRules((current) =>
      current.filter((rule) => normalizeHostKey(rule.host) !== pendingDeleteRuleHostKey)
    )
    setDraftHostKey(null)
    setEditingRuleIndex(null)
    setCreateRuleViewMode("list")
    setPendingDeleteRuleHostKey(null)
  }, [pendingDeleteRuleHostKey])

  const requestEdit = React.useCallback((row: RouteRow) => {
    if (creating || checkingCreateNext) return
    setCreateSubmitError(null)
    setCreateYamlError(null)
    setDraftHostKey(null)
    setCreateRuleViewMode("list")
    setCreateStep("basic")
    setCreateYamlMode(false)
    setCheckingCreateNext(true)

    void fetchIngressFormValues(row.name, row.namespace)
      .then((draft) => {
        const nextRules =
          draft.rules.length > 0
            ? draft.rules.map((rule) => normalizeRuleItem(rule))
            : [
                normalizeRuleItem({
                  host: draft.host,
                  path: draft.path || "/",
                  serviceName: draft.serviceName,
                  servicePort: draft.servicePort,
                  protocol: draft.protocol,
                  tlsSecretName: draft.tlsSecretName,
                }),
              ].filter((rule) => rule.host || rule.path || rule.serviceName || rule.servicePort)
        setEditingRouteRef({ name: row.name, namespace: row.namespace })
        setCreateName(draft.name)
        setCreateNamespace(draft.namespace)
        setCreateDescription(draft.description)
        setCreateHost(draft.host)
        setCreatePath(draft.path || "/")
        setCreateServiceName(draft.serviceName)
        setCreateServicePort(draft.servicePort)
        setCreateProtocol(draft.protocol)
        setCreateTlsSecretName(draft.tlsSecretName)
        setCreateRules(nextRules)
        setCreateIngressClassName(draft.ingressClassName)
        setCreateNameError(null)
        setCreateNamespaceError(null)
        setCreateHostError(null)
        setCreatePathError(null)
        setCreateServiceError(null)
        setCreateServicePortError(null)
        setCreateTlsSecretError(null)
        setRuleSaveAttempted(false)
        setCreateDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载路由配置失败"
        setError(message)
      })
      .finally(() => {
        setCheckingCreateNext(false)
      })
  }, [checkingCreateNext, creating])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteIngress(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Routes] delete request failed", {
          ingress: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: RouteRow[]) => {
    if (selectedRows.length === 0) return
    const uniqueIngressKeys = new Map<string, RouteRow>()
    selectedRows.forEach((row) => {
      uniqueIngressKeys.set(`${row.namespace}/${row.name}`, row)
    })

    void Promise.all(
      Array.from(uniqueIngressKeys.values()).map((row) =>
        deleteIngress(row.namespace, row.name)
      )
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Routes] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<RouteRow>({
        columns: routeColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
              </>
            ),
            onSelect: (row) => {
              handleViewYaml(row)
            },
          },
          {
            label: (
              <>
                <IconPencil className="size-4" />
                {"编辑"}
              </>
            ),
            onSelect: (row) => {
              requestEdit(row)
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
              requestDelete(row)
            },
          },
        ],
      }),
    [handleViewYaml, requestDelete, requestEdit]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const mapped = await fetchRouteRows()
        if (cancelled) return
        setRows(mapped)
        setError(null)
      } catch (loadError: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(resolveErrorMessage(loadError))
        } else {
          console.error("[Routes] polling refresh failed", loadError)
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

  const listNamespaceOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.namespace)))
        .sort((a, b) => a.localeCompare(b))
        .map((namespace) => ({ id: namespace, name: namespace })),
    [rows]
  )

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
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

  const nsQuery = namespaceQuery.trim().toLowerCase()
  const nmQuery = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (nsQuery && row.namespace.toLowerCase() !== nsQuery) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const routeFilters = (
    <>
      <FilterCombobox
        options={listNamespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"命名空间"}
        emptyText={"未找到命名空间"}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
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
          if (!open && (creating || checkingCreateNext)) return
          setCreateDialogOpen(open)
          if (!open) resetCreateForm()
        }}
      >
        <DialogContent
          ref={createDialogContainerRef}
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => {
            const target = event.target
            if (target instanceof Element && target.closest("[data-slot='combobox-content']")) {
              return
            }
            event.preventDefault()
          }}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <div ref={createDialogPopupLayerRef} className="pointer-events-none absolute inset-0 z-50" />
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>{isEditMode ? "编辑应用路由" : "创建应用路由"}</DialogTitle>
                <DialogDescription>
                  {isEditMode
                    ? "编辑 Kubernetes Ingress 的访问规则与高级配置。"
                    : "使用 Kubernetes Ingress 创建应用访问路由。"}
                </DialogDescription>
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
                        const parsed = parseRouteYamlText(createYamlText)
                        const nextName = isEditMode && editingRouteRef ? editingRouteRef.name : parsed.name
                        const nextNamespace = isEditMode && editingRouteRef ? editingRouteRef.namespace : parsed.namespace
                        setCreateName(nextName)
                        setCreateNamespace(nextNamespace)
                        setCreateDescription(parsed.description)
                        setCreateHost(parsed.host)
                        setCreatePath(parsed.path || "/")
                        setCreateServiceName(parsed.serviceName)
                        setCreateServicePort(parsed.servicePort)
                        setCreateProtocol(parsed.protocol)
                        setCreateTlsSecretName(parsed.tlsSecretName)
                        setCreateRules(parsed.rules.map((rule) => normalizeRuleItem(rule)))
                        setCreateIngressClassName(parsed.ingressClassName)
                        setCreateRuleViewMode("list")
                        setCreateYamlError(null)
                        setCreateYamlMode(false)
                      } catch (parseError: unknown) {
                        setCreateYamlError(parseError instanceof Error ? parseError.message : "YAML 解析失败")
                      }
                    }}
                    disabled={creating || checkingCreateNext}
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
                    status:
                      createStep === "basic"
                        ? "当前"
                        : createName.trim() && createNamespace.trim()
                          ? "已设置"
                          : "未设置",
                    active: createStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: !canNavigateCreateSteps,
                    onClick: () => setCreateStep("basic"),
                  },
                  {
                    id: "rule",
                    title: "路由规则",
                    status:
                      createStep === "rule"
                        ? "当前"
                        : hasConfiguredRule
                          ? "已设置"
                          : "未设置",
                    active: createStep === "rule",
                    icon: <IconRoute2 className="size-4" />,
                    disabled: !canNavigateCreateSteps,
                    onClick: () => setCreateStep("rule"),
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status:
                      createStep === "advanced"
                        ? "当前"
                        : createIngressClassName.trim()
                          ? "已设置"
                          : "未设置",
                    active: createStep === "advanced",
                    icon: <IconAdjustments className="size-4" />,
                    disabled: !canNavigateCreateSteps,
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
                    <p className="mt-1 text-sm text-muted-foreground">填写路由名称、项目和描述信息。</p>
                  </div>
                  <FieldGroup className="grid gap-6 md:grid-cols-2">
                    <Field data-invalid={Boolean(createNameError)}>
                      <FieldLabel htmlFor="route-create-name">名称</FieldLabel>
                      <Input id="route-create-name" value={createName} onChange={(event) => { setCreateName(event.target.value); if (createNameError) setCreateNameError(null) }} placeholder="请输入路由名称" autoComplete="off" aria-invalid={Boolean(createNameError)} disabled={creating || isEditMode} />
                      {createNameError ? (<FieldError>{createNameError}</FieldError>) : (<FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>)}
                    </Field>

                    <Field data-invalid={Boolean(createNamespaceError)}>
                      <FieldLabel htmlFor="route-create-namespace">项目</FieldLabel>
                      <Select value={createNamespace} onValueChange={(value) => { if (isEditMode) return; setCreateNamespace(value); if (createNamespaceError) setCreateNamespaceError(null) }} disabled={creating || isEditMode}>
                        <SelectTrigger id="route-create-namespace" aria-invalid={Boolean(createNamespaceError)}><SelectValue placeholder="请选择项目" /></SelectTrigger>
                        <SelectContent><SelectGroup>{namespaceOptions.map((option) => (<SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>))}</SelectGroup></SelectContent>
                      </Select>
                      {createNamespaceError ? (<FieldError>{createNamespaceError}</FieldError>) : (<FieldDescription>选择要创建路由的项目。</FieldDescription>)}
                    </Field>

                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="route-create-description">描述</FieldLabel>
                      <Textarea id="route-create-description" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="请输入描述（选填）" maxLength={256} className="min-h-24" disabled={creating} />
                      <FieldDescription>描述将写入资源注解 `description`，最长 256 个字符。</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              ) : createStep === "rule" ? (
                <div>
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">路由规则</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      配置域名、路径与后端服务映射关系。
                    </p>
                  </div>
                  {createRuleViewMode === "list" ? (
                    <>
                      <div className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
                        <div className="flex flex-col gap-0 pb-4">
                          {hasConfiguredRule ? (
                            <div className="flex flex-col gap-3">
                              {routeRuleHostGroups.map((group) => (
                                <Item
                                  key={`rule-host-${group.hostKey}`}
                                  variant="outline"
                                  size="sm"
                                  className="hover:bg-muted"
                                >
                                  <ItemContent className="min-w-0">
                                    <ItemTitle className="min-w-0 truncate">
                                      {group.host || "-"}
                                    </ItemTitle>
                                    <ItemDescription className="min-w-0 truncate">
                                      {`${group.protocol} ${group.summaries.join("；")}${group.protocol === "HTTPS" && group.tlsSecretName ? ` / Secret: ${group.tlsSecretName}` : ""}`}
                                    </ItemDescription>
                                  </ItemContent>
                                  <ItemActions className="pointer-events-none gap-2 opacity-0 transition-opacity group-hover/item:pointer-events-auto group-hover/item:opacity-100 group-focus-within/item:pointer-events-auto group-focus-within/item:opacity-100">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => requestEditRuleItem(group.hostKey)}
                                      disabled={creating}
                                    >
                                      <IconPencil data-icon="inline-start" />
                                      编辑
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => requestDeleteRuleItem(group.hostKey)}
                                      disabled={creating}
                                    >
                                      <IconTrash data-icon="inline-start" />
                                      删除
                                    </Button>
                                  </ItemActions>
                                </Item>
                              ))}
                            </div>
                          ) : (
                            <div
                              className={`rounded-lg border border-dashed px-4 py-10 text-center ${
                                ruleSaveAttempted ? "border-destructive" : ""
                              }`}
                            >
                              <div className={ruleSaveAttempted ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
                                暂无路由规则
                              </div>
                              <div className={ruleSaveAttempted ? "mt-1 text-sm text-destructive" : "mt-1 text-sm text-muted-foreground"}>
                                {ROUTE_RULE_REQUIRED_MESSAGE}
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            className="mt-3 flex w-full flex-col items-start rounded-lg border border-dashed px-4 py-4 text-left transition hover:border-foreground/30 hover:bg-accent/20"
                            onClick={beginEditRule}
                            disabled={creating}
                          >
                            <span className="text-sm font-semibold">添加路由规则</span>
                            <span className="mt-1 text-sm text-muted-foreground">
                              添加域名、路径和后端服务映射。
                            </span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <FieldGroup className="grid gap-6 md:grid-cols-2">
                        <Field data-invalid={Boolean(createHostError)}>
                          <FieldLabel htmlFor="route-create-host">域名</FieldLabel>
                                <InputGroup>
                                  <InputGroupAddon>
                                    <InputGroupText>域名</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                              id="route-create-host"
                              value={createHost}
                              onChange={(event) => {
                                setCreateHost(event.target.value)
                                if (createHostError) setCreateHostError(null)
                              }}
                              placeholder=""
                              autoComplete="off"
                              aria-invalid={Boolean(createHostError)}
                              disabled={creating}
                            />
                          </InputGroup>
                          {createHostError ? <FieldError>{createHostError}</FieldError> : null}
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="route-create-protocol">协议</FieldLabel>
                          <Select
                            value={createProtocol}
                            onValueChange={(value) => {
                              if (value === "HTTP" || value === "HTTPS") {
                                setCreateProtocol(value)
                              }
                            }}
                            disabled={creating}
                          >
                            <SelectTrigger id="route-create-protocol">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="HTTP">HTTP</SelectItem>
                                <SelectItem value="HTTPS">HTTPS</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>

                        {createProtocol === "HTTPS" ? (
                          <Field className="md:col-span-2" data-invalid={Boolean(createTlsSecretError)}>
                            <FieldLabel htmlFor="route-create-secret">保密字典</FieldLabel>
                            <Select
                              value={createTlsSecretName}
                              onValueChange={(value) => {
                                setCreateTlsSecretName(value)
                                if (createTlsSecretError) setCreateTlsSecretError(null)
                              }}
                              disabled={creating}
                            >
                              <SelectTrigger id="route-create-secret" aria-invalid={Boolean(createTlsSecretError)}>
                                <SelectValue placeholder="请选择 Secret" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {secretOptions.length > 0 ? (
                                    secretOptions.map((option) => (
                                      <SelectItem key={option} value={option}>
                                        {option}
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="__none__" disabled>
                                      当前项目暂无可选 Secret
                                    </SelectItem>
                                  )}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {createTlsSecretError ? <FieldError>{createTlsSecretError}</FieldError> : null}
                          </Field>
                        ) : null}

                        <Field className="md:col-span-2">
                          <FieldLabel>路径</FieldLabel>
                          {currentHostPathRuleIndexes.length > 0 ? (
                            <div className="mt-3 flex flex-col gap-2">
                              {currentHostPathRuleIndexes.map((ruleIndex) => {
                                const rule = createRules[ruleIndex]
                                if (!rule) return null
                                const rowErrorMessage = duplicatePathRuleIndexSet.has(ruleIndex)
                                  ? "路径重复"
                                  : (ruleRowErrorMap[ruleIndex] ?? null)
                                return (
                                <div
                                  key={`route-path-row-${ruleIndex}`}
                                  className="grid items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                                >
                                  <div className="flex flex-col gap-1">
                                    <InputGroup>
                                      <InputGroupAddon>
                                        <InputGroupText>路径</InputGroupText>
                                      </InputGroupAddon>
                                      <InputGroupInput
                                        value={rule.path}
                                        onChange={(event) => {
                                          const nextPath = event.target.value
                                          setCreateRules((current) =>
                                            current.map((item, itemIndex) =>
                                              itemIndex === ruleIndex ? { ...item, path: nextPath } : item
                                            )
                                          )
                                          if (ruleRowErrorMap[ruleIndex]) {
                                            setRuleRowErrorMap((current) => {
                                              const next = { ...current }
                                              delete next[ruleIndex]
                                              return next
                                            })
                                          }
                                        }}
                                        placeholder="/"
                                        autoComplete="off"
                                        aria-invalid={
                                          duplicatePathRuleIndexSet.has(ruleIndex) ||
                                          Boolean(ruleRowErrorMap[ruleIndex])
                                        }
                                        disabled={creating}
                                      />
                                    </InputGroup>
                                    {rowErrorMessage ? (
                                      <FieldError>{rowErrorMessage}</FieldError>
                                    ) : null}
                                  </div>
                                  <FilterCombobox
                                    options={serviceOptions.map((option) => ({ id: option.name, name: option.name }))}
                                    value={rule.serviceName}
                                    onValueChange={(value) => {
                                      const next = serviceOptions.find((item) => item.name === value)
                                      const nextPort =
                                        next?.ports.length === 1 ? String(next.ports[0]) : ""
                                      setCreateRules((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === ruleIndex
                                            ? { ...item, serviceName: value, servicePort: nextPort }
                                            : item
                                        )
                                      )
                                      if (ruleRowErrorMap[ruleIndex]) {
                                        setRuleRowErrorMap((current) => {
                                          const nextMap = { ...current }
                                          delete nextMap[ruleIndex]
                                          return nextMap
                                        })
                                      }
                                    }}
                                    placeholder="服务"
                                    emptyText="当前项目暂无可选服务"
                                    className="w-full"
                                    disabled={creating}
                                    contentContainer={createDialogPopupLayerRef}
                                  />
                                  <Combobox
                                    items={
                                      (serviceOptions.find((item) => item.name === rule.serviceName)?.ports ?? []).map(
                                        (port) => `${port}`
                                      )
                                    }
                                    value={rule.servicePort.trim() ? rule.servicePort : null}
                                    inputValue={rule.servicePort}
                                    onInputValueChange={(value) => {
                                      const nextPort = normalizeServicePortInput(value ?? "")
                                      setCreateRules((current) =>
                                        current.map((item, itemIndex) =>
                                          itemIndex === ruleIndex ? { ...item, servicePort: nextPort } : item
                                        )
                                      )
                                      if (ruleRowErrorMap[ruleIndex]) {
                                        setRuleRowErrorMap((current) => {
                                          const nextMap = { ...current }
                                          delete nextMap[ruleIndex]
                                          return nextMap
                                        })
                                      }
                                    }}
                                    onValueChange={(item) => {
                                      const nextPort = normalizeServicePortInput(item ?? "")
                                      setCreateRules((current) =>
                                        current.map((value, itemIndex) =>
                                          itemIndex === ruleIndex ? { ...value, servicePort: nextPort } : value
                                        )
                                      )
                                      if (ruleRowErrorMap[ruleIndex]) {
                                        setRuleRowErrorMap((current) => {
                                          const nextMap = { ...current }
                                          delete nextMap[ruleIndex]
                                          return nextMap
                                        })
                                      }
                                    }}
                                    disabled={creating}
                                  >
                                    <ComboboxInput
                                      placeholder="端口"
                                      className="w-full"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      maxLength={5}
                                      disabled={creating}
                                    />
                                    <ComboboxContent
                                      container={createDialogPopupLayerRef}
                                      className="pointer-events-auto"
                                    >
                                      <ComboboxEmpty>未找到端口，可直接输入</ComboboxEmpty>
                                      <ComboboxList>
                                        {(item) => (
                                          <ComboboxItem key={item} value={item}>
                                            {item}
                                          </ComboboxItem>
                                        )}
                                      </ComboboxList>
                                    </ComboboxContent>
                                  </Combobox>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => removeRuleItem(ruleIndex)}
                                    disabled={creating}
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                </div>
                              )})}
                            </div>
                          ) : null}
                          <div className="mt-3 flex justify-end">
                            <Button type="button" variant="outline" onClick={addPathRule} disabled={creating}>
                              <IconPlus data-icon="inline-start" />
                              添加
                            </Button>
                          </div>
                        </Field>
                      </FieldGroup>
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
                  <FieldGroup className="grid gap-6 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <AdvancedToggleCard
                        checked={metadataEnabled}
                        disabled={creating}
                        ariaLabel="添加元数据"
                        title="添加元数据"
                        description="统一管理路由的标签与注解信息。"
                        onCheckedChange={(checked) => {
                          if (creating) return
                          setMetadataEnabled(checked)
                        }}
                      >
                        <div className="">
                          <div>
                            <FieldLabel className="mb-2">标签</FieldLabel>
                            <div className="space-y-3">
                              {labelEntries.map((entry, index) => (
                                <div
                                  key={`label-${index}`}
                                  className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                                >
                                  <InputGroup>
                                    <InputGroupAddon>
                                      <InputGroupText>键</InputGroupText>
                                    </InputGroupAddon>
                                    <InputGroupInput
                                      value={entry.key}
                                      onChange={(event) => {
                                        const nextValue = event.target.value
                                        setLabelEntries((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, key: nextValue } : item
                                          )
                                        )
                                      }}
                                      autoComplete="off"
                                      disabled={creating}
                                      className="min-w-0"
                                    />
                                  </InputGroup>
                                  <InputGroup>
                                    <InputGroupAddon>
                                      <InputGroupText>值</InputGroupText>
                                    </InputGroupAddon>
                                    <InputGroupInput
                                      value={entry.value}
                                      onChange={(event) => {
                                        const nextValue = event.target.value
                                        setLabelEntries((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, value: nextValue } : item
                                          )
                                        )
                                      }}
                                      autoComplete="off"
                                      disabled={creating}
                                      className="min-w-0"
                                    />
                                  </InputGroup>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setLabelEntries((current) =>
                                        current.length <= 1
                                          ? [{ key: "", value: "" }]
                                          : current.filter((_, itemIndex) => itemIndex !== index)
                                      )
                                    }}
                                    disabled={creating}
                                    className="shrink-0"
                                    aria-label="删除标签"
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                </div>
                              ))}
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setLabelEntries((current) => [...current, { key: "", value: "" }])
                                  }
                                  disabled={creating}
                                >
                                  添加
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div>
                            <FieldLabel className="mb-2">注解</FieldLabel>
                            <div className="space-y-3">
                              {annotationEntries.map((entry, index) => (
                                <div
                                  key={`annotation-${index}`}
                                  className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                                >
                                  <InputGroup>
                                    <InputGroupAddon>
                                      <InputGroupText>键</InputGroupText>
                                    </InputGroupAddon>
                                    <InputGroupInput
                                      value={entry.key}
                                      onChange={(event) => {
                                        const nextValue = event.target.value
                                        setAnnotationEntries((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, key: nextValue } : item
                                          )
                                        )
                                      }}
                                      autoComplete="off"
                                      disabled={creating}
                                      className="min-w-0"
                                    />
                                  </InputGroup>
                                  <InputGroup>
                                    <InputGroupAddon>
                                      <InputGroupText>值</InputGroupText>
                                    </InputGroupAddon>
                                    <InputGroupInput
                                      value={entry.value}
                                      onChange={(event) => {
                                        const nextValue = event.target.value
                                        setAnnotationEntries((current) =>
                                          current.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, value: nextValue } : item
                                          )
                                        )
                                      }}
                                      autoComplete="off"
                                      disabled={creating}
                                      className="min-w-0"
                                    />
                                  </InputGroup>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setAnnotationEntries((current) =>
                                        current.length <= 1
                                          ? [{ key: "", value: "" }]
                                          : current.filter((_, itemIndex) => itemIndex !== index)
                                      )
                                    }}
                                    disabled={creating}
                                    className="shrink-0"
                                    aria-label="删除注解"
                                  >
                                    <IconTrash data-icon="inline-start" />
                                    删除
                                  </Button>
                                </div>
                              ))}
                              <div className="flex justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    setAnnotationEntries((current) => [...current, { key: "", value: "" }])
                                  }
                                  disabled={creating}
                                >
                                  添加
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </AdvancedToggleCard>
                    </Field>
                  </FieldGroup>
                </div>
              )}

              {createSubmitError ? <FieldError className="mt-4">{createSubmitError}</FieldError> : null}
            </div>

            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                {createStep === "rule" && !createYamlMode && createRuleViewMode === "edit" ? (
                  <Button type="button" variant="outline" onClick={cancelEditRule} disabled={creating}>
                    取消
                  </Button>
                ) : createYamlMode || createStep === "basic" ? (
                  <DialogClose asChild><Button type="button" variant="outline" disabled={creating || checkingCreateNext}>取消</Button></DialogClose>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setCreateStep(createStep === "advanced" ? "rule" : "basic")} disabled={creating || checkingCreateNext}>上一步</Button>
                )}

                {createStep === "rule" && !createYamlMode && createRuleViewMode === "edit" ? (
                  <Button
                    type="button"
                    onClick={() => void saveRuleDraft()}
                    disabled={creating}
                    className="bg-black text-white hover:bg-black/90"
                  >
                    确认保存
                  </Button>
                ) : createYamlMode || createStep === "advanced" ? (
                  <Button type="button" onClick={() => void handleCreateSubmit()} disabled={creating || checkingCreateNext}>
                    {creating ? (isEditMode ? "保存中..." : "创建中...") : isEditMode ? "保存" : "创建"}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void handleCreateNext()} disabled={creating || checkingCreateNext}>{checkingCreateNext && createStep === "basic" ? "校验中..." : "下一步"}</Button>
                )}
              </div>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <MonacoViewerDialog title="查看YAML" open={yamlOpen} onOpenChange={setYamlOpen} value={yamlContent} language="yaml" loading={yamlLoading} error={yamlError} />
      <DeleteConfirmDialog
        open={pendingDeleteRuleHostKey !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteRuleHostKey(null)
        }}
        title="删除路由规则"
        description="确定删除该路由规则吗？"
        deleting={false}
        onConfirm={handleConfirmDeleteRuleItem}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title="删除应用路由"
        description={pendingDeleteRow ? `确定删除应用路由 ${pendingDeleteRow.name} 吗？` : ""}
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarEnd={routeFilters}
        onCreate={() => {
          resetCreateForm()
          setCreateDialogOpen(true)
        }}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
