"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  fetchStorageClassRows,
  type StorageClassResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

type StorageClassRow = StorageClassResourceRow

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

export function StorageClassesPageClient() {
  const [rows, setRows] = React.useState<StorageClassRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const mapped = await fetchStorageClassRows()
        if (cancelled) return
        setRows(mapped)
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[StorageClasses] polling refresh failed", e)
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
      className="h-9 w-40"
    />
  )

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={storageClassFilters} />
}
