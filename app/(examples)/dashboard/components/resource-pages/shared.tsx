"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

export type DynamicRow = {
  id: string | number
  [key: string]: string | number
}

export function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

export function ResourcePage({
  endpoints,
  columns,
  map,
}: {
  endpoints: string[]
  columns: Array<{ key: string; label: string }>
  map: (items: any[]) => DynamicRow[]
}) {
  const [rows, setRows] = React.useState<DynamicRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all(endpoints.map((u) => fetchJsonDeduped<any>(u)))
      .then((results) => {
        if (cancelled) return
        const merged = results.flatMap((json) => unwrapItems(json))
        setRows(map(merged))
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
  }, [endpoints, map])

  if (loading) {
    return (
      <div className="space-y-3 px-4 lg:px-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const [c1, c2, c3, c4, c5, c6] = columns
  const tableRows = rows.map((row, idx) => ({
    id: idx + 1,
    header: String(c1 ? row[c1.key] ?? "-" : "-"),
    type: String(c2 ? row[c2.key] ?? "-" : "-"),
    status: String(c3 ? row[c3.key] ?? "-" : "-"),
    target: String(c4 ? row[c4.key] ?? "-" : "-"),
    limit: String(c5 ? row[c5.key] ?? "-" : "-"),
    reviewer: String(c6 ? row[c6.key] ?? "-" : "-"),
  }))

  return (
    <DataTable
      data={tableRows}
      columns={createColumns({
        header: c1?.label ?? "Header",
        type: c2?.label ?? "Type",
        status: c3?.label ?? "Status",
        target: c4?.label ?? "Target",
        limit: c5?.label ?? "Limit",
        reviewer: c6?.label ?? "Reviewer",
      })}
    />
  )
}

export const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"
