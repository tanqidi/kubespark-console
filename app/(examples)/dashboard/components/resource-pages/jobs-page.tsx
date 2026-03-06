"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns, type ColumnConfig } from "@/app/(examples)/dashboard/components/table/columns-factory"
import { fetchJobRows, type JobResourceRow } from "@/app/lib/kubespark/resource-rows"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/registry/new-york-v4/ui/tabs"

type JobRow = JobResourceRow

const jobColumns: ColumnConfig<JobRow>[] = [
  { key: "name", label: "\u540d\u79f0", cellClassName: "font-medium", enableHiding: false },
  { key: "status", label: "\u72b6\u6001", render: "status" as const },
  { key: "namespace", label: "\u540d\u79f0\u7a7a\u95f4" },
  { key: "duration", label: "\u65f6\u957f", align: "right" as const },
  { key: "retry", label: "\u91cd\u8bd5", align: "right" as const },
  { key: "age", label: "\u8fd0\u884c\u65f6\u95f4" },
  { key: "updatedAt", label: "\u66f4\u65b0\u65f6\u95f4" },
]

const JOB_RESOURCE_BY_KIND: Record<JobRow["kind"], string> = {
  Job: "jobs",
  CronJob: "cronjobs",
}

export function JobsPageClient() {
  const [rows, setRows] = React.useState<JobRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [jobType, setJobType] = React.useState<JobRow["kind"]>("Job")
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)

  const handleViewYaml = React.useCallback((row: JobRow) => {
    const resource = JOB_RESOURCE_BY_KIND[row.kind]
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespacedResourceYaml(resource, row.namespace, row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Jobs] view yaml response", {
          kind: row.kind,
          resource,
          job: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Jobs] view yaml request failed", {
          kind: row.kind,
          resource,
          job: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<JobRow>({
        columns: jobColumns,
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
              console.log("[Jobs] delete clicked", {
                kind: row.kind,
                resource: JOB_RESOURCE_BY_KIND[row.kind],
                job: { name: row.name, namespace: row.namespace },
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

    fetchJobRows()
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
    if (row.kind !== jobType) return false
    if (nsQuery && row.namespace.toLowerCase() !== nsQuery) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const jobTabs = (
    <Tabs value={jobType} onValueChange={(value) => setJobType(value as JobRow["kind"])} className="w-fit">
      <TabsList>
        <TabsTrigger value="Job">{"\u4efb\u52a1"}</TabsTrigger>
        <TabsTrigger value="CronJob">{"\u5b9a\u65f6\u4efb\u52a1"}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const jobFilters = (
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
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarStart={jobTabs}
        toolbarEnd={jobFilters}
      />
    </>
  )
}
