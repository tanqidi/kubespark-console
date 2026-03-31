"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/app/(console)/dashboard/components/app-sidebar"
import { SiteHeader } from "@/app/(console)/dashboard/components/site-header"

type DashboardShellProps = {
  children: React.ReactNode
  defaultOpen: boolean
  enableDetailSidebarAnimation?: boolean
}

function isDashboardDetailPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)
  return segments[0] === "dashboard" && segments.length >= 3
}

export function DashboardShell({
  children,
  defaultOpen,
  enableDetailSidebarAnimation = false,
}: DashboardShellProps) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(defaultOpen)

  const forceCollapse = isDashboardDetailPath(pathname)
  const effectiveOpen = forceCollapse ? false : open
  const noAnimationClassName = enableDetailSidebarAnimation
    ? undefined
    : [
        "[&_[data-slot=sidebar-gap]]:!transition-none",
        "[&_[data-slot=sidebar-container]]:!transition-none",
        "[&_[data-slot=sidebar-inset]]:!transition-none",
      ].join(" ")

  return (
    <SidebarProvider
      open={effectiveOpen}
      onOpenChange={(nextOpen) => {
        if (forceCollapse) return
        setOpen(nextOpen)
      }}
      className={noAnimationClassName}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
