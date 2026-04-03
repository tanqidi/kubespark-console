"use client"

import * as React from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import { IconArrowsMaximize, IconArrowsMinimize } from "@tabler/icons-react"
import "@xterm/xterm/css/xterm.css"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const TERMINAL_THEME = {
  background: "#0b1220",
  foreground: "#e2e8f0",
  cursor: "#93c5fd",
  selectionBackground: "rgba(148,163,184,0.25)",
}

type ExecServerMessage = {
  op: "stdout" | "stderr" | "error" | "exit"
  data?: string
  message?: string
}

type TerminalViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  wsUrl: string | null
}

export function TerminalViewerDialog({
  open,
  onOpenChange,
  title,
  subtitle = "连接 Kubernetes Pod 终端会话。",
  wsUrl,
}: TerminalViewerDialogProps) {
  const [terminalHost, setTerminalHost] = React.useState<HTMLDivElement | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)
  const terminalRef = React.useRef<Terminal | null>(null)
  const fitAddonRef = React.useRef<FitAddon | null>(null)
  const socketRef = React.useRef<WebSocket | null>(null)
  const fitTimerRefs = React.useRef<number[]>([])
  const [terminalReady, setTerminalReady] = React.useState(false)

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
    terminal.writeln("\x1b[1;36m正在连接终端...\x1b[0m")

    return () => {
      disposeInput.dispose()
    }
  }, [open, sendSocketMessage, terminalHost])

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
      terminal.writeln("\x1b[32m[connected]\x1b[0m")
      sendResize()
    }

    ws.onmessage = (event) => {
      const consume = (raw: string) => {
        try {
          const parsed = JSON.parse(raw) as ExecServerMessage
          if (parsed.op === "stdout" || parsed.op === "stderr") {
            if (parsed.data) terminal.write(parsed.data)
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
              className={`rounded-full transition-colors ${
                fullscreen ? "border-black bg-black text-white hover:bg-black hover:text-white" : ""
              }`}
              onClick={() => setFullscreen((prev) => !prev)}
              aria-label={fullscreen ? "退出全屏" : "全屏"}
              title={fullscreen ? "退出全屏" : "全屏"}
            >
              {fullscreen ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
              <span className="sr-only">{fullscreen ? "退出全屏" : "全屏"}</span>
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <div className="relative h-full overflow-hidden rounded-lg border border-slate-700/60 bg-slate-950/95 shadow-inner">
            <div ref={setTerminalHost} className="h-full w-full px-2 py-2" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
