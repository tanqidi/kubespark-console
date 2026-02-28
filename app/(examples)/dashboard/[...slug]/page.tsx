import { notFound } from "next/navigation"

import {
  JobsPageClient,
  PodsPageClient,
  RoutesPageClient,
  ServicesPageClient,
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
      {key === "workloads" ? <WorkloadsPageClient /> : null}
      {key === "jobs" ? <JobsPageClient /> : null}
      {key === "pods" ? <PodsPageClient /> : null}
      {key === "services" ? <ServicesPageClient /> : null}
      {key === "routes" ? <RoutesPageClient /> : null}
      {!["workloads", "jobs", "pods", "services", "routes"].includes(key) ? notFound() : null}
    </div>
  )
}
