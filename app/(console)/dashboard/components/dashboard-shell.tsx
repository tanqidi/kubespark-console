"use client"

import * as React from "react"

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

export function DashboardShell({
  children,
  defaultOpen,
  enableDetailSidebarAnimation = false,
}: DashboardShellProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  const noAnimationClassName = enableDetailSidebarAnimation
    ? undefined
    : [
        "[&_[data-slot=sidebar-gap]]:!transition-none",
        "[&_[data-slot=sidebar-container]]:!transition-none",
        "[&_[data-slot=sidebar-inset]]:!transition-none",
      ].join(" ")

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
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
