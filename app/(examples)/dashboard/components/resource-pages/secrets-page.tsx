"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  fetchSecretRows,
  type SecretResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

type SecretRow = SecretResourceRow

const columns = createColumns<SecretRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "type", label: "\u7c7b\u578b", render: "badge" },
    { key: "dataItems", label: "\u6570\u636e\u9879", align: "right" },
    { key: "size", label: "\u5927\u5c0f", align: "right" },
    { key: "age", label: "运行时间" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

export function SecretsPageClient() {
  const [rows, setRows] = React.useState<SecretRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchSecretRows()
      .then((mapped) => {
        if (cancelled) return
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

  const secretFilters = (
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

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={secretFilters} />
}
