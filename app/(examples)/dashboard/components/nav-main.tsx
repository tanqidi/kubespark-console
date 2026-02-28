"use client"

import { IconCloudBolt } from "@tabler/icons-react"
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
            <SidebarMenuButton className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
              <IconCloudBolt />
              <span>KubeSpark Console</span>
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
                    {item.children.map((child) => (
                      <SidebarMenuSubItem key={`${item.title}-${child.title}`}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === `/clusters${child.path}`}
                        >
                          <a href={`/clusters${child.path}`}>{child.title}</a>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              )
            }

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === `/clusters${item.path}`}
                  tooltip={item.title}
                >
                  <a href={`/clusters${item.path}`}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
