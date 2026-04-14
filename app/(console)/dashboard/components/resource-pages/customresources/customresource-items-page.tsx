"use client"

import * as React from "react"
import { IconTrash } from "@tabler/icons-react"
import { stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { deleteResource, fetchResourceByName } from "@/app/lib/kubespark/common"
import {
  fetchCustomResourceDefinitionRows,
  fetchCustomResourceItemRows,
  type CustomResourceDefinitionRow,
  type CustomResourceItemRow,
} from "@/app/lib/kubespark/resource-rows"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"

type CustomResourceItemsPageClientProps = {
  definitionName: string
}

function sanitizeCustomResourceYamlPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload
  const root = payload as Record<string, unknown>
  const metadata =
    root.metadata && typeof root.metadata === "object" && !Array.isArray(root.metadata)
      ? ({ ...(root.metadata as Record<string, unknown>) })
      : null

  if (!metadata) return payload
  delete metadata.managedFields

  return {
    ...root,
    metadata,
  }
}

const itemColumns: ColumnConfig<CustomResourceItemRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function CustomResourceItemsPageClient({ definitionName }: CustomResourceItemsPageClientProps) {
  const normalizedName = definitionName.trim()
  const [definition, setDefinition] = React.useState<CustomResourceDefinitionRow | null>(null)
  const [rows, setRows] = React.useState<CustomResourceItemRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [nameQuery, setNameQuery] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<CustomResourceItemRow | null>(null)
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlContent, setYamlContent] = React.useState("")

  const columns = React.useMemo(
    () =>
      createColumns<CustomResourceItemRow>({
        columns: itemColumns,
        actionItems: [
          {
            label: "查看 YAML",
            onSelect: (row) => {
              if (!definition) return
              const namespace = row.namespace && row.namespace !== "-" ? row.namespace : undefined

              setYamlOpen(true)
              setYamlLoading(true)
              setYamlError(null)
              setYamlContent("")

              void fetchResourceByName<unknown>(
                definition.group,
                definition.version,
                definition.resource,
                row.name,
                namespace ? { namespace } : undefined
              )
                .then(({ payload }) => {
                  const sanitizedPayload = sanitizeCustomResourceYamlPayload(payload)
                  setYamlContent(
                    stringify(sanitizedPayload, {
                      indent: 2,
                      lineWidth: 0,
                      sortMapEntries: false,
                    })
                  )
                })
                .catch((e: unknown) => {
                  setYamlError(e instanceof Error ? e.message : "加载 YAML 失败")
                })
                .finally(() => {
                  setYamlLoading(false)
                })
            },
          },
          {
            label: (
              <>
                <IconTrash className="size-4" />
                删除
              </>
            ),
            variant: "destructive",
            withSeparator: true,
            onSelect: (row) => {
              setPendingDeleteRow(row)
            },
          },
        ],
      }),
    [definition]
  )

  const loadRows = React.useCallback(async (silent: boolean) => {
    if (!silent) setError(null)

    try {
      const definitions = await fetchCustomResourceDefinitionRows(1000)
      const target = definitions.find((item) => item.name === normalizedName) ?? null
      if (!target) {
        if (!silent) {
          setDefinition(null)
          setRows([])
          setError(`未找到 CRD：${normalizedName}`)
        }
        return
      }

      setDefinition(target)
      const items = await fetchCustomResourceItemRows(target)
      setRows(items)
      if (!silent) setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "加载 CRD 实例失败")
      }
    }
  }, [normalizedName])

  React.useEffect(() => {
    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [loadRows])

  const handleDeleteSelectedRows = React.useCallback(
    (selectedRows: CustomResourceItemRow[]) => {
      if (!definition || selectedRows.length === 0 || deleting) return

      setDeleting(true)
      setError(null)

      const tasks = selectedRows.map((row) => {
        const namespace = row.namespace && row.namespace !== "-" ? row.namespace : undefined
        return deleteResource(definition.group, definition.version, definition.resource, row.name, namespace)
      })

      void Promise.all(tasks)
        .then(() => {
          void loadRows(false)
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "批量删除失败")
        })
        .finally(() => {
          setDeleting(false)
        })
    },
    [definition, deleting, loadRows]
  )

  const handleConfirmDelete = React.useCallback(() => {
    if (!definition || !pendingDeleteRow || deleting) return

    const namespace =
      pendingDeleteRow.namespace && pendingDeleteRow.namespace !== "-"
        ? pendingDeleteRow.namespace
        : undefined

    setDeleting(true)
    setError(null)
    void deleteResource(definition.group, definition.version, definition.resource, pendingDeleteRow.name, namespace)
      .then(() => {
        setPendingDeleteRow(null)
        void loadRows(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "删除失败")
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [definition, deleting, loadRows, pendingDeleteRow])

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

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        title="删除自定义资源实例"
        description={pendingDeleteRow ? `确定删除 ${pendingDeleteRow.name} 吗？` : ""}
        deleting={deleting}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        onConfirm={handleConfirmDelete}
      />
      <MonacoViewerDialog
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        title="查看 YAML"
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onDeleteSelectedRows={handleDeleteSelectedRows}
        toolbarEnd={
          <Input
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="名称"
            className="h-9 w-40"
          />
        }
      />
    </div>
  )
}
