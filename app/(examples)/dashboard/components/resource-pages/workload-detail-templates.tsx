"use client"

import * as React from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type WorkloadDetailKind = "Deployment" | "StatefulSet" | "DaemonSet"

type WorkloadDetailTemplateProps = {
  kind: WorkloadDetailKind
  name: string
  namespace?: string
  backHref?: string
}

type InfoRow = { key: string; value: string }
type DetailTab = "basic" | "metadata" | "env" | "events"

function InfoRows({ rows }: { rows: InfoRow[] }) {
  return (
      <div className="space-y-4">
        {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[96px_1fr] items-start gap-4 text-sm leading-6">
              <div className="text-muted-foreground">{row.key}:</div>
              <div className="font-medium">{row.value}</div>
            </div>
        ))}
      </div>
  )
}

export function WorkloadDetailTemplate({ kind, namespace }: WorkloadDetailTemplateProps) {
  const [activeTab, setActiveTab] = React.useState<DetailTab>("basic")
  const project = namespace?.trim() || "ripples"
  const basicInfoRows: InfoRow[] = [
    { key: "类型", value: kind },
    { key: "集群", value: "default" },
    { key: "项目", value: project },
    { key: "应用", value: "-" },
    { key: "创建时间", value: "2025-08-15 11:33:06" },
    { key: "更新时间", value: "2026-03-27 15:23:50" },
    { key: "创建者", value: "-" },
  ]

  const metadataRows: InfoRow[] = [
    { key: "标签", value: "app=ripplescloud-user-center, project=ripples" },
    { key: "注解", value: "description=用户中心服务" },
  ]

  const envRows: InfoRow[] = [
    { key: "ENV", value: "prod" },
    { key: "LOG_LEVEL", value: "info" },
    { key: "TZ", value: "Asia/Shanghai" },
  ]

  const eventRows: InfoRow[] = [
    { key: "最近事件", value: "2026-03-27 15:23:50 滚动更新完成" },
    { key: "上一条事件", value: "2026-03-27 15:22:10 新副本已就绪" },
    { key: "状态", value: "Normal" },
  ]

  const renderTabContent = () => {
    if (activeTab === "basic") {
      return (
          <div>
            hello
          </div>
      )
    }
    if (activeTab === "metadata") {
      return (
          <div>
            <InfoRows rows={metadataRows} />
          </div>
      )
    }
    if (activeTab === "env") {
      return (
          <div>
            <InfoRows rows={envRows} />
          </div>
      )
    }
    if (activeTab === "events") {
      return (
          <div>
            <InfoRows rows={envRows} />
          </div>
      )
    }
  }

  return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as DetailTab)}
              className="w-fit"
          >
            <TabsList>
              <TabsTrigger value="basic">基本信息</TabsTrigger>
              <TabsTrigger value="metadata">标签与注解</TabsTrigger>
              <TabsTrigger value="env">环境变量</TabsTrigger>
              <TabsTrigger value="events">事件报告</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mt-4">
          {renderTabContent()}
        </div>
      </div>
  )
}
