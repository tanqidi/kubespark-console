"use client"

import * as React from "react"
import { IconInnerShadowTop } from "@tabler/icons-react"
import Link from "next/link"

import { kubesparkSidebarMenu } from "@/app/(console)/dashboard/components/sidebar-data"
import { NavMain } from "@/app/(console)/dashboard/components/nav-main"
import { NavUser } from "@/app/(console)/dashboard/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = {
  user: {
    name: "KubeSpark 管理员",
    email: "admin@kubespark.local",
    avatar: "",
  },
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              {/*<Link href="/dashboard/nodes">*/}
              {/*<Link href="#">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">KubeSpark 控制台</span>
              </Link>*/}
              <div>
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">KubeSpark 控制台</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={kubesparkSidebarMenu} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
