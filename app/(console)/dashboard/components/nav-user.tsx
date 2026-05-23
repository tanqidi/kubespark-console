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
import { useLocale, type Locale, useTranslations } from "@/app/lib/i18n";
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
  const { isMobile } = useSidebar();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const t = useTranslations();
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false);
  const [terminalOpen, setTerminalOpen] = React.useState(false);
  const [terminalWsUrl, setTerminalWsUrl] = React.useState<string | null>(null);
  const [terminalSubtitle, setTerminalSubtitle] = React.useState(t("terminal.subtitleFallback"));
  const [terminalEmptyMessage, setTerminalEmptyMessage] = React.useState(t("terminal.emptyMessage"));
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
        throw new Error(t("terminal.podNotFound", { 
          target: "kubespark/kubespark-terminal-*", 
          deployment: "kubespark/kubespark-terminal" 
        }));
      }

      const wsUrl = buildPodExecWsEndpoint(preferred.namespace, preferred.name, {
        command: ["/bin/sh"],
      });
      setTerminalSubtitle(t("terminal.subtitle", { target: `${preferred.namespace}/${preferred.name}` }));
      setTerminalEmptyMessage(t("terminal.emptyMessage"));
      setTerminalWsUrl(wsUrl);
      setTerminalOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("terminal.openFailed");
      setTerminalSubtitle(t("terminal.subtitleFallback"));
      setTerminalEmptyMessage(message);
      setTerminalWsUrl(null);
      setTerminalOpen(true);
    } finally {
      setOpeningTerminal(false);
    }
  }, [openingTerminal, t]);

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
                {t("nav.account")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <IconNotification />
                {t("nav.notifications")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleOpenTerminal()} disabled={openingTerminal}>
                <IconTerminal2 />
                {t("nav.terminal")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <IconLanguage />
                  {t("nav.language")}
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
                {t("nav.signOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("logout.title")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("logout.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("logout.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleLogoutConfirm}>
                {t("logout.confirm")}
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
          title={t("terminal.title")}
          subtitle={terminalSubtitle}
          wsUrl={terminalWsUrl}
          emptyMessage={terminalEmptyMessage}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
