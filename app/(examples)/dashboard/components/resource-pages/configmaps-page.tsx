"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { PresetSelector } from "@/components/ui/preset-selector"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, resolveUpdatedAt } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type ConfigMapRow = {
  id: string
  name: string
  namespace: string
  dataItems: number
  size: string
  age: string
  updatedAt: string
}

const columns = createColumns<ConfigMapRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "dataItems", label: "\u6570\u636e\u9879", align: "right" },
    { key: "size", label: "\u5927\u5c0f", align: "right" },
    { key: "age", label: "运行时间" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function byteLengthOf(obj: any): number {
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(obj ?? {}))
    return encoded.length
  } catch {
    return 0
  }
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} Mi`
  return `${(bytes / 1024).toFixed(1)} Ki`
}

export function ConfigMapsPageClient() {
  const [rows, setRows] = React.useState<ConfigMapRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<any>(`${BASE}/configmaps`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          const dataObj = item?.data || {}
          const binaryData = item?.binaryData || {}
          const dataItems = Object.keys(dataObj).length + Object.keys(binaryData).length
          const sizeBytes = byteLengthOf(dataObj) + byteLengthOf(binaryData)
          return {
            id: String(metadata.uid ?? `${metadata.name || "configmap"}-${index}`),
            name: metadata.name || "-",
            namespace: String(metadata.namespace ?? "default"),
            dataItems,
            size: formatSize(sizeBytes),
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

  const configMapFilters = (
    <>
      <PresetSelector
        presets={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        searchPlaceholder={"\u641c\u7d22\u540d\u79f0\u7a7a\u95f4..."}
        emptyText={"\u672a\u627e\u5230\u540d\u79f0\u7a7a\u95f4"}
        groupLabel={"\u540d\u79f0\u7a7a\u95f4"}
        triggerClassName="h-9 w-40 justify-between"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
        className="h-9 w-40"
      />
    </>
  )

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={configMapFilters} />
}
