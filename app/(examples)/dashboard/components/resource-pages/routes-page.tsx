"use client"

import * as React from "react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { PresetSelector } from "@/components/ui/preset-selector"
import { fetchJsonDeduped } from "@/app/lib/kubespark/common"
import { formatAge, resolveUpdatedAt } from "@/app/lib/kubespark/utils"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

const BASE = "/api/kubespark/kapis/resources.kubespark.io/v1alpha1"

type RouteRow = {
  id: string
  name: string
  namespace: string
  host: string
  path: string
  service: string
  age: string
  updatedAt: string
}

const columns = createColumns<RouteRow>({
  columns: [
    { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
    { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
    { key: "host", label: "\u57df\u540d" },
    { key: "path", label: "\u8def\u5f84" },
    { key: "service", label: "\u670d\u52a1" },
    { key: "age", label: "运行时间" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
})

function unwrapItems(payload: any): any[] {
  const data = payload?.data ?? payload
  return Array.isArray(data?.items) ? data.items : []
}

export function RoutesPageClient() {
  const [rows, setRows] = React.useState<RouteRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")

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
          const updatedAt = resolveUpdatedAt(item)

          if (!rules.length) {
            mapped.push({
              id: `${baseId}-0`,
              name: metadata.name || "-",
              namespace: String(metadata.namespace ?? "default"),
              host: "-",
              path: "/",
              service: "-",
              age: formatAge(metadata.creationTimestamp),
              updatedAt,
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
                updatedAt,
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
                updatedAt,
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

  const routeFilters = (
    <>
      <PresetSelector
        presets={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"\u540d\u79f0\u7a7a\u95f4"}
        searchPlaceholder={"\u641c\u7d22\u540d\u79f0\u7a7a\u95f4..."}
        emptyText={"\u672a\u627e\u5230\u540d\u79f0\u7a7a\u95f4"}
        groupLabel={"\u540d\u79f0\u7a7a\u95f4"}
        showClear
        clearText={"\u5168\u90e8\u540d\u79f0\u7a7a\u95f4"}
        triggerClassName="h-9 w-36 justify-between"
        popoverClassName="w-[320px] p-0"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={"\u540d\u79f0"}
        className="h-9 w-40"
      />
    </>
  )

  return <DataTable data={filteredRows} columns={columns} toolbarEnd={routeFilters} />
}
