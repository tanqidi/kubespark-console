"use client"

import * as React from "react"
import { IconPlayerPlay } from "@tabler/icons-react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  createPipelineRun,
  fetchPipelineRunRows,
  type PipelineRunRow,
} from "@/app/lib/kubespark/pipelines"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PipelineRunsPageClientProps = {
  pipelineName: string
}

const pipelineRunColumns: ColumnConfig<PipelineRunRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
  },
  { key: "triggerType", label: "触发方式" },
  { key: "phase", label: "状态", render: "status" },
  { key: "buildNumber", label: "构建号" },
  { key: "age", label: "运行时间" },
  { key: "updatedAt", label: "更新时间" },
]

export function PipelineRunsPageClient({ pipelineName }: PipelineRunsPageClientProps) {
  const normalizedPipelineName = pipelineName.trim()
  const [rows, setRows] = React.useState<PipelineRunRow[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [running, setRunning] = React.useState(false)
  const [nameQuery, setNameQuery] = React.useState("")

  const loadRows = React.useCallback(
    async (silent: boolean) => {
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      try {
        const items = await fetchPipelineRunRows(normalizedPipelineName)
        setRows(items)
        if (!silent) setError(null)
      } catch (e: unknown) {
        if (!silent) setError(e instanceof Error ? e.message : "加载运行记录失败")
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [normalizedPipelineName]
  )

  React.useEffect(() => {
    void loadRows(false)
    const timer = window.setInterval(() => {
      void loadRows(true)
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [loadRows])

  const handleRun = React.useCallback(() => {
    if (running) return
    setRunning(true)
    setError(null)
    void createPipelineRun({ pipelineName: normalizedPipelineName })
      .then(async () => {
        await loadRows(false)
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "触发流水线运行失败")
      })
      .finally(() => {
        setRunning(false)
      })
  }, [loadRows, normalizedPipelineName, running])

  const columns = React.useMemo(
    () =>
      createColumns<PipelineRunRow>({
        columns: pipelineRunColumns,
        actionItems: [
          {
            label: "打开构建",
            onSelect: (row) => {
              if (!row.buildLink) return
              window.open(row.buildLink, "_blank", "noopener,noreferrer")
            },
          },
        ],
      }),
    []
  )

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  if (error && !loading) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>加载失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <DataTable
        data={filteredRows}
        columns={columns}
        toolbarEnd={
          <div className="flex items-center gap-2">
            <Input
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              placeholder="名称"
              className="h-9 w-40"
            />
            <Button type="button" variant="outline" size="sm" onClick={handleRun} disabled={running}>
              <IconPlayerPlay className="size-4" />
              {running ? "触发中..." : "立即运行"}
            </Button>
          </div>
        }
      />
    </div>
  )
}
