"use client"

import * as React from "react"
import { IconInfoCircle } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { fetchNodeResourceRows, type NodeResourceRow } from "@/app/lib/kubespark/nodes"
import { fetchResourceDescribe } from "@/app/lib/kubespark/common"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

type NodeRow = NodeResourceRow

export function NodesPageClient() {
  const [rows, setRows] = React.useState<NodeRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("查看 Kubernetes Node 的详情内容。")

  const handleViewDescribe = React.useCallback((row: NodeRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(`查看 Kubernetes Node（${row.name}）的详情内容。`)

    void fetchResourceDescribe("core", "v1", "nodes", row.name)
      .then(({ text }) => {
        setDescribeContent(text || "(无详情输出)")
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载详情失败"
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [])

  const columns = React.useMemo(() => createColumns<NodeRow>({
    columns: [
    {
      key: "name",
      label: "\u540d\u79f0",
      enableHiding: false,
      cell: (_, row) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="truncate text-sm text-muted-foreground">{row.ip || "-"}</div>
        </div>
      ),
    },
    { key: "status", label: "\u72b6\u6001", render: "status" },
    { key: "role", label: "\u89d2\u8272" },
    // { key: "cpuUsage", label: "CPU \u4f7f\u7528\u7387", align: "right" },
    // { key: "memoryUsage", label: "\u5185\u5b58\u4f7f\u7528\u7387", align: "right" },
    { key: "pods", label: "\u5bb9\u5668\u7ec4", align: "right" },
    { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
  ],
    actionItems: [
      {
        label: (
          <>
            <IconInfoCircle className="size-4" />
            {"详情"}
          </>
        ),
        onSelect: (row) => {
          handleViewDescribe(row)
        },
      },
    ],
  }), [handleViewDescribe])

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const mapped = await fetchNodeResourceRows()
        if (cancelled) return
        setRows(mapped)
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[Nodes] polling refresh failed", e)
        }
      } finally {
        if (!silent && !cancelled) setLoading(false)
      }
    }

    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
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

  return (
    <>
      <DescribeViewerDialog
        title="查看详情"
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <DataTable data={filteredRows} columns={columns} toolbarEnd={nodeFilters} />
    </>
  )
}
