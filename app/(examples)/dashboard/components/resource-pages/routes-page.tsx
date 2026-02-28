"use client"

import { ResourcePage, BASE } from "./shared"

export function RoutesPageClient() {
  return (
    <ResourcePage
      endpoints={[`${BASE}/ingresses`]}
      headers={{
        header: "Name",
        type: "Type",
        status: "Status",
        target: "Namespace",
        limit: "Host/Path",
        reviewer: "Backend Service",
      }}
      map={(items) =>
        items.slice(0, 300).map((item, index) => {
          const rule = item?.spec?.rules?.[0]
          const path = rule?.http?.paths?.[0]
          return {
            id: index + 1,
            header: item?.metadata?.name ?? "-",
            type: "Ingress",
            status: "Done",
            target: String(item?.metadata?.namespace ?? "default"),
            limit: `${rule?.host ?? "-"}${path?.path ?? "/"}`,
            reviewer: String(path?.backend?.service?.name ?? "-"),
          }
        })
      }
    />
  )
}
