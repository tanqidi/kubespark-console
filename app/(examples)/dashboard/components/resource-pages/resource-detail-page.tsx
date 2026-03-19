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
      <h1 className="text-xl font-semibold">{"\u4e3b\u8981\u5185\u5bb9"}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        {
          "\u5728\u8fd9\u91cc\u653e\u7f6e\u8be5\u8d44\u6e90\u7684\u521b\u5efa/\u66f4\u65b0\u8868\u5355\u3001\u8be6\u60c5\u914d\u7f6e\u548c\u76f8\u5173\u64cd\u4f5c\u3002"
        }
      </p>
    </section>
  )

  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:py-6">
      <div className="grid gap-4 px-4 lg:px-6">
        <div className="flex min-h-full flex-col gap-4">
          {detailContent ?? rightSlot ?? defaultRightSlot}
        </div>
      </div>
    </div>
  )
}
