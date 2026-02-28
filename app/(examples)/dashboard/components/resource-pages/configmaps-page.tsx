"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type ConfigMapRow = {
  id: string
  name: string
  namespace: string
  dataItems: number
  size: string
  age: string
}

const columns = createColumns<ConfigMapRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "名称空间" },
    { key: "dataItems", label: "数据项", align: "right" },
    { key: "size", label: "大小", align: "right" },
    { key: "age", label: "年龄" },
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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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

  if (loading) return <div className="space-y-3 px-4 lg:px-6"><Skeleton className="h-10 w-full" /><Skeleton className="h-48 w-full" /></div>
  if (error) return <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>

  return <DataTable data={rows} columns={columns} />
}
