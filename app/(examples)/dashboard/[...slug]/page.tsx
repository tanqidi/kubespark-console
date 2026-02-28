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

export default async function DashboardSectionPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const key = slug?.[0]

  if (!key) notFound()

  return (
    <div className="@container/main flex flex-1 flex-col gap-2 py-4 md:py-6">
      {key === "nodes" ? <NodesPageClient /> : null}
      {key === "projects" ? <ProjectsPageClient /> : null}
      {key === "workloads" ? <WorkloadsPageClient /> : null}
      {key === "jobs" ? <JobsPageClient /> : null}
      {key === "pods" ? <PodsPageClient /> : null}
      {key === "services" ? <ServicesPageClient /> : null}
      {key === "routes" ? <RoutesPageClient /> : null}
      {key === "configmaps" ? <ConfigMapsPageClient /> : null}
      {key === "secrets" ? <SecretsPageClient /> : null}
      {key === "volumes" ? <VolumesPageClient /> : null}
      {key === "storageclasses" ? <StorageClassesPageClient /> : null}
      {![
        "nodes",
        "projects",
        "workloads",
        "jobs",
        "pods",
        "services",
        "routes",
        "configmaps",
        "secrets",
        "volumes",
        "storageclasses",
      ].includes(key)
        ? notFound()
        : null}
    </div>
  )
}
