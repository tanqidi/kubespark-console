
"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconAdjustments, IconEye, IconRoute2, IconSettings2, IconTrash } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
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
import { checkIngressExists, createIngress, type IngressPathType } from "@/app/lib/kubespark/routes"
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
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
  { key: "host", label: "域名" },
  { key: "path", label: "路径" },
  { key: "service", label: "服务" },
  { key: "age", label: "运行时间" },
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

function buildRouteYamlText(params: {
  name: string
  namespace: string
  description: string
  host: string
  path: string
  serviceName: string
  servicePort: string
  pathType: PathType
  ingressClassName: string
}): string {
  const servicePort = Number(params.servicePort.trim())
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
        rules: [
          {
            ...(params.host.trim() ? { host: params.host.trim() } : {}),
            http: {
              paths: [
                {
                  ...(params.path.trim() ? { path: params.path.trim() } : {}),
                  pathType: params.pathType,
                  backend: {
                    service: {
                      ...(params.serviceName.trim() ? { name: params.serviceName.trim() } : {}),
                      ...(Number.isFinite(servicePort) && servicePort > 0
                        ? { port: { number: servicePort } }
                        : {}),
                    },
                  },
                },
              ],
            },
          },
        ],
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
  host: string
  path: string
  serviceName: string
  servicePort: string
  pathType: PathType
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
  const rules = Array.isArray(spec.rules) ? spec.rules : []
  const firstRule = asObject(rules[0])
  const http = asObject(firstRule.http)
  const paths = Array.isArray(http.paths) ? http.paths : []
  const firstPath = asObject(paths[0])
  const backend = asObject(firstPath.backend)
  const service = asObject(backend.service)
  const port = asObject(service.port)
  const servicePort = asNumber(port.number)

  const pathTypeRaw = firstPath.pathType
  const pathType: PathType =
    pathTypeRaw === "Exact" || pathTypeRaw === "ImplementationSpecific" || pathTypeRaw === "Prefix"
      ? pathTypeRaw
      : "Prefix"

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    namespace: typeof metadata.namespace === "string" ? metadata.namespace : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
    host: typeof firstRule.host === "string" ? firstRule.host : "",
    path: typeof firstPath.path === "string" ? firstPath.path : "",
    serviceName: typeof service.name === "string" ? service.name : "",
    servicePort: servicePort && servicePort > 0 ? String(servicePort) : "",
    pathType,
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
  const [createStep, setCreateStep] = React.useState<RouteCreateStep>("basic")
  const [createRuleViewMode, setCreateRuleViewMode] = React.useState<RouteRuleViewMode>("list")
  const [creating, setCreating] = React.useState(false)
  const [checkingCreateNext, setCheckingCreateNext] = React.useState(false)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)

  const [namespaceOptions, setNamespaceOptions] = React.useState<NamespaceOption[]>([])
  const [serviceOptions, setServiceOptions] = React.useState<ServiceOption[]>([])

  const [createName, setCreateName] = React.useState("")
  const [createNamespace, setCreateNamespace] = React.useState("")
  const [createDescription, setCreateDescription] = React.useState("")
  const [createHost, setCreateHost] = React.useState("")
  const [createPath, setCreatePath] = React.useState("/")
  const [createServiceName, setCreateServiceName] = React.useState("")
  const [createServicePort, setCreateServicePort] = React.useState("")
  const [createPathType, setCreatePathType] = React.useState<PathType>("Prefix")
  const [createIngressClassName, setCreateIngressClassName] = React.useState("")

  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createNamespaceError, setCreateNamespaceError] = React.useState<string | null>(null)
  const [createHostError, setCreateHostError] = React.useState<string | null>(null)
  const [createPathError, setCreatePathError] = React.useState<string | null>(null)
  const [createServiceError, setCreateServiceError] = React.useState<string | null>(null)
  const [createServicePortError, setCreateServicePortError] = React.useState<string | null>(null)
  const [createSubmitError, setCreateSubmitError] = React.useState<string | null>(null)
  const [ruleSaveAttempted, setRuleSaveAttempted] = React.useState(false)

  const selectedServicePorts = React.useMemo(() => {
    const selected = serviceOptions.find((item) => item.name === createServiceName)
    return selected?.ports ?? []
  }, [createServiceName, serviceOptions])
  const hasConfiguredRule = React.useMemo(
    () =>
      Boolean(
        createHost.trim() &&
          createPath.trim() &&
          createServiceName.trim() &&
          createServicePort.trim()
      ),
    [createHost, createPath, createServiceName, createServicePort]
  )
  const canNavigateCreateSteps = !creating && !(createStep === "rule" && createRuleViewMode === "edit")

  const resetCreateForm = React.useCallback(() => {
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
    setCreatePathType("Prefix")
    setCreateIngressClassName("")
    setCreateNameError(null)
    setCreateNamespaceError(null)
    setCreateHostError(null)
    setCreatePathError(null)
    setCreateServiceError(null)
    setCreateServicePortError(null)
    setCreateSubmitError(null)
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
      setCreateServiceName("")
      setCreateServicePort("")
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

        const preferredService = mapped.find((item) => item.name === createServiceName) ?? mapped[0]
        const nextServiceName = preferredService?.name ?? ""
        setCreateServiceName(nextServiceName)
        const preferredPort = preferredService?.ports[0]
        if (!createServicePort.trim() || !preferredService?.ports.includes(Number(createServicePort.trim()))) {
          setCreateServicePort(preferredPort ? String(preferredPort) : "")
        }
      })
      .catch((loadError) => {
        if (cancelled) return
        console.error("[Routes] load service options failed", loadError)
        setServiceOptions([])
      })

    return () => {
      cancelled = true
    }
  }, [createDialogOpen, createNamespace, createServiceName, createServicePort])

  const buildCreateYaml = React.useCallback(() => {
    return buildRouteYamlText({
      name: createName,
      namespace: createNamespace,
      description: createDescription,
      host: createHost,
      path: createPath,
      serviceName: createServiceName,
      servicePort: createServicePort,
      pathType: createPathType,
      ingressClassName: createIngressClassName,
    })
  }, [
    createDescription,
    createHost,
    createIngressClassName,
    createName,
    createNamespace,
    createPath,
    createPathType,
    createServiceName,
    createServicePort,
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
    const parsedPort = Number(createServicePort.trim())
    const servicePortError =
      createServicePort.trim() && Number.isInteger(parsedPort) && parsedPort > 0
        ? null
        : "服务端口必须是大于 0 的整数"
    setCreateHostError(hostError)
    setCreatePathError(pathError)
    setCreateServiceError(serviceError)
    setCreateServicePortError(servicePortError)
    return !hostError && !pathError && !serviceError && !servicePortError
  }, [createHost, createPath, createServiceName, createServicePort])

  const beginEditRule = React.useCallback(() => {
    setCreateSubmitError(null)
    setRuleSaveAttempted(false)
    setCreateRuleViewMode("edit")
  }, [])

  const cancelEditRule = React.useCallback(() => {
    setCreateSubmitError(null)
    setCreateRuleViewMode("list")
  }, [])

  const saveRuleDraft = React.useCallback(() => {
    setCreateSubmitError(null)
    if (!validateRuleStep()) return false
    setRuleSaveAttempted(false)
    setCreateRuleViewMode("list")
    return true
  }, [validateRuleStep])

  const handleCreateNext = React.useCallback(async () => {
    if (creating || checkingCreateNext) return
    setCreateSubmitError(null)
    if (createStep === "basic") {
      if (!validateBasicStep()) return
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
      host: createHost,
      path: createPath,
      serviceName: createServiceName,
      servicePort: createServicePort,
      pathType: createPathType,
      ingressClassName: createIngressClassName,
    }

    if (createYamlMode) {
      try {
        draft = parseRouteYamlText(createYamlText)
        setCreateName(draft.name)
        setCreateNamespace(draft.namespace)
        setCreateDescription(draft.description)
        setCreateHost(draft.host)
        setCreatePath(draft.path || "/")
        setCreateServiceName(draft.serviceName)
        setCreateServicePort(draft.servicePort)
        setCreatePathType(draft.pathType)
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
    const hostError = validateHost(draft.host)
    const pathError = validatePath(draft.path)
    const serviceError = draft.serviceName.trim() ? null : "请选择服务"
    const parsedPort = Number(draft.servicePort.trim())
    const servicePortError =
      draft.servicePort.trim() && Number.isInteger(parsedPort) && parsedPort > 0
        ? null
        : "服务端口必须是大于 0 的整数"

    setCreateNameError(nameError)
    setCreateNamespaceError(namespaceError)
    setCreateHostError(hostError)
    setCreatePathError(pathError)
    setCreateServiceError(serviceError)
    setCreateServicePortError(servicePortError)

    const firstError = nameError || namespaceError || hostError || pathError || serviceError || servicePortError
    if (firstError) {
      if (!createYamlMode) {
        if (nameError || namespaceError) setCreateStep("basic")
        else setCreateStep("rule")
      } else {
        setCreateYamlError(firstError)
      }
      return
    }

    setCreating(true)
    try {
      await createIngress({
        name: draft.name.trim().toLowerCase(),
        namespace: draft.namespace.trim(),
        host: draft.host.trim(),
        path: draft.path.trim(),
        serviceName: draft.serviceName.trim(),
        servicePort: Number(draft.servicePort.trim()),
        pathType: draft.pathType,
        ingressClassName: draft.ingressClassName.trim(),
        description: draft.description.trim(),
      })
      const mapped = await fetchRouteRows()
      setRows(mapped)
      setError(null)
      setCreateDialogOpen(false)
      resetCreateForm()
    } catch (submitError) {
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
    createDescription,
    createHost,
    createIngressClassName,
    createName,
    createNamespace,
    createPath,
    createPathType,
    createServiceName,
    createServicePort,
    createYamlMode,
    createYamlText,
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
    [handleViewYaml, requestDelete]
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
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <DialogTitle>创建应用路由</DialogTitle>
                  <DialogDescription>使用 Kubernetes Ingress 创建应用访问路由。</DialogDescription>
                </div>
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
                        setCreateName(parsed.name)
                        setCreateNamespace(parsed.namespace)
                        setCreateDescription(parsed.description)
                        setCreateHost(parsed.host)
                        setCreatePath(parsed.path || "/")
                        setCreateServiceName(parsed.serviceName)
                        setCreateServicePort(parsed.servicePort)
                        setCreatePathType(parsed.pathType)
                        setCreateIngressClassName(parsed.ingressClassName)
                        setCreateRuleViewMode("list")
                        setCreateYamlError(null)
                        setCreateYamlMode(false)
                      } catch (parseError: unknown) {
                        setCreateYamlError(parseError instanceof Error ? parseError.message : "YAML 解析失败")
                      }
                    }}
                    disabled={creating}
                    aria-label="编辑 YAML"
                  />
                </div>
              </div>
            </DialogHeader>

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
                      <Input id="route-create-name" value={createName} onChange={(event) => { setCreateName(event.target.value); if (createNameError) setCreateNameError(null) }} placeholder="请输入路由名称" autoComplete="off" aria-invalid={Boolean(createNameError)} disabled={creating} />
                      {createNameError ? (<FieldError>{createNameError}</FieldError>) : (<FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>)}
                    </Field>

                    <Field data-invalid={Boolean(createNamespaceError)}>
                      <FieldLabel htmlFor="route-create-namespace">项目</FieldLabel>
                      <Select value={createNamespace} onValueChange={(value) => { setCreateNamespace(value); if (createNamespaceError) setCreateNamespaceError(null) }} disabled={creating}>
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
                  {createRuleViewMode === "list" ? (
                    <>
                      <div className="mb-4">
                        <h3 className="text-[15px] font-semibold">路由规则</h3>
                      </div>

                      <div className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
                        <div className="flex flex-col gap-0 pb-4">
                          {hasConfiguredRule ? (
                            <div className="rounded-lg border px-4 py-4">
                              <div className="text-sm font-semibold">{createHost || "-"}</div>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {`${createPath || "-"} -> ${createServiceName || "-"}:${createServicePort || "-"} (${createPathType})`}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed px-4 py-10 text-center">
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
                            <span className="text-sm font-semibold">{hasConfiguredRule ? "编辑路由规则" : "添加路由规则"}</span>
                            <span className="mt-1 text-sm text-muted-foreground">
                              {hasConfiguredRule ? "更新域名、路径和后端服务。" : "添加域名、路径和后端服务映射。"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-4">
                        <h3 className="text-[15px] font-semibold">录入路由规则</h3>
                        <p className="mt-1 text-sm text-muted-foreground">设置域名、路径与后端服务。</p>
                      </div>
                      <FieldGroup className="grid gap-6 md:grid-cols-2">
                        <Field data-invalid={Boolean(createHostError)}>
                          <FieldLabel htmlFor="route-create-host">域名</FieldLabel>
                          <Input
                            id="route-create-host"
                            value={createHost}
                            onChange={(event) => {
                              setCreateHost(event.target.value)
                              if (createHostError) setCreateHostError(null)
                            }}
                            placeholder="例如：example.com"
                            autoComplete="off"
                            aria-invalid={Boolean(createHostError)}
                            disabled={creating}
                          />
                          {createHostError ? <FieldError>{createHostError}</FieldError> : null}
                        </Field>
                        <Field data-invalid={Boolean(createPathError)}>
                          <FieldLabel htmlFor="route-create-path">路径</FieldLabel>
                          <Input
                            id="route-create-path"
                            value={createPath}
                            onChange={(event) => {
                              setCreatePath(event.target.value)
                              if (createPathError) setCreatePathError(null)
                            }}
                            placeholder="/"
                            autoComplete="off"
                            aria-invalid={Boolean(createPathError)}
                            disabled={creating}
                          />
                          {createPathError ? <FieldError>{createPathError}</FieldError> : null}
                        </Field>
                        <Field data-invalid={Boolean(createServiceError)}>
                          <FieldLabel htmlFor="route-create-service">服务</FieldLabel>
                          <Select
                            value={createServiceName}
                            onValueChange={(value) => {
                              setCreateServiceName(value)
                              if (createServiceError) setCreateServiceError(null)
                              const next = serviceOptions.find((item) => item.name === value)
                              if (next?.ports[0]) setCreateServicePort(String(next.ports[0]))
                            }}
                            disabled={creating}
                          >
                            <SelectTrigger id="route-create-service" aria-invalid={Boolean(createServiceError)}>
                              <SelectValue placeholder="请选择服务" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {serviceOptions.length > 0 ? (
                                  serviceOptions.map((option) => (
                                    <SelectItem key={option.name} value={option.name}>
                                      {option.name}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="__none__" disabled>
                                    当前项目暂无可选服务
                                  </SelectItem>
                                )}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          {createServiceError ? <FieldError>{createServiceError}</FieldError> : null}
                        </Field>
                        <Field data-invalid={Boolean(createServicePortError)}>
                          <FieldLabel htmlFor="route-create-service-port">服务端口</FieldLabel>
                          {selectedServicePorts.length > 0 ? (
                            <Select
                              value={createServicePort}
                              onValueChange={(value) => {
                                setCreateServicePort(value)
                                if (createServicePortError) setCreateServicePortError(null)
                              }}
                              disabled={creating}
                            >
                              <SelectTrigger id="route-create-service-port" aria-invalid={Boolean(createServicePortError)}>
                                <SelectValue placeholder="请选择服务端口" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {selectedServicePorts.map((port) => (
                                    <SelectItem key={`${port}`} value={`${port}`}>
                                      {port}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id="route-create-service-port"
                              value={createServicePort}
                              onChange={(event) => {
                                setCreateServicePort(event.target.value.replace(/[^0-9]/g, ""))
                                if (createServicePortError) setCreateServicePortError(null)
                              }}
                              inputMode="numeric"
                              placeholder="例如：80"
                              autoComplete="off"
                              aria-invalid={Boolean(createServicePortError)}
                              disabled={creating}
                            />
                          )}
                          {createServicePortError ? <FieldError>{createServicePortError}</FieldError> : null}
                        </Field>
                        <Field className="md:col-span-2">
                          <FieldLabel htmlFor="route-create-path-type">路径类型</FieldLabel>
                          <Select
                            value={createPathType}
                            onValueChange={(value) => {
                              if (value === "Prefix" || value === "Exact" || value === "ImplementationSpecific") {
                                setCreatePathType(value)
                              }
                            }}
                            disabled={creating}
                          >
                            <SelectTrigger id="route-create-path-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value="Prefix">Prefix</SelectItem>
                                <SelectItem value="Exact">Exact</SelectItem>
                                <SelectItem value="ImplementationSpecific">ImplementationSpecific</SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      </FieldGroup>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-4"><h3 className="text-[15px] font-semibold">高级设置</h3><p className="mt-1 text-sm text-muted-foreground">可选配置 IngressClass。</p></div>
                  <FieldGroup className="grid gap-6 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="route-create-ingress-class">IngressClass</FieldLabel>
                      <Input id="route-create-ingress-class" value={createIngressClassName} onChange={(event) => setCreateIngressClassName(event.target.value)} placeholder="例如：nginx（选填）" autoComplete="off" disabled={creating} />
                      <FieldDescription>填写后将写入 `spec.ingressClassName`。</FieldDescription>
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
                    取消编辑
                  </Button>
                ) : createYamlMode || createStep === "basic" ? (
                  <DialogClose asChild><Button type="button" variant="outline" disabled={creating || checkingCreateNext}>取消</Button></DialogClose>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setCreateStep(createStep === "advanced" ? "rule" : "basic")} disabled={creating || checkingCreateNext}>上一步</Button>
                )}

                {createStep === "rule" && !createYamlMode && createRuleViewMode === "edit" ? (
                  <Button type="button" onClick={() => void saveRuleDraft()} disabled={creating}>
                    保存规则
                  </Button>
                ) : createYamlMode || createStep === "advanced" ? (
                  <Button type="button" onClick={() => void handleCreateSubmit()} disabled={creating || checkingCreateNext}>{creating ? "创建中..." : "创建"}</Button>
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
