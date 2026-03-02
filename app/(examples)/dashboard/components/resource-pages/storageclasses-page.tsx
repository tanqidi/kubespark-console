"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, resolveUpdatedAt } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type StorageClassRow = {
  id: string
  name: string
  provisioner: string
  reclaimPolicy: string
  volumeBindingMode: string
  allowExpansion: string
  age: string
  updatedAt: string
}

const columns = createColumns<StorageClassRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "provisioner", label: "Provisioner" },
    { key: "reclaimPolicy", label: "\u56de\u6536\u7b56\u7565" },
    { key: "volumeBindingMode", label: "\u7ed1\u5b9a\u6a21\u5f0f" },
    { key: "allowExpansion", label: "\u5141\u8bb8\u6269\u5bb9" },
    { key: "age", label: "运行时间" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

function formatAllowExpansion(value: unknown): string {
  if (typeof value !== "boolean") return "-"
  return value ? "Yes" : "No"
}

export function StorageClassesPageClient() {
  const [rows, setRows] = React.useState<StorageClassRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<any>(`${BASE}/storageclasses`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped = items.slice(0, 300).map((item, index) => {
          const metadata = item?.metadata || {}
          return {
            id: String(metadata.uid ?? `${metadata.name || "storageclass"}-${index}`),
            name: metadata.name || "-",
            provisioner: item?.provisioner || "-",
            reclaimPolicy: item?.reclaimPolicy || "-",
            volumeBindingMode: item?.volumeBindingMode || "-",
            allowExpansion: formatAllowExpansion(item?.allowVolumeExpansion),
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

  const query = searchQuery.trim().toLowerCase()

  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  const storageClassFilters = (
    <Input
      value={searchQuery}
      onChange={(event) => setSearchQuery(event.target.value)}
      placeholder={"名称"}
      className="h-9 w-56"
    />
  )

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={storageClassFilters} />
}
