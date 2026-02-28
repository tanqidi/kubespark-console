"use client"

import { formatAge } from "@/app/lib/kubespark/utils"
import { ResourcePage, BASE } from "./shared"

export function WorkloadsPageClient() {
  return (
    <ResourcePage
      endpoints={[`${BASE}/deployments`, `${BASE}/daemonsets`, `${BASE}/statefulsets`]}
      headers={{
        header: "Name",
        type: "Kind",
        status: "Status",
        target: "Namespace",
        limit: "Ready/Desired",
        reviewer: "Age",
      }}
      map={(items) =>
        items.slice(0, 300).map((item, index) => {
          const kind = item?.kind ?? "Workload"
          const desired = item?.spec?.replicas ?? item?.status?.desiredNumberScheduled ?? 0
          const updated = item?.status?.updatedReplicas ?? item?.status?.updatedNumberScheduled ?? 0
          const available = item?.status?.availableReplicas ?? item?.status?.numberAvailable ?? 0
          const ready = item?.status?.readyReplicas ?? item?.status?.numberReady ?? 0
          return {
            id: index + 1,
            header: item?.metadata?.name ?? "-",
            type: kind,
            status: ready >= Math.max(1, desired) ? "Done" : "In Process",
            target: String(item?.metadata?.namespace ?? "default"),
            limit: `${ready}/${desired} (u:${updated}, a:${available})`,
            reviewer: formatAge(item?.metadata?.creationTimestamp),
          }
        })
      }
    />
  )
}
