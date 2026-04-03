"use client"

import * as React from "react"
import { IconEye, IconFileText, IconPencil, IconTerminal2, IconTrash } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { CreatePodDialog } from "@/app/(console)/dashboard/components/resource-pages/pods/create-pod-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  buildPodExecWsEndpoint,
  buildPodLogsEndpoint,
  deletePod,
  createPod,
  fetchNamespacedPodYaml,
  fetchNamespacedPodLogs,
  fetchPodResourceRows,
  updatePod,
  type PodResourceRow,
} from "@/app/lib/kubespark/pods"
import { fetchTextStream } from "@/app/lib/kubespark/common"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { LogViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/log-viewer-dialog"
import { TerminalViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/terminal-viewer-dialog"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"

type PodRow = PodResourceRow

export function PodsPageClient() {
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
  const [logsOpen, setLogsOpen] = React.useState(false)
  const [logsTitle, setLogsTitle] = React.useState("查看日志")
  const [logsSubtitle, setLogsSubtitle] = React.useState("查看 Kubernetes Pod 的日志内容。")
  const [logsContent, setLogsContent] = React.useState("")
  const [logsLoading, setLogsLoading] = React.useState(false)
  const [logsError, setLogsError] = React.useState<string | null>(null)
  const [logsTarget, setLogsTarget] = React.useState<Pick<PodRow, "name" | "namespace"> | null>(null)
  const [realtimeLogs, setRealtimeLogs] = React.useState(false)
  const [logsDownloading, setLogsDownloading] = React.useState(false)
  const [terminalOpen, setTerminalOpen] = React.useState(false)
  const [terminalTitle, setTerminalTitle] = React.useState("查看终端")
  const [terminalSubtitle, setTerminalSubtitle] = React.useState("连接 Kubernetes Pod 的终端会话。")
  const [terminalWsUrl, setTerminalWsUrl] = React.useState<string | null>(null)
  const logsAbortRef = React.useRef<AbortController | null>(null)
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<PodRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

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

  const handleViewLogs = React.useCallback((row: PodRow) => {
    setLogsOpen(true)
    setLogsTitle("查看日志")
    setLogsSubtitle(`查看 Kubernetes Pod（${row.namespace}/${row.name}）的日志内容。`)
    setLogsTarget({ name: row.name, namespace: row.namespace })
    setLogsContent("")
  }, [])

  const handleOpenTerminal = React.useCallback((row: PodRow) => {
    const token =
      (typeof window !== "undefined"
        ? localStorage.getItem("kubespark_token") || sessionStorage.getItem("kubespark_token")
        : "") || ""
    const wsUrl = buildPodExecWsEndpoint(row.namespace, row.name, {
      tty: true,
      command: ["/bin/sh"],
      token,
    })
    setTerminalTitle("查看终端")
    setTerminalSubtitle(`连接 Kubernetes Pod（${row.namespace}/${row.name}）的终端会话。`)
    setTerminalWsUrl(wsUrl)
    setTerminalOpen(true)
  }, [])

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
          setLogsContent(text || "(无日志输出)")
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted) return
          const message = e instanceof Error ? e.message : "加载日志失败"
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
          throw new Error("日志流不可用")
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
        const message = e instanceof Error ? e.message : "加载日志失败"
        setLogsError(message)
        setLogsLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [logsOpen, logsTarget, realtimeLogs])

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
        const blob = new Blob([text || "(无日志输出)"], { type: "text/plain;charset=utf-8" })
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
        const message = e instanceof Error ? e.message : "下载日志失败"
        setLogsError(message)
      })
      .finally(() => {
        setLogsDownloading(false)
      })
  }, [logsDownloading, logsTarget])

  const requestDelete = React.useCallback((row: PodRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleEdit = React.useCallback((row: PodRow) => {
    void fetchNamespacedPodYaml(row.namespace, row.name)
      .then(({ text }) => {
        setEditInitialYamlText(text)
        setEditDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "加载容器组详情失败"
        setError(message)
      })
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deletePod(pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : "删除失败"
        setError(message)
        console.error("[Pods] delete request failed", {
          pod: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: PodRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deletePod(row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : "删除失败"
      setError(message)
      console.error("[Pods] bulk delete request failed", e)
    })
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<PodRow>({
        columns: [
          {
            key: "name",
            label: "\u540d\u79f0",
            enableHiding: false,
            cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
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
                <IconFileText className="size-4" />
                {"日志"}
              </>
            ),
            onSelect: (row) => {
              handleViewLogs(row)
            },
          },
          {
            label: (
              <>
                <IconTerminal2 className="size-4" />
                {"终端"}
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
                {"编辑"}
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
                {"\u5220\u9664"}
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
    [handleEdit, handleOpenTerminal, handleViewLogs, handleViewYaml, requestDelete]
  )

  const refreshRows = React.useCallback(async () => {
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
  }, [])

  React.useEffect(() => {
    let cancelled = false

    const loadRows = async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const [mapped, namespacesResult] = await Promise.all([
          fetchPodResourceRows(),
          fetchNamespaces().catch(() => []),
        ])
        if (cancelled) return
        setRows(mapped)
        setCreateNamespaceOptions(
          namespacesResult
            .map((item) => ({ id: item.name, name: item.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        setError(null)
      } catch (e: unknown) {
        if (cancelled) return
        if (!silent) {
          setRows([])
          setError(e instanceof Error ? e.message : "API request failed")
        } else {
          console.error("[Pods] polling refresh failed", e)
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
  }, [refreshRows])

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
        title="查看YAML"
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
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
        title="删除容器组"
        description={
          pendingDeleteRow
            ? `确定删除容器组 ${pendingDeleteRow.name} 吗？`
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

