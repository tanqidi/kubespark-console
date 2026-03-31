import { cookies } from "next/headers"

import { DashboardShell } from "@/app/(examples)/dashboard/components/dashboard-shell"

import "@/app/(examples)/dashboard/theme.css"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <DashboardShell
      defaultOpen={defaultOpen}
      enableDetailSidebarAnimation={false}
    >
      {children}
    </DashboardShell>
  )
}
