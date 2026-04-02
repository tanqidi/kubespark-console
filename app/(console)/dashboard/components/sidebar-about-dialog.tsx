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
                我们感谢 KubeSphere 在过去带来的启发与帮助。正因体验过其高效与清晰，我们希望把这些经过实践验证的产品方法延续下去，这也是 KubeSpark 的起点。
              </p>
              <p>
                对于后续变化，我们尊重其作为企业的选择。作为长期用户，我们也真实感受过社区在资料缺失阶段的使用不便。基于此，我们选择以公开、持续的方式，沉淀并分享有价值的经验与实践。
              </p>
              <p>
                KubeSpark 在界面交互与信息架构上参考了 KubeSphere 的设计思路；项目的前后端代码由作者基于 Codex 协作独立开发，未复制 KubeSphere 源代码。本项目长期以开源方式维护，主要用于学习、研究与社区交流；不提供商业化托管或 SaaS 服务。
              </p>
              <p>
                KubeSphere 相关名称、标识、商标及版权归其权利人所有。KubeSpark 与 KubeSphere 官方不存在隶属、授权或合作关系。如有表述不当，我们会及时沟通并尽快修正。相关意见可发送至作者邮箱：1330884822@qq.com。
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
