import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"

import { Button } from "@/registry/new-york-v4/ui/button"

type ResourceDetailPageProps = {
  sectionTitle: string
  name: string
  namespace?: string
  backHref: string
}

export function ResourceDetailPage({
  sectionTitle,
  name,
  namespace,
  backHref,
}: ResourceDetailPageProps) {
  return (
    <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:py-6">
      <div className="grid gap-4 px-4 lg:grid-cols-[minmax(240px,24%)_minmax(0,1fr)] lg:px-6">
        <aside className="flex flex-col gap-4">
          <section className="rounded-lg border bg-card p-4">
            <Button variant="outline" asChild className="mb-4 w-full justify-start">
              <Link href={backHref}>
                <IconArrowLeft data-icon="inline-start" />
                {"\u8fd4\u56de\u5217\u8868"}
              </Link>
            </Button>
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {sectionTitle}
            </p>
            <h2 className="mt-2 break-all text-lg font-semibold">
              {"\u521b\u5efa / \u66f4\u65b0"} {name}
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {namespace
                ? `\u547d\u540d\u7a7a\u95f4\uff1a${namespace}`
                : "\u96c6\u7fa4\u7ea7\u8d44\u6e90"}
            </p>
          </section>
        </aside>

        <section className="rounded-lg border bg-card p-6">
          <h1 className="text-xl font-semibold">{"\u4e3b\u8981\u5185\u5bb9"}</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {
              "\u5728\u8fd9\u91cc\u653e\u7f6e\u8be5\u8d44\u6e90\u7684\u521b\u5efa/\u66f4\u65b0\u8868\u5355\u3001\u8be6\u60c5\u914d\u7f6e\u548c\u76f8\u5173\u64cd\u4f5c\u3002"
            }
          </p>
        </section>
      </div>
    </div>
  )
}
