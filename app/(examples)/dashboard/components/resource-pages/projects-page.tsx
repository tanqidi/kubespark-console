"use client"

import * as React from "react"
import { IconEye, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(examples)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(examples)/dashboard/components/resource-pages/delete-confirm-dialog"
// import { ResourceLoadingState } from "@/app/(examples)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import { createColumns, type ColumnConfig } from "@/app/(examples)/dashboard/components/table/columns-factory"
import {
  deleteNamespace,
  fetchNamespaceYaml,
  fetchNamespaces,
  type NamespaceRow,
} from "@/app/lib/kubespark/projects"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/registry/new-york-v4/ui/alert"
import { Input } from "@/registry/new-york-v4/ui/input"

const projectColumns: ColumnConfig<NamespaceRow>[] = [
  { key: "name", label: "名称", cellClassName: "font-medium", enableHiding: false },
  { key: "status", label: "状态", render: "status" },
  { key: "labels", label: "标签", align: "right" },
  { key: "annotations", label: "注解", align: "right" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function ProjectsPageClient() {
  const [rows, setRows] = React.useState<NamespaceRow[]>([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<NamespaceRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: NamespaceRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")

    void fetchNamespaceYaml(row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Projects] view yaml response", {
          namespace: row.name,
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Projects] view yaml request failed", {
          namespace: row.name,
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: NamespaceRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteNamespace(pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Projects] delete request failed", {
          namespace: pendingDeleteRow.name,
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: NamespaceRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(selectedRows.map((row) => deleteNamespace(row.name))).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Projects] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<NamespaceRow>({
        columns: projectColumns,
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {"查看 YAML"}
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
                {"删除"}
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              requestDelete(row)
            },
          },
        ],
      }),
    [handleViewYaml, requestDelete]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const items = await fetchNamespaces()
        if (cancelled) return
        setRows(items)
        setError(null)
      } catch (e: any) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e?.message || "API request failed")
        } else {
          console.error("[Projects] polling refresh failed", e)
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
          <AlertTitle>加载失败</AlertTitle>
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

  const projectFilters = (
    <Input
      value={nameQuery}
      onChange={(event) => setNameQuery(event.target.value)}
      placeholder="名称"
      className="h-9 w-40"
    />
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
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title="删除项目"
        description={
          pendingDeleteRow
            ? `确定删除项目 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarEnd={projectFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
