import { notFound } from "next/navigation"

import {
  ConfigMapsPageClient,
  CustomResourcesPageClient,
  JobsPageClient,
  NodesPageClient,
  PodsPageClient,
  ProjectsPageClient,
  RoutesPageClient,
  ServiceAccountsPageClient,
  SecretsPageClient,
  ServicesPageClient,
  StorageClassesPageClient,
  VolumesPageClient,
  WorkloadsPageClient,
} from "@/app/(console)/dashboard/components/resource-pages"
import { ResourceDetailPage } from "@/app/(console)/dashboard/components/resource-pages/resource-detail-page"
import {
  WorkloadDetailTemplate,
  type WorkloadDetailKind,
} from "@/app/(console)/dashboard/components/resource-pages/workloads/workload-detail-templates"

const sectionRenderers = {
  nodes: NodesPageClient,
  projects: ProjectsPageClient,
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
  nodes: "\u8282\u70b9",
  projects: "\u9879\u76ee",
  workloads: "\u5de5\u4f5c\u8d1f\u8f7d",
  jobs: "\u4efb\u52a1",
  pods: "\u5bb9\u5668\u7ec4",
  services: "\u670d\u52a1",
  routes: "\u5e94\u7528\u8def\u7531",
  configmaps: "\u914d\u7f6e\u5b57\u5178",
  secrets: "\u4fdd\u5bc6\u5b57\u5178",
  serviceaccounts: "\u670d\u52a1\u8d26\u53f7",
  customresources: "\u81ea\u5b9a\u4e49\u8d44\u6e90",
  volumes: "\u5b58\u50a8\u5377",
  storageclasses: "\u5b58\u50a8\u7c7b",
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
