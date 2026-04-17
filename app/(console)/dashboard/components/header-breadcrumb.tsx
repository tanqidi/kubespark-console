"use client"

import Link from "next/link"
import * as React from "react"
import { usePathname } from "next/navigation"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

type Crumb = {
  href: string
  label: string
}

const SEGMENT_LABELS: Record<string, string> = {
  nodes: "节点",
  projects: "项目",
  pipelines: "流水线",
  workspaces: "企业空间",
  workloads: "工作负载",
  jobs: "任务",
  pods: "容器组",
  services: "服务",
  routes: "应用路由",
  configmaps: "配置字典",
  secrets: "保密字典",
  serviceaccounts: "服务账号",
  customresources: "自定义资源",
  volumes: "持久卷声明",
  storageclasses: "存储类",
  devops: "流水线项目",
  namespaces: "命名空间",
}

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function segmentToLabel(segment: string) {
  return SEGMENT_LABELS[segment] ?? decodeSegment(segment)
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] !== "dashboard") {
    return [{ href: "/", label: "控制台" }]
  }

  const tail = segments.slice(1)
  const result: Crumb[] = [{ href: "/dashboard", label: "控制台" }]

  // Special rule:
  // /dashboard/projects/devops/:projectName -> "控制台 > 项目 > {projectName}"
  // /dashboard/projects/devops/:projectName/:pipelineName
  //   -> "控制台 > 项目 > {projectName} > {pipelineName}"
  if (tail[0] === "projects" && tail[1] === "devops" && tail[2]) {
    const projectName = decodeSegment(tail[2])
    result.push({ href: "/dashboard/projects", label: "项目" })
    result.push({
      href: `/dashboard/projects/devops/${tail[2]}`,
      label: projectName,
    })

    if (tail[3]) {
      result.push({
        href: `/dashboard/projects/devops/${tail[2]}/${tail[3]}`,
        label: decodeSegment(tail[3]),
      })
    }

    return result
  }

  // /dashboard/projects/namespaces/:namespaceName -> "控制台 > 项目 > {namespaceName}"
  if (tail[0] === "projects" && tail[1] === "namespaces" && tail[2]) {
    const namespaceName = decodeSegment(tail[2])
    result.push({ href: "/dashboard/projects", label: "项目" })
    result.push({
      href: `/dashboard/projects/namespaces/${tail[2]}`,
      label: namespaceName,
    })
    return result
  }

  let href = "/dashboard"
  for (const segment of tail) {
    href += `/${segment}`
    result.push({ href, label: segmentToLabel(segment) })
  }

  return result
}

export function HeaderBreadcrumb() {
  const pathname = usePathname()
  const crumbs = React.useMemo(() => buildCrumbs(pathname), [pathname])

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="truncate whitespace-nowrap">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <React.Fragment key={crumb.href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="truncate">
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
