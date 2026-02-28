import { notFound } from "next/navigation"

import { WorkloadsTableClient } from "@/app/(examples)/dashboard/components/workloads-table-client"

const allow = new Set(["workloads", "jobs", "pods", "services", "routes"])

export default async function DashboardSectionPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const key = slug?.[0]

  if (!key || !allow.has(key)) {
    notFound()
  }

  return (
    <div className="@container/main flex flex-1 flex-col gap-2 py-4 md:py-6">
      <WorkloadsTableClient slugKey={key} />
    </div>
  )
}
