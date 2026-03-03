"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns } from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  fetchNamespacedPodYaml,
  fetchPodResourceRows,
  type PodResourceRow,
} from "@/app/lib/kubespark/pods"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

type PodRow = PodResourceRow

export function PodsPageClient() {
  const [rows, setRows] = React.useState<PodRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)

  const handleViewYaml = React.useCallback((row: PodRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedPodYaml(row.namespace, row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Pods] view yaml response", {
          pod: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Pods] view yaml request failed", {
          pod: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<PodRow>({
        columns: [
          {
            key: "name",
            label: "\u540d\u79f0",
            cellClassName: "font-medium",
            enableHiding: false,
          },
          { key: "status", label: "\u72b6\u6001", render: "status" },
          { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
          { key: "node", label: "\u8282\u70b9" },
          { key: "ip", label: "IP" },
          { key: "age", label: "\u8fd0\u884c\u65f6\u95f4" },
          { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
        ],
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"\u67e5\u770b YAML"}
              </>
            ),
            onSelect: (row) => {
              handleViewYaml(row)
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {"\u5220\u9664"}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              console.log("[Pods] delete clicked", {
                pod: { name: row.name, namespace: row.namespace },
              })
            },
          },
        ],
      }),
    [handleViewYaml]
  )

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchPodResourceRows()
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

  const podFilters = (
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

  return (
    <>
      <MonacoViewerDialog
        title="查看YAML"
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DataTable data={filteredRows} columns={columns} toolbarEnd={podFilters} />
    </>
  )
}
