"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { ModeToggle } from "@/app/(console)/dashboard/components/mode-toggle"
import { ThemeSelector } from "@/app/(console)/dashboard/components/theme-selector"
import { HeaderBreadcrumb } from "@/app/(console)/dashboard/components/header-breadcrumb"

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <div className="min-w-0 flex-1">
          <HeaderBreadcrumb />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeSelector />
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
