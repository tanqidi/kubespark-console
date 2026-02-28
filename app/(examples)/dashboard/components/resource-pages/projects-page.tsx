"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"

const columns = createColumns<{
  id: string
  name: string
  status: string
  labels: number
  annotations: number
  age: string
}>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "status", label: "状态", render: "status" },
    { key: "labels", label: "标签", align: "right" },
    { key: "annotations", label: "注解", align: "right" },
    { key: "age", label: "年龄" },
  ],
})

export function ProjectsPageClient() {
  const [rows, setRows] = React.useState<{
    id: string
    name: string
    status: string
    labels: number
    annotations: number
    age: string
  }[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchNamespaces()
      .then((items) => {
        if (!cancelled) setRows(items)
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
  if (error) return <div className="px-4 lg:px-6"><Alert variant="destructive"><AlertTitle>加载失败</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></div>

  return <DataTable data={rows} columns={columns} />
}
