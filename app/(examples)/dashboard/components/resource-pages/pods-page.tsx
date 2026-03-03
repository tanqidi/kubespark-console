"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { FilterCombobox } from "@/components/ui/filter-combobox"
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

async function logPodYaml(row: PodRow) {
  const requestUrl = buildNamespacedPodEndpoint(row)
  try {
    const result = await fetchJsonDeduped<unknown>(requestUrl)
    console.log("[Pods] view yaml response", {
      requestUrl,
      pod: { name: row.name, namespace: row.namespace },
      result,
    })
  } catch (error) {
    console.error("[Pods] view yaml request failed", {
      requestUrl,
      pod: { name: row.name, namespace: row.namespace },
      error,
    })
  }
}

const columns = createColumns<PodRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "node", label: "\u8282\u70b9" },
    { key: "ip", label: "IP" },
    { key: "age", label: "运行时间" },
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
        void logPodYaml(row)
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
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
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

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<any>(`${BASE}/pods`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const status = item?.status || {}
          const spec = item?.spec || {}
          const name = metadata.name || "-"
          return {
            id: String(metadata.uid ?? `${name}-${index}`),
            name,
            status: resolvePodStatus(status.phase),
            namespace: String(metadata.namespace ?? "default"),
            node: String(spec.nodeName ?? status.hostIP ?? "-"),
            ip: String(status.podIP ?? "-"),
            age: formatAge(metadata.creationTimestamp),
            updatedAt: resolveUpdatedAt(item),
          }
        })
        setRows(mapped)
      })
      .catch((e: any) => {
        if (!cancelled) {
          setRows([])
          setError(e?.message || "API request failed")
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

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={podFilters} />
}
