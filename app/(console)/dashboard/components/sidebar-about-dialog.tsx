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
import { useTranslations } from "@/app/lib/i18n"

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
  const t = useTranslations("about")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[66vw] max-w-[66vw] overflow-hidden p-0 sm:max-w-[66vw]">
        <DialogHeader className="border-b bg-muted/15 px-6 py-4">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 text-sm">
          <div>
            <div className="text-muted-foreground">{t("productName")}</div>
            <div className="font-medium">{t("productValue")}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("currentVersion")}</div>
            <div className="font-medium">v1.0.0-preview</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("acknowledgement")}</div>
            <div className="space-y-2 text-foreground/90 leading-6">
              <p>{t("ackParagraph1")}</p>
              <p>{t("ackParagraph2")}</p>
              <p>{t("ackParagraph3")}</p>
              <p>{t("ackParagraph4")}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-x-3 gap-y-2 pb-2">
            <AboutLinkItem href={ABOUT_LINKS.repo} icon={<IconBrandGithub className="size-4" />} label={t("projectLink")} />
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.issues} icon={<IconBug className="size-4" />} label={t("issuesLink")} />
            <span className="text-muted-foreground/50">|</span>
            <AboutLinkItem href={ABOUT_LINKS.author} icon={<IconUser className="size-4" />} label={t("authorLink")} />
          </div>
        </div>

        <div className="flex justify-end border-t px-6 py-4">
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
