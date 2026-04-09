"use client"

import { IconChevronLeft } from "@tabler/icons-react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ModeToggle } from "@/app/(console)/dashboard/components/mode-toggle"
import { ThemeSelector } from "@/app/(console)/dashboard/components/theme-selector"

export function SiteHeader() {
  const pathname = usePathname()
  const router = useRouter()

  const isWorkspaceDetailPage =
    pathname.startsWith("/dashboard/workspaces/") && pathname !== "/dashboard/workspaces"

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        {isWorkspaceDetailPage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-1 size-8 rounded-md"
            onClick={() => {
              router.push("/dashboard/workspaces")
            }}
            aria-label="返回企业空间列表"
          >
            <IconChevronLeft className="size-5" />
          </Button>
        ) : (
          <SidebarTrigger className="-ml-1" />
        )}
        {/*<Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">Documents</h1>*/}
        <div className="ml-auto flex items-center gap-2">
          {/*<Button variant="ghost" asChild size="sm" className="hidden sm:flex">
            <a
              href="https://github.com/shadcn-ui/ui/tree/main/apps/v4/app/(console)/dashboard"
              rel="noopener noreferrer"
              target="_blank"
              className="dark:text-foreground"
            >
              GitHub
            </a>
          </Button>*/}
          <ThemeSelector />
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
