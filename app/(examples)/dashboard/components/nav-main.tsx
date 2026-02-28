"use client"

import { IconCloudBolt } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { SidebarMenuItem as KSMenuItem } from "@/app/(examples)/dashboard/components/sidebar-data"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/registry/new-york-v4/ui/sidebar"

function toDashboardPath(path?: string) {
  if (!path) return "/dashboard"
  return `/dashboard${path}`
}

export function NavMain({
  items,
}: {
  items: KSMenuItem[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
              <Link href="/dashboard">
                <IconCloudBolt />
                <span>KubeSpark Console</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          {items.map((item) => {
            if (item.children?.length) {
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {item.children.map((child) => {
                      const targetPath = toDashboardPath(child.path)
                      return (
                        <SidebarMenuSubItem key={`${item.title}-${child.title}`}>
                          <SidebarMenuSubButton asChild isActive={pathname === targetPath}>
                            <Link href={targetPath}>{child.title}</Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              )
            }

            const targetPath = toDashboardPath(item.path)
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={pathname === targetPath} tooltip={item.title}>
                  <Link href={targetPath}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
