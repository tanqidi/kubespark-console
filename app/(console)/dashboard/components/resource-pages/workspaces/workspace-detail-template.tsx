"use client"

import * as React from "react"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  createColumns,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { fetchWorkspaceDetail, type WorkspaceDetail } from "@/app/lib/kubespark/workspaces"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type WorkspaceDetailTemplateProps = {
  name: string
}

type DetailTab = "projects" | "pipelineProjects" | "roles" | "members"

type WorkspaceDetailRow = {
  id: string
  name: string
  owner?: string
  description?: string
  repository?: string
  branch?: string
  lastRun?: string
  role?: string
  scope?: string
  bindings?: string
  member?: string
  status?: string
}

const projectColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "name", label: "名称", enableHiding: false },
  { key: "owner", label: "负责人" },
  { key: "description", label: "描述" },
]

const pipelineProjectColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "name", label: "名称", enableHiding: false },
  { key: "repository", label: "Git 地址" },
  { key: "branch", label: "分支" },
  { key: "lastRun", label: "最近构建" },
]

const roleColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "role", label: "角色", enableHiding: false },
  { key: "scope", label: "作用域" },
  { key: "bindings", label: "绑定数", align: "right" },
]

const memberColumns: ColumnConfig<WorkspaceDetailRow>[] = [
  { key: "member", label: "成员", enableHiding: false },
  { key: "role", label: "角色" },
  { key: "status", label: "状态", render: "status" },
]

export function WorkspaceDetailTemplate({ name }: WorkspaceDetailTemplateProps) {
  const [activeTab, setActiveTab] = React.useState<DetailTab>("projects")
  const [error, setError] = React.useState<string | null>(null)
  const [detail, setDetail] = React.useState<WorkspaceDetail | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setError(null)

    void fetchWorkspaceDetail(name)
      .then((next) => {
        if (cancelled) return
        setDetail(next)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "加载企业空间详情失败")
      })

    return () => {
      cancelled = true
    }
  }, [name])

  if (error) {
    return <div className="text-sm text-destructive">{error}</div>
  }

  if (!detail) return null

  const projectRows: WorkspaceDetailRow[] = [
    {
      id: `project-${detail.name}`,
      name: detail.name || "-",
      owner: detail.owner || "-",
      description: detail.description || "-",
    },
  ]

  const pipelineRows: WorkspaceDetailRow[] = [
    {
      id: `pipeline-${detail.name}`,
      name: detail.name || "-",
      repository: "-",
      branch: "-",
      lastRun: "-",
    },
  ]

  const roleRows: WorkspaceDetailRow[] = [
    {
      id: `role-owner-${detail.name}`,
      role: "workspace-admin",
      scope: "Workspace",
      bindings: "1",
    },
  ]

  const memberRows: WorkspaceDetailRow[] = [
    {
      id: `member-owner-${detail.name}`,
      member: detail.owner || "-",
      role: "workspace-admin",
      status: "Normal",
    },
  ]

  const columns = createColumns<WorkspaceDetailRow>({
    columns:
      activeTab === "projects"
        ? projectColumns
        : activeTab === "pipelineProjects"
          ? pipelineProjectColumns
          : activeTab === "roles"
            ? roleColumns
            : memberColumns,
    includeActions: false,
  })

  const data =
    activeTab === "projects"
      ? projectRows
      : activeTab === "pipelineProjects"
        ? pipelineRows
        : activeTab === "roles"
          ? roleRows
          : memberRows

  const tabs = (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DetailTab)} className="w-fit">
      <TabsList>
        <TabsTrigger value="projects">项目</TabsTrigger>
        <TabsTrigger value="pipelineProjects">流水线项目</TabsTrigger>
        <TabsTrigger value="roles">角色</TabsTrigger>
        <TabsTrigger value="members">企业空间成员</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      toolbarStart={tabs}
      enableRowNavigation={false}
      getRowHref={() => null}
    />
  )
}
