"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchNodeResourceRows, type NodeResourceRow } from "@/app/lib/kubespark/nodes"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

type NodeRow = NodeResourceRow

const columns = createColumns<NodeRow>({
  columns: [
    {
      key: "name",
      label: "\u540d\u79f0/IP",
      cellClassName: "font-medium",
      enableHiding: false,
      cell: (_, row) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.name}</span>
          <span className="text-muted-foreground text-xs">{row.ip}</span>
        </div>
      ),
    },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "role", label: "\u89d2\u8272" },
    { key: "cpuUsage", label: "CPU \u4f7f\u7528\u7387", align: "right" },
    { key: "memoryUsage", label: "\u5185\u5b58\u4f7f\u7528\u7387", align: "right" },
    { key: "pods", label: "\u5bb9\u5668\u7ec4", align: "right" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

export function NodesPageClient() {
  const [rows, setRows] = React.useState<NodeRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchNodeResourceRows()
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

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  const nodeFilters = (
    <Input
      value={nameQuery}
      onChange={(event) => setNameQuery(event.target.value)}
      placeholder={"\u540d\u79f0"}
      className="h-9 w-40"
    />
  )

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={nodeFilters} />
}
