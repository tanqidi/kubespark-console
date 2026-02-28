"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns, type ColumnConfig } from "@/app/(examples)/dashboard/components/table/columns-factory"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"

export type DynamicRow = {
  id?: string | number
  [key: string]: unknown
}

export function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

export function ResourcePage<TData extends DynamicRow>({
  endpoints,
  columns,
  map,
  getRowId,
  columnOptions,
}: {
  endpoints: string[]
  columns: ColumnConfig<TData>[]
  map: (items: any[]) => TData[]
  getRowId?: (row: TData, index: number) => string
  columnOptions?: {
    includeDrag?: boolean
    includeSelect?: boolean
    includeActions?: boolean
  }
}) {
  const [rows, setRows] = React.useState<TData[]>([])
  const [, setLoading] = React.useState(true)
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

  const tableColumns = React.useMemo(
    () => createColumns<TData>({ columns, ...(columnOptions ?? {}) }),
    [columns, columnOptions]
  )
  // if (loading) {
  //   return <ResourceLoadingState />
  // } // kept for potential future use

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

  return (
    <DataTable data={rows} columns={tableColumns} getRowId={getRowId} />
  )
}

export const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"
