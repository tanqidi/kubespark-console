import { notFound } from "next/navigation"

import {
  ConfigMapsPageClient,
  CustomResourcesPageClient,
  JobsPageClient,
  NodesPageClient,
  PipelineRunsPageClient,
  PipelinesPageClient,
  PodsPageClient,
  ProjectsPageClient,
  RoutesPageClient,
  ServiceAccountsPageClient,
  SecretsPageClient,
  ServicesPageClient,
  StorageClassesPageClient,
  VolumesPageClient,
  WorkloadsPageClient,
  WorkspacesPageClient,
} from "@/app/(console)/dashboard/components/resource-pages"
import { ResourceDetailPage } from "@/app/(console)/dashboard/components/resource-pages/resource-detail-page"
import { PipelineProjectDetailTemplate } from "@/app/(console)/dashboard/components/resource-pages/projects/pipeline-project-detail-template"
import {
  WorkloadDetailTemplate,
  type WorkloadDetailKind,
} from "@/app/(console)/dashboard/components/resource-pages/workloads/workload-detail-templates"
import { CustomResourceItemsPageClient } from "@/app/(console)/dashboard/components/resource-pages/customresources/customresource-items-page"

const sectionRenderers = {
  nodes: NodesPageClient,
  projects: ProjectsPageClient,
  pipelines: PipelinesPageClient,
  workspaces: WorkspacesPageClient,
  workloads: WorkloadsPageClient,
  jobs: JobsPageClient,
  pods: PodsPageClient,
  services: ServicesPageClient,
  routes: RoutesPageClient,
  configmaps: ConfigMapsPageClient,
  secrets: SecretsPageClient,
  serviceaccounts: ServiceAccountsPageClient,
  customresources: CustomResourcesPageClient,
  volumes: VolumesPageClient,
  storageclasses: StorageClassesPageClient,
} as const

const sectionLabels: Record<keyof typeof sectionRenderers, string> = {
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
  volumes: "存储卷",
  storageclasses: "存储类",
}

export default async function DashboardSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>
  searchParams: Promise<{ kind?: string | string[] }>
}) {
  const { slug } = await params
  const resolvedSearchParams = await searchParams
  const key = slug?.[0]

  if (!key || !(key in sectionRenderers)) notFound()

  if (slug.length > 1) {
    const resourceName = decodeURIComponent(slug[slug.length - 1] ?? "")
    const namespace =
      slug.length > 2 ? decodeURIComponent(slug[slug.length - 2] ?? "") : undefined

    const kindValue = Array.isArray(resolvedSearchParams.kind)
      ? resolvedSearchParams.kind[0]
      : resolvedSearchParams.kind
    const workloadKind: WorkloadDetailKind =
      kindValue === "StatefulSet" || kindValue === "DaemonSet" ? kindValue : "Deployment"

    if (key === "workloads") {
      return (
        <ResourceDetailPage
          sectionTitle={sectionLabels.workloads}
          name={resourceName}
          namespace={namespace}
          backHref="/dashboard/workloads"
          detailContent={
            <WorkloadDetailTemplate
              kind={workloadKind}
              name={resourceName}
              namespace={namespace}
              backHref="/dashboard/workloads"
            />
          }
        />
      )
    }

    if (key === "workspaces") notFound()

    if (key === "projects") {
      return (
        <ResourceDetailPage
          sectionTitle="流水线项目"
          name={resourceName}
          backHref="/dashboard/projects"
          detailContent={<PipelineProjectDetailTemplate name={resourceName} />}
        />
      )
    }

    if (key === "pipelines") {
      return (
        <ResourceDetailPage
          sectionTitle={sectionLabels.pipelines}
          name={resourceName}
          backHref="/dashboard/pipelines"
          detailContent={<PipelineRunsPageClient pipelineName={resourceName} />}
        />
      )
    }

    if (key === "customresources") {
      return (
        <ResourceDetailPage
          sectionTitle={sectionLabels.customresources}
          name={resourceName}
          backHref="/dashboard/customresources"
          detailContent={<CustomResourceItemsPageClient definitionName={resourceName} />}
        />
      )
    }

    return (
      <ResourceDetailPage
        sectionTitle={sectionLabels[key as keyof typeof sectionRenderers]}
        name={resourceName}
        namespace={namespace}
        backHref={`/dashboard/${key}`}
      />
    )
  }

  const ListPage = sectionRenderers[key as keyof typeof sectionRenderers]

  return (
    <div className="@container/main flex flex-1 flex-col gap-2 py-4 md:py-6">
      <ListPage />
    </div>
  )
}
