"use client";

import * as React from "react";
import {
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconTerminal2,
  IconUserCircle,
  IconLanguage,
  IconCheck,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { buildPodExecWsEndpoint, fetchPodResourceRows } from "@/app/lib/kubespark/pods";
import { useLocale, type Locale } from "@/app/lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { logout } from "@/app/lib/kubespark/auth";
import { TerminalViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/terminal-viewer-dialog";

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const resolveTerminalSubtitle = React.useCallback(
    (target: string) => `连接 Kubernetes Pod（${target}）的终端会话。`,
    []
  );
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);
  const [terminalOpen, setTerminalOpen] = React.useState(false);
  const [terminalWsUrl, setTerminalWsUrl] = React.useState<string | null>(null);
  const [terminalSubtitle, setTerminalSubtitle] = React.useState("连接 Kubernetes Pod（-）的终端会话。");
  const [terminalEmptyMessage, setTerminalEmptyMessage] = React.useState("终端连接地址不可用。");
  const [openingTerminal, setOpeningTerminal] = React.useState(false);

  const handleLogoutConfirm = React.useCallback(() => {
    logout();
    setLogoutConfirmOpen(false);
    router.replace("/login");
  }, [router]);

  const handleOpenTerminal = React.useCallback(async () => {
    if (openingTerminal) return;

    setOpeningTerminal(true);
    try {
      const rows = await fetchPodResourceRows(300);
      const runningRows = rows.filter((item) => item.status.toLowerCase() === "running");

      const preferred = runningRows.find(
        (item) => item.namespace === "kubespark" && item.name.startsWith("kubespark-terminal-")
      );

      if (!preferred) {
        throw new Error("未找到运行中的 Pod：kubespark/kubespark-terminal-*, 请检查 kubespark/kubespark-terminal 部署是否正常。");
      }

      const wsUrl = buildPodExecWsEndpoint(preferred.namespace, preferred.name, {
        command: ["/bin/sh"],
      });
      setTerminalSubtitle(resolveTerminalSubtitle(`${preferred.namespace}/${preferred.name}`));
      setTerminalEmptyMessage("终端连接地址不可用。");
      setTerminalWsUrl(wsUrl);
      setTerminalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "打开终端失败";
      setTerminalSubtitle(resolveTerminalSubtitle("-"));
      setTerminalEmptyMessage(message);
      setTerminalWsUrl(null);
      setTerminalOpen(true);
    } finally {
      setOpeningTerminal(false);
    }
  }, [openingTerminal, resolveTerminalSubtitle]);

  const handleLanguageChange = (newLocale: Locale) => {
    setLocale(newLocale);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg grayscale">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="rounded-lg">{locale === "zh-CN" ? "CN" : "EN"}</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {user.email}
                </span>
              </div>
              <IconDotsVertical className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">{locale === "zh-CN" ? "CN" : "EN"}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <IconUserCircle />
                {locale === "zh-CN" ? "账户" : "Account"}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                {locale === "zh-CN" ? "通知" : "Notifications"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleOpenTerminal()} disabled={openingTerminal}>
                <IconTerminal2 />
                {locale === "zh-CN" ? "终端" : "Terminal"}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <IconLanguage />
                  {locale === "zh-CN" ? "语言" : "Language"}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => handleLanguageChange("zh-CN")}>
                    {locale === "zh-CN" && <IconCheck className="mr-2 size-4" />}
                    中文
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleLanguageChange("en-US")}>
                    {locale === "en-US" && <IconCheck className="mr-2 size-4" />}
                    English
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setLogoutConfirmOpen(true)}>
                <IconLogout />
                {locale === "zh-CN" ? "退出登录" : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {locale === "zh-CN" ? "确认退出登录" : "Confirm Sign Out"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {locale === "zh-CN"
                  ? "退出后将清除本地登录状态，需要重新登录才能继续操作。"
                  : "Signing out will clear your local login state and you will need to log in again to continue."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {locale === "zh-CN" ? "取消" : "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleLogoutConfirm}>
                {locale === "zh-CN" ? "确定退出" : "Sign out"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <TerminalViewerDialog
          open={terminalOpen}
          onOpenChange={(open) => {
            setTerminalOpen(open);
            if (!open) setTerminalWsUrl(null);
          }}
          title={locale === "zh-CN" ? "集群终端" : "Cluster Terminal"}
          subtitle={terminalSubtitle}
          wsUrl={terminalWsUrl}
          emptyMessage={terminalEmptyMessage}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
