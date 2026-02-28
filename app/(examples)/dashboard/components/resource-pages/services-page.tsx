"use client"

import { ResourcePage, BASE } from "./shared"

export function ServicesPageClient() {
  return (
    <ResourcePage
      endpoints={[`${BASE}/services`]}
      headers={{
        header: "Name",
        type: "Type",
        status: "Status",
        target: "Namespace",
        limit: "Type / Ports",
        reviewer: "ClusterIP",
      }}
      map={(items) =>
        items.slice(0, 300).map((item, index) => ({
          id: index + 1,
          header: item?.metadata?.name ?? "-",
          type: "Service",
          status: "Done",
          target: String(item?.metadata?.namespace ?? "default"),
          limit: `${item?.spec?.type ?? "ClusterIP"} / ${Array.isArray(item?.spec?.ports) ? item.spec.ports.map((p: any) => `${p?.port}/${p?.protocol ?? "TCP"}`).join(",") : "-"}`,
          reviewer: String(item?.spec?.clusterIP ?? "-"),
        }))
      }
    />
  )
}
