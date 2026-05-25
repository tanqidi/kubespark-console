"use client"

import * as React from "react"
import { IconCircleCheckFilled, IconLoader, IconInfoCircle } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  createColumns,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { fetchNodeResourceRows, type NodeResourceRow } from "@/app/lib/kubespark/nodes"
import { fetchResourceDescribe } from "@/app/lib/kubespark/common"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/app/lib/i18n"
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"

const HEALTHY_STATUS_SET = new Set<string>([
  "done",
  "running",
  "succeeded",
  "success",
  "successful",
  "normal",
  "ready",
  "bound",
  "active",
  "available",
  "healthy",
  "completed",
  "online",
  "true",
])

type NodeRow = NodeResourceRow

function getNodeColumns(t: (key: string) => string) {
  return [
    {
      key: "name" as const,
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value: unknown, row: NodeRow) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.name}</div>
          <div className="truncate text-sm text-muted-foreground">{row.ip || "-"}</div>
        </div>
      ),
    },
    { 
      key: "status" as const, 
      label: t("table.columns.status"), 
      cell: (value: unknown) => {
        const key = String(value ?? "-")
        const text = t(`nodes.status.${key}`)
        const isHealthy = HEALTHY_STATUS_SET.has(key)
        const statusClassName = isHealthy
          ? "text-muted-foreground"
          : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
        return (
          <Badge variant="outline" className={cn("px-1.5", statusClassName)}>
            {isHealthy ? (
              <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
            ) : (
              <IconLoader className="text-amber-500 dark:text-amber-300" />
            )}
            {text}
          </Badge>
        )
      }
    },
    { 
      key: "role" as const, 
      label: t("table.columns.role"),
      cell: (value: unknown) => t(`nodes.role.${String(value)}`)
    },
    { key: "pods" as const, label: t("table.columns.pods") },
    { key: "age" as const, label: t("table.columns.age") },
    { key: "updatedAt" as const, label: t("table.columns.updatedAt") },
  ]
}

export function NodesPageClient() {
  const [rows, setRows] = React.useState<NodeRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState("")

  const t = useTranslations()

  const handleViewDescribe = React.useCallback((row: NodeRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(t("nodes.describeSubtitle", { name: row.name }))

    void fetchResourceDescribe("core", "v1", "nodes", row.name)
      .then(({ text }) => {
        setDescribeContent(text || t("actions.noOutput"))
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("actions.loadDetailsFailed")
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [t])

  const loadRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const mapped = await fetchNodeResourceRows()
      setRows(mapped)
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "API request failed")
      } else {
        console.error("[Nodes] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadRows(false)
  }, [loadRows])

  useIntervalRefresh(() => loadRows(true), 3000)

  const columns = React.useMemo(() => getNodeColumns(t), [t])
  const actionItems = React.useMemo(
    () => [
      {
        label: (
          <>
            <IconInfoCircle className="size-4" />
            {t("actions.details")}
          </>
        ),
        onSelect: handleViewDescribe,
      },
    ],
    [handleViewDescribe, t]
  )
  const tableColumns = React.useMemo(
    () => createColumns<NodeRow>({ columns, actionItems }),
    [columns, actionItems]
  )

  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("actions.loadFailed")}</AlertTitle>
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
      placeholder={t("actions.name")}
      className="h-9 w-40"
    />
  )

  return (
    <>
      <DescribeViewerDialog
        title={t("actions.viewDetailsTitle")}
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <DataTable data={filteredRows} columns={tableColumns} toolbarEnd={nodeFilters} />
    </>
  )
}
