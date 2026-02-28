"use client"

import { ResourcePage, BASE } from "./shared"

export function PodsPageClient() {
  return (
    <ResourcePage
      endpoints={[`${BASE}/pods`]}
      headers={{
        header: "Name",
        type: "Type",
        status: "Status",
        target: "Namespace",
        limit: "Phase",
        reviewer: "Node / PodIP",
      }}
      map={(items) =>
        items.slice(0, 300).map((item, index) => ({
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: "Pod",
          status: item?.status?.phase === "Running" ? "Done" : "In Process",
          target: String(item?.metadata?.namespace ?? "default"),
          limit: String(item?.status?.phase ?? "Unknown"),
          reviewer: `${item?.spec?.nodeName ?? "-"} · ${item?.status?.podIP ?? "-"}`,
        }))
      }
    />
  )
}
