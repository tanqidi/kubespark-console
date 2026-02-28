"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Skeleton } from "@/registry/new-york-v4/ui/skeleton"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type RouteRow = {
  id: string
  name: string
  namespace: string
  host: string
  path: string
  service: string
  age: string
}

const columns = createColumns<RouteRow>({
  columns: [
    { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "名称空间" },
    { key: "host", label: "域名" },
    { key: "path", label: "路径" },
    { key: "service", label: "服务" },
    { key: "age", label: "年龄" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

export function RoutesPageClient() {
  const [rows, setRows] = React.useState<RouteRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchJsonDeduped<any>(`${BASE}/ingresses`)
      .then((json) => {
        if (cancelled) return
        const items = unwrapItems(json)
        const mapped: RouteRow[] = []

        items.slice(0, 300).forEach((item, index) => {
          const metadata = item?.metadata || {}
          const spec = item?.spec || {}
          const rules: any[] = Array.isArray(spec.rules) ? spec.rules : []
          const baseId = String(metadata.uid ?? `${metadata.name || "ingress"}-${index}`)

          if (!rules.length) {
            mapped.push({
              id: `${baseId}-0`,
              name: metadata.name || "-",
              namespace: String(metadata.namespace ?? "default"),
              host: "-",
              path: "/",
              service: "-",
              age: formatAge(metadata.creationTimestamp),
            })
            return
          }

          rules.forEach((rule, ruleIndex) => {
            const host = rule?.host ?? "-"
            const paths: any[] = rule?.http?.paths || []
            if (!paths.length) {
              mapped.push({
                id: `${baseId}-${ruleIndex}`,
                name: metadata.name || "-",
                namespace: String(metadata.namespace ?? "default"),
                host,
                path: "/",
                service: "-",
                age: formatAge(metadata.creationTimestamp),
              })
              return
            }
            paths.forEach((p, pathIndex) => {
              const backend = p?.backend?.service
              const svcName = backend?.name || backend?.serviceName || "-"
              mapped.push({
                id: `${baseId}-${ruleIndex}-${pathIndex}`,
                name: metadata.name || "-",
                namespace: String(metadata.namespace ?? "default"),
                host,
                path: p?.path || "/",
                service: svcName,
                age: formatAge(metadata.creationTimestamp),
              })
            })
          })
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
