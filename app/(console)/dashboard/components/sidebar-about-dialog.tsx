"use client"

import type { ReactNode } from "react"
import { IconBug, IconBrandGithub, IconUser } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const ABOUT_LINKS = {
  repo: "https://github.com/tanqidi/kubespark-console/",
  issues: "https://github.com/tanqidi/kubespark-console/issues",
  author: "https://tanqidi.com/about",
  discussions: "",
  contribute: "",
  stars: "",
}

function AboutLinkItem({
  href,
  icon,
  label,
}: {
  href: string
  icon: ReactNode
  label: string
}) {
  if (!href) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-foreground/90">
        {icon}
        <span>{label}</span>
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-foreground/90 transition-colors hover:text-foreground"
    >
      {icon}
      <span>{label}</span>
    </a>
  )
}

export function SidebarAboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[66vw] max-w-[66vw] overflow-hidden p-0 sm:max-w-[66vw]">
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

          <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-2 pb-2">
            <AboutLinkItem href={ABOUT_LINKS.repo} icon={<IconBrandGithub className="size-4" />} label="项目地址" />
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.issues} icon={<IconBug className="size-4" />} label="问题反馈" />
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.author} icon={<IconUser className="size-4" />} label="关于作者" />

            {/* 先注释以下三项，后续再启用
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.discussions} icon={<IconBrandSlack className="size-4" />} label="参与讨论" />
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.contribute} icon={<IconCode className="size-4" />} label="贡献代码" />
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.stars} icon={<IconStar className="size-4 text-amber-500" />} label="标星" />
            */}
          </div>
        </div>

        <div className="flex justify-end border-t px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            我知道了
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
