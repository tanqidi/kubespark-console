"use client"

import * as React from "react"
import {
  IconDotsVertical,
  IconLogout,
  IconNotification,
  IconTerminal2,
  IconUserCircle,
} from "@tabler/icons-react"
import { useRouter } from "next/navigation"

import { buildPodExecWsEndpoint, fetchPodResourceRows } from "@/app/lib/kubespark/pods"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { logout } from "@/app/lib/kubespark/auth"
import { TerminalViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/terminal-viewer-dialog"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const resolveTerminalSubtitle = React.useCallback(
    (target: string) => `连接 Kubernetes Pod（${target}）的终端会话。`,
    []
  )
  const { isMobile } = useSidebar()
  const router = useRouter()
  const [logoutConfirmOpen, setLogoutConfirmOpen] = React.useState(false)
  const [terminalOpen, setTerminalOpen] = React.useState(false)
  const [terminalWsUrl, setTerminalWsUrl] = React.useState<string | null>(null)
  const [terminalSubtitle, setTerminalSubtitle] = React.useState("连接 Kubernetes Pod（-）的终端会话。")
  const [terminalEmptyMessage, setTerminalEmptyMessage] = React.useState("终端连接地址不可用。")
  const [openingTerminal, setOpeningTerminal] = React.useState(false)

  const handleLogoutConfirm = React.useCallback(() => {
    logout()
    setLogoutConfirmOpen(false)
    router.replace("/login")
  }, [router])

  const handleOpenTerminal = React.useCallback(async () => {
    if (openingTerminal) return

    setOpeningTerminal(true)
    try {
      const rows = await fetchPodResourceRows(300)
      const runningRows = rows.filter((item) => item.status.toLowerCase() === "running")

      const preferred = runningRows.find(
        (item) => item.namespace === "kubespark" && item.name.startsWith("kubespark-terminal-")
      )

      if (!preferred) {
        throw new Error("未找到运行中的 Pod：kubespark/kubespark-terminal-*, 请检查 kubespark/kubespark-terminal 部署是否正常。")
      }

      const wsUrl = buildPodExecWsEndpoint(preferred.namespace, preferred.name, {
        command: ["/bin/sh"],
      })
      setTerminalSubtitle(resolveTerminalSubtitle(`${preferred.namespace}/${preferred.name}`))
      setTerminalEmptyMessage("终端连接地址不可用。")
      setTerminalWsUrl(wsUrl)
      setTerminalOpen(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : "打开终端失败"
      setTerminalSubtitle(resolveTerminalSubtitle("-"))
      setTerminalEmptyMessage(message)
      setTerminalWsUrl(null)
      setTerminalOpen(true)
    } finally {
      setOpeningTerminal(false)
    }
  }, [openingTerminal, resolveTerminalSubtitle])

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
                <AvatarFallback className="rounded-lg">CN</AvatarFallback>
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
                  <AvatarFallback className="rounded-lg">CN</AvatarFallback>
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
                账户
              </DropdownMenuItem>
              {/*<DropdownMenuItem>
                <IconCreditCard />
                费用
              </DropdownMenuItem>*/}
              <DropdownMenuItem>
                <IconNotification />
                通知
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleOpenTerminal()} disabled={openingTerminal}>
                <IconTerminal2 />
                终端
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setLogoutConfirmOpen(true)}>
                <IconLogout />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>确认退出登录</AlertDialogTitle>
              <AlertDialogDescription>
                退出后将清除本地登录状态，需要重新登录才能继续操作。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogoutConfirm}>
                确定退出
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <TerminalViewerDialog
          open={terminalOpen}
          onOpenChange={(open) => {
            setTerminalOpen(open)
            if (!open) setTerminalWsUrl(null)
          }}
          title="超级终端"
          subtitle={terminalSubtitle}
          wsUrl={terminalWsUrl}
          emptyMessage={terminalEmptyMessage}
        />
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
