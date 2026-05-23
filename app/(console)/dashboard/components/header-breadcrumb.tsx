"use client"

import Link from "next/link"
import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useTranslations } from "@/app/lib/i18n"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

type Crumb = {
  href: string
  label: string
}

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function segmentToLabel(segment: string, t: (key: string) => string) {
  const translationMap: Record<string, string> = {
    nodes: t("menu.nodes"),
    projects: t("menu.projects"),
    pipelines: t("menu.pipelines"),
    workspaces: t("menu.workspaces"),
    workloads: t("menu.workloads"),
    jobs: t("menu.jobs"),
    pods: t("menu.pods"),
    services: t("menu.services"),
    routes: t("menu.routes"),
    configmaps: t("menu.configmaps"),
    secrets: t("menu.secrets"),
    serviceaccounts: t("menu.serviceaccounts"),
    customresources: t("menu.customresources"),
    volumes: t("menu.volumes"),
    storageclasses: t("menu.storageclasses"),
    devops: t("workspaces.development"),
    namespaces: t("projects.namespaces"),
  }
  return translationMap[segment] ?? decodeSegment(segment)
}

function workloadKindToLabel(kind: string, t: (key: string) => string): string {
  if (kind === "StatefulSet") return t("workloads.statefulSet")
  if (kind === "DaemonSet") return t("workloads.daemonSet")
  return t("workloads.deployment")
}

function buildCrumbs(pathname: string, kind: string, t: (key: string) => string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  if (segments[0] !== "dashboard") {
    return []
  }

  const tail = segments.slice(1)
  const result: Crumb[] = []

  // Special rule:
  // /dashboard/projects/devops/:projectName -> "控制台 > 项目 > {projectName}"
  // /dashboard/projects/devops/:projectName/:pipelineName
  //   -> "控制台 > 项目 > {projectName} > {pipelineName}"
  if (tail[0] === "projects" && tail[1] === "devops" && tail[2]) {
    const projectName = decodeSegment(tail[2]);
    result.push({ href: "/dashboard/projects", label: t("menu.pipelineProjects") });
    result.push({
      href: `/dashboard/projects/devops/${tail[2]}`,
      label: projectName,
    });

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
    result.push({ href: "/dashboard/projects", label: t("menu.projects") })
    result.push({
      href: `/dashboard/projects/namespaces/${tail[2]}`,
      label: namespaceName,
    })
    return result
  }

  // /dashboard/workloads/:namespace/:name -> "控制台 > {kindLabel} > {name}"
  if (tail[0] === "workloads" && tail[1] && tail[2]) {
    return [
      {
        href: `/dashboard/workloads/${tail[1]}/${tail[2]}?kind=${encodeURIComponent(kind || "Deployment")}`,
        label: workloadKindToLabel(kind, t),
      },
      {
        href: `/dashboard/workloads/${tail[1]}/${tail[2]}`,
        label: decodeSegment(tail[2]),
      },
    ]
  }

  // /dashboard/customresources/:resourceName -> "控制台 > 自定义资源 > {resourceName}"
  if (tail[0] === "customresources" && tail[1]) {
    result.push({ href: "/dashboard/customresources", label: t("menu.customresources") })
    result.push({
      href: `/dashboard/customresources/${tail[1]}`,
      label: decodeSegment(tail[1]),
    })
    return result
  }

  let href = "/dashboard"
  for (let index = 0; index < tail.length; index += 1) {
    const segment = tail[index]
    href += `/${segment}`
    result.push({ href, label: segmentToLabel(segment, t) })
  }

  return result
}

export function HeaderBreadcrumb() {
  const t = useTranslations()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const kind = searchParams.get("kind") ?? "Deployment"
  const crumbs = React.useMemo(() => buildCrumbs(pathname, kind, t), [pathname, kind, t])
  const segments = React.useMemo(() => pathname.split("/").filter(Boolean), [pathname])
  const isTopLevelModulePage =
    segments[0] === "dashboard" &&
    segments.length <= 2 &&
    segments[1] !== undefined

  if (isTopLevelModulePage || crumbs.length === 0) return null

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="truncate whitespace-nowrap">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <React.Fragment key={crumb.href}>
              <BreadcrumbItem>
                <BreadcrumbLink asChild className="truncate">
                  <Link
                    href={crumb.href}
                    className={isLast ? "font-medium text-foreground" : undefined}
                  >
                    {crumb.label}
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
