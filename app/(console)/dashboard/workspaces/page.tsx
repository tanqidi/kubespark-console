import { WorkspacesPageClient } from "@/app/(console)/dashboard/components/resource-pages"

export default function WorkspacesPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2 py-4 md:py-6">
      <WorkspacesPageClient />
    </div>
  )
}
