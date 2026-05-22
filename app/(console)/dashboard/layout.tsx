import { cookies } from "next/headers"

import { DashboardShell } from "@/app/(console)/dashboard/components/dashboard-shell"
import { LocaleProvider } from "@/app/lib/i18n"

import "@/app/(console)/dashboard/theme.css"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <LocaleProvider>
      <DashboardShell
        defaultOpen={defaultOpen}
        enableDetailSidebarAnimation={false}
      >
        {children}
      </DashboardShell>
    </LocaleProvider>
  )
}
