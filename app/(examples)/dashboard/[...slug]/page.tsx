import { notFound } from "next/navigation"

import {
  ConfigMapsPageClient,
  JobsPageClient,
  NodesPageClient,
  PodsPageClient,
  ProjectsPageClient,
  RoutesPageClient,
  SecretsPageClient,
  ServicesPageClient,
  StorageClassesPageClient,
  VolumesPageClient,
  WorkloadsPageClient,
} from "@/app/(examples)/dashboard/components/resource-pages"
import { ResourceDetailPage } from "@/app/(examples)/dashboard/components/resource-pages/resource-detail-page"

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
  volumes: "\u5b58\u50a8\u5377",
  storageclasses: "\u5b58\u50a8\u7c7b",
}

export default async function DashboardSectionPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const key = slug?.[0]

  if (!key || !(key in sectionRenderers)) notFound()

  if (slug.length > 1) {
    const resourceName = decodeURIComponent(slug[slug.length - 1] ?? "")
    const namespace =
      slug.length > 2 ? decodeURIComponent(slug[slug.length - 2] ?? "") : undefined

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
