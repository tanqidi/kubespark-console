import * as React from "react"

type ResourceDetailPageProps = {
  sectionTitle: string
  name: string
  namespace?: string
  backHref: string
  detailContent?: React.ReactNode
  rightSlot?: React.ReactNode
}

export function ResourceDetailPage({
  detailContent,
  rightSlot,
}: ResourceDetailPageProps) {
  const defaultRightSlot = (
    <section className="rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold">{"主要内容"}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {
          "在这里放置该资源的创建/更新表单、详情配置和相关操作。"
        }
      </p>
    </section>
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:py-6">
      <div className="grid gap-4">
        <div className="flex min-h-full flex-col gap-4">
          {detailContent ?? rightSlot ?? defaultRightSlot}
        </div>
      </div>
    </div>
  )
}
