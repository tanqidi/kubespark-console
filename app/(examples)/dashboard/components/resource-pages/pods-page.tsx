"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, resolveUpdatedAt } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type PodRow = {
  id: string
  name: string
  status: string
  namespace: string
  node: string
  ip: string
  age: string
  updatedAt: string
}

function buildNamespacedPodEndpoint(row: PodRow) {
  return `${BASE}/namespaces/${encodeURIComponent(row.namespace)}/pods/${encodeURIComponent(row.name)}`
}

function getToken() {
  if (typeof window === "undefined") return null
  return localStorage.getItem("kubespark_token") || sessionStorage.getItem("kubespark_token")
}

function toEditorText(payload: unknown): string {
  if (typeof payload === "string") return payload
  if (payload && typeof payload === "object") return JSON.stringify(payload, null, 2)
  return String(payload ?? "")
}

async function fetchPodYaml(row: PodRow): Promise<string> {
  const requestUrl = buildNamespacedPodEndpoint(row)
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const res = await fetch(requestUrl, {
    method: "GET",
    cache: "no-store",
    headers,
  })

  const rawText = await res.text()
  let parsed: unknown = rawText

  if (rawText) {
    try {
      parsed = JSON.parse(rawText)
    } catch {
      parsed = rawText
    }
  }

  if (!res.ok) {
    const detail = rawText ? `: ${rawText.slice(0, 300)}` : ""
    throw new Error(`请求失败，状态码 ${res.status}${detail}`)
  }

  let payload: unknown = parsed
  if (parsed && typeof parsed === "object") {
    const maybeData = (parsed as { data?: unknown }).data
    if (typeof maybeData !== "undefined") payload = maybeData
  }

  console.log("[Pods] view yaml response", {
    requestUrl,
    pod: { name: row.name, namespace: row.namespace },
    result: payload,
  })

  return toEditorText(payload)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function unwrapItems(payload: unknown): unknown[] {
  const envelope = asRecord(payload)
  const data = typeof envelope.data !== "undefined" ? envelope.data : payload
  const dataRecord = asRecord(data)
  const items = dataRecord.items
  return Array.isArray(items) ? items : []
}

function resolvePodStatus(phase?: string): string {
  if (!phase) return "Unknown"
  return phase
}

export function PodsPageClient() {
  const [rows, setRows] = React.useState<PodRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)

  const handleViewYaml = React.useCallback((row: PodRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchPodYaml(row)
      .then((content) => {
        setYamlContent(content)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Pods] view yaml request failed", {
          requestUrl: buildNamespacedPodEndpoint(row),
          pod: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<PodRow>({
        columns: [
          {
            key: "name",
            label: "\u540d\u79f0",
            cellClassName: "font-medium",
            enableHiding: false,
          },
          { key: "status", label: "\u72b6\u6001", render: "status" },
          { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
          { key: "node", label: "\u8282\u70b9" },
          { key: "ip", label: "IP" },
          { key: "age", label: "\u8fd0\u884c\u65f6\u95f4" },
          { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
        ],
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"\u67e5\u770b YAML"}
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
                {"\u5220\u9664"}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              console.log("[Pods] delete clicked", {
                pod: { name: row.name, namespace: row.namespace },
              })
            },
          },
        ],
      }),
    [handleViewYaml]
  )

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<unknown>(`${BASE}/pods`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped = items.slice(0, 300).map((item, index) => {
          const resource = asRecord(item)
          const metadata = asRecord(resource.metadata)
          const status = asRecord(resource.status)
          const spec = asRecord(resource.spec)
          const name = String(metadata.name ?? "-")
          return {
            id: String(metadata.uid ?? `${name}-${index}`),
            name,
            status: resolvePodStatus(
              typeof status.phase === "string" ? status.phase : undefined
            ),
            namespace: String(metadata.namespace ?? "default"),
            node: String(spec.nodeName ?? status.hostIP ?? "-"),
            ip: String(status.podIP ?? "-"),
            age: formatAge(
              typeof metadata.creationTimestamp === "string"
                ? metadata.creationTimestamp
                : undefined
            ),
            updatedAt: resolveUpdatedAt(item),
          }
        })
        setRows(mapped)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const namespaceOptions = React.useMemo(
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
          <AlertTitle>{"\u52a0\u8f7d\u5931\u8d25"}</AlertTitle>
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

  const podFilters = (
    <>
      <FilterCombobox
        options={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        emptyText={"\u672a\u627e\u5230\u540d\u79f0\u7a7a\u95f4"}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
        className="h-9 w-40"
      />
    </>
  )

  return (
    <>
      <MonacoViewerDialog
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DataTable data={filteredRows} columns={columns} toolbarEnd={podFilters} />
    </>
  )
}
