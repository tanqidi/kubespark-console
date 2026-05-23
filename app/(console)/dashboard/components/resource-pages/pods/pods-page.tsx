"use client"

import * as React from "react"
import { IconEye, IconFileText, IconInfoCircle, IconTerminal2, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { CreatePodDialog } from "@/app/(console)/dashboard/components/resource-pages/pods/create-pod-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  buildPodExecWsEndpoint,
  buildPodDescribeEndpoint,
  buildPodLogsEndpoint,
  deletePod,
  createPod,
  fetchNamespacedPodDescribe,
  fetchNamespacedPodYaml,
  fetchNamespacedPodLogs,
  fetchPodResourceRows,
  updatePod,
  type PodResourceRow,
} from "@/app/lib/kubespark/pods"
import { fetchTextStream } from "@/app/lib/kubespark/common"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { LogViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/log-viewer-dialog"
import { TerminalViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/terminal-viewer-dialog"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { useTranslations } from "@/app/lib/i18n"
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh"

type PodRow = PodResourceRow

function getPodColumns(t: (key: string) => string) {
  return [
    {
      key: "name" as const,
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value: unknown, row: PodResourceRow) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "status" as const, label: t("table.columns.status"), render: "status" as const },
    { key: "namespace" as const, label: t("table.columns.namespace") },
    { key: "node" as const, label: t("table.columns.node") },
    { key: "ip" as const, label: t("table.columns.ip") },
    { key: "age" as const, label: t("table.columns.age") },
    { key: "updatedAt" as const, label: t("table.columns.updatedAt") },
  ]
}

export function PodsPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<PodRow[]>([])
  const [createNamespaceOptions, setCreateNamespaceOptions] = React.useState<Array<{ id: string; name: string }>>([])
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editInitialYamlText, setEditInitialYamlText] = React.useState<string | null>(null)
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState("")
  const [logsOpen, setLogsOpen] = React.useState(false)
  const [logsTitle, setLogsTitle] = React.useState("")
  const [logsSubtitle, setLogsSubtitle] = React.useState("")
  const [logsContent, setLogsContent] = React.useState("")
  const [logsLoading, setLogsLoading] = React.useState(false)
  const [logsError, setLogsError] = React.useState<string | null>(null)
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeTarget, setDescribeTarget] = React.useState<Pick<PodRow, "name" | "namespace"> | null>(null)
  const [logsTarget, setLogsTarget] = React.useState<Pick<PodRow, "name" | "namespace"> | null>(null)
  const [realtimeLogs, setRealtimeLogs] = React.useState(false)
  const [logsDownloading, setLogsDownloading] = React.useState(false)
  const [terminalOpen, setTerminalOpen] = React.useState(false)
  const [terminalTitle, setTerminalTitle] = React.useState("")
  const [terminalSubtitle, setTerminalSubtitle] = React.useState("")
  const [terminalWsUrl, setTerminalWsUrl] = React.useState<string | null>(null)
  const logsAbortRef = React.useRef<AbortController | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<PodRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  const handleViewYaml = React.useCallback((row: PodRow) => {
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("pods.viewYamlSubtitle", { namespace: row.namespace, name: row.name }))

    void fetchNamespacedPodYaml(row.namespace, row.name)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Pods] view yaml response", {
          pod: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("pods.loadYamlFailed")
        setYamlError(message)
        console.error("[Pods] view yaml request failed", {
          pod: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const handleViewLogs = React.useCallback((row: PodRow) => {
    setLogsOpen(true)
    setLogsTitle(t("table.actions.logs"))
    setLogsSubtitle(t("pods.viewLogsSubtitle", { namespace: row.namespace, name: row.name }))
    setLogsTarget({ name: row.name, namespace: row.namespace })
    setLogsContent("")
  }, [t])

  const handleOpenTerminal = React.useCallback((row: PodRow) => {
    const wsUrl = buildPodExecWsEndpoint(row.namespace, row.name, {
      command: ["/bin/sh"],
    })
    setTerminalTitle(t("dialogs.viewTerminal.title"))
    setTerminalSubtitle(t("pods.viewTerminalSubtitle", { namespace: row.namespace, name: row.name }))
    setTerminalWsUrl(wsUrl)
    setTerminalOpen(true)
  }, [t])

  const handleViewDescribe = React.useCallback((row: PodRow) => {
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeTarget({ name: row.name, namespace: row.namespace })

    void fetchNamespacedPodDescribe(row.namespace, row.name)
      .then(({ requestUrl, text }) => {
        setDescribeContent(text || t("pods.noOutput"))
        console.log("[Pods] view describe response", {
          pod: { name: row.name, namespace: row.namespace },
          requestUrl,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("pods.loadDetailsFailed")
        setDescribeError(message)
        console.error("[Pods] view describe request failed", {
          pod: { name: row.name, namespace: row.namespace },
          requestUrl: buildPodDescribeEndpoint(row.namespace, row.name),
          error: e,
        })
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [t])

  React.useEffect(() => {
    if (!logsOpen || !logsTarget) return

    logsAbortRef.current?.abort()
    const controller = new AbortController()
    logsAbortRef.current = controller

    setLogsError(null)
    setLogsLoading(true)

    if (!realtimeLogs) {
      void fetchNamespacedPodLogs(logsTarget.namespace, logsTarget.name, { tailLines: 500 })
        .then(({ text }) => {
          if (controller.signal.aborted) return
          setLogsContent(text || t("pods.noLogsOutput"))
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return
          const message = e instanceof Error ? e.message : t("pods.loadLogsFailed")
          setLogsError(message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLogsLoading(false)
        })
      return () => {
        controller.abort()
      }
    }

    const requestUrl = buildPodLogsEndpoint(logsTarget.namespace, logsTarget.name, {
      tailLines: 200,
      follow: true,
    })

    void fetchTextStream(requestUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.body) {
          throw new Error(t("pods.logStreamUnavailable"))
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf-8")

        setLogsLoading(false)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value || controller.signal.aborted) continue
          const chunk = decoder.decode(value, { stream: true })
          if (chunk) {
            setLogsContent((prev) => `${prev}${chunk}`)
          }
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        const message = e instanceof Error ? e.message : t("pods.loadLogsFailed")
        setLogsError(message)
        setLogsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [logsOpen, logsTarget, realtimeLogs, t])

  React.useEffect(() => {
    return () => {
      logsAbortRef.current?.abort()
    }
  }, [])

  const handleDownloadLogs = React.useCallback(() => {
    if (!logsTarget || logsDownloading) return
    setLogsDownloading(true)
    void fetchNamespacedPodLogs(logsTarget.namespace, logsTarget.name, { tailLines: 2000 })
      .then(({ text }) => {
        const fileNameBase = logsTarget.name.trim() || "container-logs"
        const safeBase = fileNameBase.replace(/[\\/:*?"<>|]/g, "_")
        const blob = new Blob([text || t("pods.noLogsOutput")], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const link = document.createElement("a")
        link.href = url
        link.download = `${safeBase}.txt`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("pods.loadLogsFailed")
        setLogsError(message)
      })
      .finally(() => {
        setLogsDownloading(false)
      })
  }, [logsDownloading, logsTarget, t])

  const requestDelete = React.useCallback((row: PodRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deletePod(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("pods.deleteFailed")
        setError(message)
        console.error("[Pods] delete request failed", {
          pod: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: PodRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deletePod(row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : t("pods.deleteFailed")
      setError(message)
      console.error("[Pods] bulk delete request failed", e)
    })
  }, [t])

  const columns = React.useMemo(
    () =>
      createColumns<PodRow>({
        columns: getPodColumns(t),
        actionItems: [
          {
            label: (
              <>
                <IconEye className="size-4" />
                {t("actions.viewYaml")}
              </>
            ),
            onSelect: (row) => {
              handleViewYaml(row)
            },
          },
          {
            label: (
              <>
                <IconFileText className="size-4" />
                {t("actions.logs")}
              </>
            ),
            onSelect: (row) => {
              handleViewLogs(row)
            },
          },
          {
            label: (
              <>
                <IconInfoCircle className="size-4" />
                {t("actions.details")}
              </>
            ),
            onSelect: (row) => {
              handleViewDescribe(row)
            },
          },
          {
            label: (
              <>
                <IconTerminal2 className="size-4" />
                {t("actions.terminal")}
              </>
            ),
            onSelect: (row) => {
              handleOpenTerminal(row)
            },
          },
          /*{
            label: (
              <>
                <IconPencil className="size-4" />
                {t("actions.edit")}
              </>
            ),
            onSelect: (row) => {
              handleEdit(row)
            },
          },*/
          {
            label: (
              <>
                <IconTrash className="size-4" />
                {t("actions.delete")}
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
    [handleOpenTerminal, handleViewDescribe, handleViewLogs, handleViewYaml, requestDelete, t]
  )

  const loadRows = React.useCallback(async (silent: boolean = false) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [mapped, namespacesResult] = await Promise.all([
        fetchPodResourceRows(),
        fetchNamespaces().catch(() => []),
      ])
      setRows(mapped)
      setCreateNamespaceOptions(
        namespacesResult
          .map((item) => ({ id: item.name, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : "API request failed")
      } else {
        console.error("[Pods] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadRows(false)
  }, [loadRows])

  useIntervalRefresh(() => loadRows(true), 3000)

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
          <AlertTitle>{t("table.alerts.loadFailed")}</AlertTitle>
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
        placeholder={t("table.filters.namespace")}
        emptyText={t("table.filters.noNamespaces")}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={t("table.filters.name")}
        className="h-9 w-40"
      />
    </>
  )

  return (
    <>
      <CreatePodDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        namespaceOptions={createNamespaceOptions}
        onSubmit={async (payload) => {
          await createPod(payload)
          await refreshRows()
        }}
      />
      <CreatePodDialog
        mode="edit"
        open={editDialogOpen}
        onOpenChange={(nextOpen) => {
          setEditDialogOpen(nextOpen)
          if (!nextOpen) setEditInitialYamlText(null)
        }}
        initialYamlText={editInitialYamlText}
        namespaceOptions={createNamespaceOptions}
        onSubmit={async (payload) => {
          await updatePod(payload)
          await refreshRows()
        }}
      />
      <MonacoViewerDialog
        title={t("dialogs.viewYaml.title")}
        subtitle={yamlSubtitle}
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DescribeViewerDialog
        title={t("dialogs.viewDetails.title")}
        subtitle={describeTarget ? t("pods.viewDetailsSubtitle", { namespace: describeTarget.namespace, name: describeTarget.name }) : ""}
        open={describeOpen}
        onOpenChange={(open) => {
          setDescribeOpen(open)
          if (!open) setDescribeTarget(null)
        }}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <LogViewerDialog
        open={logsOpen}
        onOpenChange={(open) => {
          setLogsOpen(open)
          if (!open) {
            logsAbortRef.current?.abort()
            setRealtimeLogs(false)
          }
        }}
        title={logsTitle}
        subtitle={logsSubtitle}
        realtime={realtimeLogs}
        onRealtimeChange={setRealtimeLogs}
        loading={logsLoading}
        error={logsError}
        content={logsContent}
        onDownload={handleDownloadLogs}
        downloadDisabled={!logsTarget || logsDownloading}
      />
      <TerminalViewerDialog
        open={terminalOpen}
        onOpenChange={(open) => {
          setTerminalOpen(open)
          if (!open) setTerminalWsUrl(null)
        }}
        title={terminalTitle}
        subtitle={terminalSubtitle}
        wsUrl={terminalWsUrl}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title={t("dialogs.delete.title")}
        description={
          pendingDeleteRow
            ? t("dialogs.delete.description", { name: pendingDeleteRow.name })
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarEnd={podFilters}
        onCreate={() => setCreateDialogOpen(true)}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}

