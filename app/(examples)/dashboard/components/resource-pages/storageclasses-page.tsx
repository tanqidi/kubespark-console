"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type StorageClassRow = {
  id: string
  name: string
  provisioner: string
  reclaimPolicy: string
  volumeBindingMode: string
  allowExpansion: string
  age: string
}

const columns = createColumns<StorageClassRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "provisioner", label: "Provisioner" },
    { key: "reclaimPolicy", label: "回收策略" },
    { key: "volumeBindingMode", label: "绑定模式" },
    { key: "allowExpansion", label: "允许扩容" },
    { key: "age", label: "年龄" },
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
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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
