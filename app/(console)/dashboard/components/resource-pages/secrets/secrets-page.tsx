"use client"

import * as React from "react"
import { IconEye, IconPencil, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  CreateKeyValueResourceDialog,
  type KeyValueDialogInitialValues,
} from "@/app/(console)/dashboard/components/resource-pages/create-key-value-resource-dialog"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  fetchSecretRows,
  type SecretResourceRow,
} from "@/app/lib/kubespark/resource-rows"
import { fetchResourceByName } from "@/app/lib/kubespark/common"
import { createSecret, updateSecret } from "@/app/lib/kubespark/secrets"
import { deleteSecret } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

type SecretRow = SecretResourceRow
type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function decodeBase64ToUtf8(value: string): string {
  try {
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const binary = window.atob(value)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes)
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64").toString("utf8")
    }
  } catch {
    return value
  }

  return value
}

const secretColumns: ColumnConfig<SecretRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "namespace", label: "命名空间" },
  { key: "type", label: "类型", render: "badge" },
  // { key: "dataItems", label: "数据项"},
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function SecretsPageClient() {
  const [rows, setRows] = React.useState<SecretRow[]>([])
  const [namespaceOptions, setNamespaceOptions] = React.useState<
    Array<{ id: string; name: string }>
  >([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("查看 Kubernetes Secret 的 YAML 内容。")
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<SecretRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editInitialValues, setEditInitialValues] = React.useState<KeyValueDialogInitialValues | null>(null)
  const isMountedRef = React.useRef(true)

  const handleViewYaml = React.useCallback((row: SecretRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(`查看 Kubernetes Secret（${row.namespace}/${row.name}）的 YAML 内容。`)

    void fetchNamespacedResourceYaml("secrets", row.namespace, row.name, {
      documentType: "secret",
    })
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Secrets] view yaml response", {
          secret: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载 YAML 失败"
        setYamlError(message)
        console.error("[Secrets] view yaml request failed", {
          secret: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [])

  const requestDelete = React.useCallback((row: SecretRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleEdit = React.useCallback((row: SecretRow) => {
    void fetchResourceByName<unknown>("core", "v1", "secrets", row.name, {
      namespace: row.namespace,
    })
      .then(({ payload }) => {
        const resource = asObject(payload)
        const metadata = asObject(resource.metadata)
        const annotations = asObject(metadata.annotations)
        const labels = asObject(metadata.labels)
        const data = asObject(resource.data)
        const items = Object.entries(data).map(([key, value]) => ({
          key,
          value: decodeBase64ToUtf8(asString(value)),
        }))

        setEditInitialValues({
          name: asString(metadata.name, row.name),
          namespace: asString(metadata.namespace, row.namespace),
          description: asString(annotations.description),
          labels: Object.fromEntries(
            Object.entries(labels).filter(([, value]) => typeof value === "string")
          ) as Record<string, string>,
          annotations: Object.fromEntries(
            Object.entries(annotations).filter(([, value]) => typeof value === "string")
          ) as Record<string, string>,
          type: asString(resource.type, "Opaque"),
          items: items.length > 0 ? items : [],
        })
        setEditDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载保密字典详情失败"
        setError(message)
      })
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteSecret(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Secrets] delete request failed", {
          secret: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: SecretRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deleteSecret(row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Secrets] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<SecretRow>({
        columns: secretColumns,
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
                <IconPencil className="size-4" />
                {"编辑"}
              </>
            ),
            onSelect: (row) => {
              handleEdit(row)
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
    [handleEdit, handleViewYaml, requestDelete]
  )

  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }

    try {
      const [mapped, namespaces] = await Promise.all([
        fetchSecretRows(),
        fetchNamespaces(),
      ])
      if (!isMountedRef.current) return
      setRows(mapped)
      setNamespaceOptions(
        namespaces
          .map((item) => ({ id: item.name, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setError(null)
    } catch (e: unknown) {
      if (!isMountedRef.current) return
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "API request failed")
      } else {
        console.error("[Secrets] polling refresh failed", e)
      }
    } finally {
      if (!silent && isMountedRef.current) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleCreateSubmit = React.useCallback(
    async (payload: {
      name: string
      namespace: string
      description: string
      labels?: Record<string, string>
      annotations?: Record<string, string>
      type?: string
      items: Array<{ key: string; value: string }>
    }) => {
      await createSecret({
        name: payload.name,
        namespace: payload.namespace,
        description: payload.description,
        labels: payload.labels,
        annotations: payload.annotations,
        type: payload.type,
        stringData: Object.fromEntries(payload.items.map((item) => [item.key, item.value])),
      })
      await refreshRows(false)
    },
    [refreshRows]
  )

  const handleEditSubmit = React.useCallback(
    async (payload: {
      name: string
      namespace: string
      description: string
      labels?: Record<string, string>
      annotations?: Record<string, string>
      type?: string
      items: Array<{ key: string; value: string }>
    }) => {
      if (!editInitialValues) {
        throw new Error("编辑上下文丢失，请重新打开编辑弹窗")
      }

      await updateSecret({
        name: editInitialValues.name,
        namespace: editInitialValues.namespace,
        description: payload.description,
        labels: payload.labels,
        annotations: payload.annotations,
        type: payload.type,
        stringData: Object.fromEntries(payload.items.map((item) => [item.key, item.value])),
      })
      await refreshRows(false)
    },
    [editInitialValues, refreshRows]
  )

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      await refreshRows(silent)
      if (cancelled) return
    }

    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [refreshRows])

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{"加载失败"}</AlertTitle>
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

  const secretFilters = (
    <>
      <FilterCombobox
        options={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={"命名空间"}
        emptyText={"未找到命名空间"}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={"名称"}
        className="h-9 w-40"
      />
    </>
  )

  return (
    <>
      <CreateKeyValueResourceDialog
        kind="secret"
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        namespaceOptions={namespaceOptions}
        onSubmit={handleCreateSubmit}
      />
      <CreateKeyValueResourceDialog
        kind="secret"
        mode="edit"
        open={editDialogOpen}
        onOpenChange={(nextOpen) => {
          setEditDialogOpen(nextOpen)
          if (!nextOpen) {
            setEditInitialValues(null)
          }
        }}
        initialValues={editInitialValues}
        namespaceOptions={namespaceOptions}
        onSubmit={handleEditSubmit}
      />
      <MonacoViewerDialog
        title="查看YAML"
        subtitle={yamlSubtitle}
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
        title="删除保密字典"
        description={
          pendingDeleteRow
            ? `确定删除保密字典 ${pendingDeleteRow.name} 吗？`
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => setCreateDialogOpen(true)}
        toolbarEnd={secretFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}
