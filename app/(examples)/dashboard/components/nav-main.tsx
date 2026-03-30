"use client"

import * as React from "react"
import { IconCloudBolt } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { SidebarMenuItem as KSMenuItem } from "@/app/(examples)/dashboard/components/sidebar-data"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

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
  const [aboutOpen, setAboutOpen] = React.useState(false)

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
              <Link href="/dashboard">
                <IconCloudBolt />
                <span>KubeSpark 控制台</span>
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
                {item.labelKey === "about" ? (
                  <SidebarMenuButton
                    isActive={aboutOpen}
                    tooltip={item.title}
                    onClick={() => setAboutOpen(true)}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton asChild isActive={pathname === targetPath} tooltip={item.title}>
                    <Link href={targetPath}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>

        <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
          <DialogContent
            className="max-h-[80vh] w-[66vw] max-w-[66vw] sm:max-w-[66vw] overflow-hidden p-0"
          >
            <DialogHeader className="border-b bg-muted/15 px-6 py-4">
              <DialogTitle>关于 KubeSpark</DialogTitle>
              <DialogDescription>控制台版本与项目信息</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 text-sm">
              <div>
                <div className="text-muted-foreground">产品名称</div>
                <div className="font-medium">KubeSpark 控制台</div>
              </div>
              <div>
                <div className="text-muted-foreground">当前版本</div>
                <div className="font-medium">v1.0.0-preview</div>
              </div>
              <div>
                <div className="text-muted-foreground">致谢与缘起</div>
                <div className="space-y-2 text-foreground/90 leading-6">
                  <p>
                    我们由衷感谢 KubeSphere 曾带来的启发与帮助。正因为经历过那份高效与清晰，我们才更愿意把这些被验证过的实践体验延续下去，这也是 KubeSpark 的起点。
                  </p>
                  <p>
                    面对后续变化，我们尊重其作为公司的决定；同时，作为长期使用者，我们也真切感受过社区在资料缺失阶段的不便与失落。因此，我们选择用公开、持续的方式，把有价值的方法与经验继续沉淀下来。
                  </p>
                  <p>
                    本项目在界面交互与信息架构上参考了 KubeSphere 的设计思路，但全部前后端代码均为团队基于 Codex 协作独立编写，未复制其源代码。项目将长期开源，仅用于学习、研究与社区交流，不以商业盈利为目的，不提供商业化托管或 SaaS 服务。KubeSphere 相关名称、标识、商标与版权归其权利方所有；本项目与官方不存在隶属或授权关系。如有不当之处，我们将及时沟通并第一时间修正。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t px-6 py-4">
              <Button type="button" onClick={() => setAboutOpen(false)}>
                我知道了
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
