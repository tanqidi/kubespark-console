import { PipelinesPageClient } from "@/app/(console)/dashboard/components/resource-pages"

export default function PipelinesPage() {
  return (
    <div className="@container/main flex flex-1 flex-col gap-2 py-4 md:py-6">
      <PipelinesPageClient />
    </div>
  )
}
