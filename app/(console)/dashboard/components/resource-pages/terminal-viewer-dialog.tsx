"use client"

import * as React from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconExternalLink,
} from "@tabler/icons-react"
import "@xterm/xterm/css/xterm.css"

import { useTranslations } from "@/app/lib/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const TERMINAL_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  selectionBackground: "rgba(255,255,255,0.18)",
}

type ExecServerMessage = {
  op: "stdout" | "stderr" | "error" | "exit" | "connected"
  data?: string
  message?: string
}

type TerminalViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  wsUrl: string | null
  emptyMessage?: string
}

function openTerminalStandalone(params: {
  title: string
  subtitle: string
  wsUrl: string | null
  emptyMessage: string
}) {
  const sessionKey =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `terminal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const screenWidth = window.screen.availWidth || window.outerWidth || 1440
  const screenHeight = window.screen.availHeight || window.outerHeight || 900
  const width = Math.max(900, Math.min(1280, Math.floor(screenWidth * 0.72)))
  const height = Math.max(620, Math.min(860, Math.floor(screenHeight * 0.78)))
  const left = Math.max(0, Math.floor((screenWidth - width) / 2))
  const top = Math.max(0, Math.floor((screenHeight - height) / 2))
  const popupFeatures = [
    "popup=yes",
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
  ].join(",")

  const popupWindow = window.open("", `_kubespark_terminal_${sessionKey}`, popupFeatures)
  if (!popupWindow) return

  const payload = {
    title: params.title,
    subtitle: params.subtitle,
    emptyMessage: params.emptyMessage,
    wsUrl: params.wsUrl,
  }

  try {
    window.localStorage.setItem(`kubespark-terminal-session:${sessionKey}`, JSON.stringify(payload))
  } catch {
    const fallbackParams = new URLSearchParams()
    if (params.title) fallbackParams.set("title", params.title)
    if (params.subtitle) fallbackParams.set("subtitle", params.subtitle)
    if (params.emptyMessage) fallbackParams.set("emptyMessage", params.emptyMessage)
    if (params.wsUrl) fallbackParams.set("wsUrl", params.wsUrl)
    popupWindow.location.href = `/terminal${fallbackParams.toString() ? `?${fallbackParams.toString()}` : ""}`
    popupWindow.focus()
    return
  }

  popupWindow.location.href = `/terminal?session=${encodeURIComponent(sessionKey)}`
  popupWindow.focus()
}

export function TerminalViewerDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  wsUrl,
  emptyMessage,
}: TerminalViewerDialogProps) {
  const t = useTranslations()
  const [terminalHost, setTerminalHost] = React.useState<HTMLDivElement | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)
  const terminalRef = React.useRef<Terminal | null>(null)
  const fitAddonRef = React.useRef<FitAddon | null>(null)
  const socketRef = React.useRef<WebSocket | null>(null)
  const fitTimerRefs = React.useRef<number[]>([])
  const [terminalReady, setTerminalReady] = React.useState(false)
  
  // 使用 ref 存储翻译文本，避免在 useEffect 依赖中加入 t 函数
  const translatedTextsRef = React.useRef({
    connecting: t("terminal.connecting"),
    openInNewWindow: t("terminal.openInNewWindow"),
    fullscreen: t("terminal.fullscreen"),
    exitFullscreen: t("terminal.exitFullscreen"),
  })

  const sendSocketMessage = React.useCallback((payload: unknown) => {
    const ws = socketRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(payload))
  }, [])

  const sendResize = React.useCallback(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    sendSocketMessage({
      op: "resize",
      cols: terminal.cols,
      rows: terminal.rows,
    })
  }, [sendSocketMessage])

  const scheduleFit = React.useCallback(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return
    fitAddon.fit()
    const t1 = window.setTimeout(() => {
      fitAddonRef.current?.fit()
      sendResize()
    }, 50)
    fitTimerRefs.current.push(t1)
    window.requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      sendResize()
    })
  }, [sendResize])

  const disposeTerminal = React.useCallback(() => {
    fitTimerRefs.current.forEach((timer) => window.clearTimeout(timer))
    fitTimerRefs.current = []
    fitAddonRef.current?.dispose()
    terminalRef.current?.dispose()
    fitAddonRef.current = null
    terminalRef.current = null
    setTerminalReady(false)
  }, [])

  React.useEffect(() => {
    if (!open || !terminalHost || terminalRef.current) return

    const terminal = new Terminal({
      convertEol: true,
      disableStdin: false,
      fontSize: 13,
      lineHeight: 1.35,
      letterSpacing: 0.2,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
      theme: TERMINAL_THEME,
      cursorBlink: true,
      scrollback: 10000,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalHost)
    fitAddon.fit()

    const disposeInput = terminal.onData((data) => {
      sendSocketMessage({ op: "stdin", data })
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    setTerminalReady(true)
    if (wsUrl) {
      terminal.writeln(`\x1b[1;36m${translatedTextsRef.current.connecting}\x1b[0m`)
    } else {
      terminal.writeln(`\x1b[1;33m${emptyMessage}\x1b[0m`)
    }

    return () => {
      disposeInput.dispose()
    }
  }, [emptyMessage, open, sendSocketMessage, terminalHost, wsUrl])

  React.useEffect(() => {
    if (!open || !terminalRef.current || !terminalHost) return
    const observer = new ResizeObserver(() => {
      scheduleFit()
    })
    observer.observe(terminalHost)
    scheduleFit()
    return () => observer.disconnect()
  }, [open, scheduleFit, terminalHost])

  React.useEffect(() => {
    if (!open || !wsUrl || !terminalReady || !terminalRef.current) return

    const terminal = terminalRef.current
    const ws = new WebSocket(wsUrl)
    ws.binaryType = "arraybuffer"
    socketRef.current = ws
    terminal.writeln(`\x1b[90m[ws] ${wsUrl}\x1b[0m`)

    ws.onopen = () => {
      const token =
        (typeof window !== "undefined"
          ? localStorage.getItem("kubespark_token") || sessionStorage.getItem("kubespark_token")
          : "") || ""
      ws.send(JSON.stringify({ op: "auth", token }))
      terminal.writeln("\x1b[90m[proxy connected]\x1b[0m")
    }

    ws.onmessage = (event) => {
      const consume = (raw: string) => {
        try {
          const parsed = JSON.parse(raw) as ExecServerMessage
          if (parsed.op === "stdout" || parsed.op === "stderr") {
            if (parsed.data) terminal.write(parsed.data)
            return
          }
          if (parsed.op === "connected") {
            terminal.writeln("\x1b[32m[connected]\x1b[0m")
            sendResize()
            return
          }
          if (parsed.op === "error") {
            terminal.writeln(`\r\n\x1b[31m[error] ${parsed.message ?? "exec failed"}\x1b[0m`)
            return
          }
          if (parsed.op === "exit") {
            terminal.writeln("\r\n\x1b[33m[session closed]\x1b[0m")
          }
        } catch {
          terminal.write(raw)
        }
      }

      if (typeof event.data === "string") {
        consume(event.data)
        return
      }
      if (event.data instanceof ArrayBuffer) {
        consume(new TextDecoder("utf-8").decode(event.data))
        return
      }
      if (event.data instanceof Blob) {
        void event.data.text().then(consume)
        return
      }
      consume(String(event.data))
    }

    ws.onerror = () => {
      terminal.writeln("\r\n\x1b[31m[network error]\x1b[0m")
    }
    ws.onclose = (event) => {
      const reason = event.reason ? ` ${event.reason}` : ""
      terminal.writeln(`\r\n\x1b[33m[disconnected code=${event.code}${reason}]\x1b[0m`)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ op: "close" }))
      }
      ws.close()
      if (socketRef.current === ws) socketRef.current = null
    }
  }, [open, sendResize, terminalReady, wsUrl])

  React.useEffect(() => {
    if (!open) {
      socketRef.current?.close()
      socketRef.current = null
      disposeTerminal()
      setTerminalHost(null)
      setFullscreen(false)
    }
  }, [disposeTerminal, open])

  React.useEffect(() => {
    if (!open) return
    scheduleFit()
  }, [fullscreen, open, scheduleFit])

  React.useEffect(() => {
    return () => {
      socketRef.current?.close()
      disposeTerminal()
    }
  }, [disposeTerminal])

  const handleOpenInNewWindow = React.useCallback(() => {
    openTerminalStandalone({
      title,
      subtitle,
      wsUrl,
      emptyMessage,
    })
  }, [emptyMessage, subtitle, title, wsUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="!animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none"
        className={
          fullscreen
            ? "flex h-screen min-h-screen max-h-screen w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 !animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:max-w-none"
            : "flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[90vw] max-w-[1280px] flex-col gap-0 overflow-hidden p-0 !animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none sm:max-w-[1280px]"
        }
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="flex items-start justify-between border-b bg-muted/15">
          <DialogHeader className="px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          <div className="me-20 flex h-full items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={handleOpenInNewWindow}
              aria-label={translatedTextsRef.current.openInNewWindow}
              title={translatedTextsRef.current.openInNewWindow}
            >
              <IconExternalLink className="size-4" />
              <span className="sr-only">{translatedTextsRef.current.openInNewWindow}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`rounded-full transition-colors ${
                fullscreen ? "border-black bg-black text-white hover:bg-black hover:text-white" : ""
              }`}
              onClick={() => setFullscreen((prev) => !prev)}
              aria-label={fullscreen ? translatedTextsRef.current.exitFullscreen : translatedTextsRef.current.fullscreen}
              title={fullscreen ? translatedTextsRef.current.exitFullscreen : translatedTextsRef.current.fullscreen}
            >
              {fullscreen ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
              <span className="sr-only">{fullscreen ? translatedTextsRef.current.exitFullscreen : translatedTextsRef.current.fullscreen}</span>
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <div className="relative h-full overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner">
            <div ref={setTerminalHost} className="h-full w-full px-2 py-2" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
