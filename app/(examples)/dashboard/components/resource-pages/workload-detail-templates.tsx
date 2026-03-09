import { IconArrowLeft, IconChevronDown } from "@tabler/icons-react"
import Link from "next/link"

import { Button } from "@/registry/new-york-v4/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/registry/new-york-v4/ui/card"
import { Separator } from "@/registry/new-york-v4/ui/separator"

export type WorkloadDetailKind = "Deployment" | "StatefulSet" | "DaemonSet"

type WorkloadDetailTemplateProps = {
  kind: WorkloadDetailKind
  name: string
  namespace?: string
  backHref: string
}

const workloadLabelByKind: Record<WorkloadDetailKind, string> = {
  Deployment: "部署",
  StatefulSet: "有状态副本集",
  DaemonSet: "守护进程集",
}

function resolveProject(namespace?: string) {
  const text = namespace?.trim()
  return text && text.length > 0 ? text : "-"
}

export function WorkloadDetailLeftTemplate({
  kind,
  name,
  namespace,
  backHref,
}: WorkloadDetailTemplateProps) {
  const label = workloadLabelByKind[kind]
  const namespaceText = namespace?.trim() || "default"
  const versionHint = `${namespaceText}/${name}`
  const detailRows = [
    { label: "集群", value: "default" },
    { label: "项目", value: resolveProject(namespace) },
    { label: "应用", value: "-" },
    { label: "创建时间", value: "-" },
    { label: "更新时间", value: "-" },
    { label: "创建者", value: "-" },
  ]

  return (
    <Card className="overflow-hidden gap-0 py-0 shadow-sm">
      <CardHeader className="px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2 h-7 px-2 text-xs">
            <Link href={backHref}>
              <IconArrowLeft data-icon="inline-start" />
              {label}
            </Link>
          </Button>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 rounded-md px-2.5 text-xs">
              编辑信息
            </Button>
            <Button variant="ghost" size="sm" className="h-7 rounded-md px-2.5 text-xs">
              更多操作
              <IconChevronDown data-icon="inline-end" />
            </Button>
          </div>
        </div>
        <CardTitle className="mt-2 break-all text-base font-semibold leading-tight">{name}</CardTitle>
        <CardDescription className="break-all text-xs">{versionHint}</CardDescription>
      </CardHeader>

      <Separator />

      <CardContent className="px-4 py-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">详情</h3>
          <p className="text-[11px] text-muted-foreground">{kind}</p>
        </div>
        <dl className="mt-1 divide-y divide-border/70">
          {detailRows.map((row) => (
            <div key={row.label} className="grid grid-cols-[72px_1fr] items-start gap-3 py-2.5">
              <dt className="text-xs leading-5 text-muted-foreground">{row.label}</dt>
              <dd className="text-sm leading-5">{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export function WorkloadDetailRightTemplate({
  kind,
  name,
}: Pick<WorkloadDetailTemplateProps, "kind" | "name">) {
  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      右侧模板内容占位：{kind} / {name}
    </div>
  )
}
