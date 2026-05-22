"use client";

import * as React from "react";
import { IconCloudBolt } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarAboutDialog } from "@/app/(console)/dashboard/components/sidebar-about-dialog";
import type { SidebarMenuItem as KSMenuItem } from "@/app/(console)/dashboard/components/sidebar-data";
import { useTranslations, useLocale } from "@/app/lib/i18n";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

function toDashboardPath(path?: string) {
  if (!path) return "/dashboard";
  return `/dashboard${path}`;
}

export function NavMain({
  items,
}: {
  items: KSMenuItem[];
}) {
  const pathname = usePathname();
  const t = useTranslations("menu");
  const { locale } = useLocale();
  const [aboutOpen, setAboutOpen] = React.useState(false);

  const getTranslatedTitle = (item: KSMenuItem) => {
    if (item.labelKey) {
      const translated = t(item.labelKey);
      if (translated !== item.labelKey) {
        return translated;
      }
    }
    return item.title;
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <div>
                <IconCloudBolt />
                <span>{locale === "zh-CN" ? "开发测试集群" : "Development Cluster"}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          {items.map((item) => {
            const translatedTitle = getTranslatedTitle(item);
            
            if (item.children?.length) {
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton>
                    {item.icon && <item.icon />}
                    <span>{translatedTitle}</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {item.children.map((child) => {
                      const targetPath = toDashboardPath(child.path);
                      const childTranslatedTitle = getTranslatedTitle(child);
                      return (
                        <SidebarMenuSubItem key={`${item.title}-${child.title}`}>
                          <SidebarMenuSubButton asChild isActive={pathname === targetPath}>
                            <Link href={targetPath}>{childTranslatedTitle}</Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </SidebarMenuItem>
              );
            }

            const targetPath = toDashboardPath(item.path);
            return (
              <SidebarMenuItem key={item.title}>
                {item.labelKey === "about" ? (
                  <SidebarMenuButton
                    isActive={aboutOpen}
                    tooltip={translatedTitle}
                    onClick={() => setAboutOpen(true)}
                  >
                    {item.icon && <item.icon />}
                    <span>{translatedTitle}</span>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton asChild isActive={pathname === targetPath} tooltip={translatedTitle}>
                    <Link href={targetPath}>
                      {item.icon && <item.icon />}
                      <span>{translatedTitle}</span>
                    </Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>

        <SidebarAboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
