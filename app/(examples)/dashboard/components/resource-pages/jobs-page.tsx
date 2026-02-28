"use client"

import { formatAge } from "@/app/lib/kubespark/utils"
import { ResourcePage, BASE } from "./shared"

export function JobsPageClient() {
  return (
    <ResourcePage
      endpoints={[`${BASE}/jobs`, `${BASE}/cronjobs`]}
      headers={{
        header: "Name",
        type: "Kind",
        status: "Status",
        target: "Namespace",
        limit: "Completions",
        reviewer: "Age",
      }}
      map={(items) =>
        items.slice(0, 300).map((item, index) => {
          const succeeded = item?.status?.succeeded ?? 0
          const failed = item?.status?.failed ?? 0
          const active = item?.status?.active ?? 0
          const completions = item?.spec?.completions ?? "-"
          const done = succeeded > 0 || (item?.kind === "CronJob" && active === 0)
          return {
            id: index + 1,
            header: item?.metadata?.name ?? "-",
            type: item?.kind ?? "Job",
            status: done ? "Done" : "In Process",
            target: String(item?.metadata?.namespace ?? "default"),
            limit: `${succeeded}/${completions} (fail:${failed}, active:${active})`,
            reviewer: formatAge(item?.metadata?.creationTimestamp),
          }
        })
      }
    />
  )
}
