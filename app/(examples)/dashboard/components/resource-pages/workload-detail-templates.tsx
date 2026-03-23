import * as React from "react"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
  IconPlus,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type WorkloadDetailKind = "Deployment" | "StatefulSet" | "DaemonSet"

type WorkloadDetailTemplateProps = {
  kind: WorkloadDetailKind
  name: string
  namespace?: string
  backHref?: string
}

const tableHeaders = [
  "名称",
  "状态",
  "命名空间",
  "期望",
  "就绪",
  "运行时间",
  "更新时间",
]

export function WorkloadDetailTemplate({
  kind,
  name: _name,
  namespace: _namespace,
  backHref: _backHref,
}: WorkloadDetailTemplateProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 px-4 lg:px-6">
        <Tabs value={kind} className="w-fit">
          <TabsList>
            <TabsTrigger value="Deployment">部署</TabsTrigger>
            <TabsTrigger value="StatefulSet">有状态副本集</TabsTrigger>
            <TabsTrigger value="DaemonSet">守护进程集</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="ml-auto flex min-w-0 shrink items-center gap-2">
          <Select defaultValue="namespace">
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="namespace">命名空间</SelectItem>
            </SelectContent>
          </Select>

          <Input placeholder="名称" className="h-9 w-40" />

          <Button variant="outline" size="sm" className="transition-none">
            <IconLayoutColumns />
            自定义列
            <IconChevronDown />
          </Button>

          <Button variant="outline" size="sm" className="transition-none" type="button">
            <IconPlus />
            创建
          </Button>
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-10">
                  <div className="size-4 rounded-sm border border-input bg-background" />
                </TableHead>
                {tableHeaders.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <div className="size-4 rounded-sm border border-input bg-background" />
                  </TableCell>
                  <TableCell><div className="h-4 w-24 rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-4 w-16 rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-4 w-20 rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-4 w-8 rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-4 w-8 rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-4 w-12 rounded bg-muted" /></TableCell>
                  <TableCell><div className="h-4 w-32 rounded bg-muted" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex items-center justify-between px-4">
          <div className="text-muted-foreground text-sm">已选中 0 / 5 条。</div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">每页行数</span>
              <Select defaultValue="10">
                <SelectTrigger size="sm" className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectItem value="10">10</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="text-sm font-medium">第 1 页，共 1</div>

            <div className="flex items-center gap-2">
              <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" disabled>
                <IconChevronsLeft />
              </Button>
              <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" disabled>
                <IconChevronLeft />
              </Button>
              <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" disabled>
                <IconChevronRight />
              </Button>
              <Button variant="outline" className="hidden h-8 w-8 p-0 lg:flex" disabled>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
