"use client"

import * as React from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"

const LOG_TERMINAL_THEME = {
  background: "#0b1220",
  foreground: "#e2e8f0",
  cursor: "#93c5fd",
  selectionBackground: "rgba(148,163,184,0.25)",
}

function toTerminalText(value: string): string {
  return value.replace(/\r?\n/g, "\r\n")
}

type LogViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  realtime: boolean
  onRealtimeChange: (checked: boolean) => void
  loading?: boolean
  error?: string | null
  content: string
}

export function LogViewerDialog({
  open,
  onOpenChange,
  title,
  subtitle = "展示最近日志输出。",
  realtime,
  onRealtimeChange,
  loading = false,
  error = null,
  content,
}: LogViewerDialogProps) {
  const [terminalHost, setTerminalHost] = React.useState<HTMLDivElement | null>(null)
  const [fullscreen, setFullscreen] = React.useState(false)
  const terminalRef = React.useRef<Terminal | null>(null)
  const fitAddonRef = React.useRef<FitAddon | null>(null)
  const lastRenderedRef = React.useRef("")
  const latestContentRef = React.useRef(content)
  const fitTimerRefs = React.useRef<number[]>([])

  React.useEffect(() => {
    latestContentRef.current = content
  }, [content])

  const initTerminal = React.useCallback(() => {
    if (terminalRef.current || !terminalHost) return

    const terminal = new Terminal({
      convertEol: true,
      disableStdin: true,
      fontSize: 13,
      lineHeight: 1.3,
      letterSpacing: 0.2,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace",
      theme: LOG_TERMINAL_THEME,
      cursorBlink: false,
      scrollback: 20000,
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(terminalHost)
    fitAddon.fit()

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    const initial = latestContentRef.current || "(无日志输出)"
    terminal.write(toTerminalText(initial))
    lastRenderedRef.current = initial
  }, [terminalHost])

  const scheduleFit = React.useCallback(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return

    fitAddon.fit()
    const t1 = window.setTimeout(() => fitAddonRef.current?.fit(), 50)
    const t2 = window.setTimeout(() => fitAddonRef.current?.fit(), 150)
    const t3 = window.setTimeout(() => fitAddonRef.current?.fit(), 300)
    fitTimerRefs.current.push(t1, t2, t3)
    window.requestAnimationFrame(() => fitAddonRef.current?.fit())
  }, [])

  const disposeTerminal = React.useCallback(() => {
    fitTimerRefs.current.forEach((timer) => window.clearTimeout(timer))
    fitTimerRefs.current = []
    fitAddonRef.current?.dispose()
    terminalRef.current?.dispose()
    fitAddonRef.current = null
    terminalRef.current = null
    lastRenderedRef.current = ""
  }, [])

  React.useEffect(() => {
    if (!open) return
    initTerminal()
    const term = terminalRef.current
    const fitAddon = fitAddonRef.current
    const container = terminalHost
    if (!term || !fitAddon || !container) return

    const observer = new ResizeObserver(() => {
      fitAddon.fit()
    })
    observer.observe(container)
    scheduleFit()

    return () => {
      observer.disconnect()
    }
  }, [initTerminal, open, scheduleFit, terminalHost])

  React.useEffect(() => {
    if (!open || loading || Boolean(error)) return
    const term = terminalRef.current
    if (!term) return

    const next = content || "(无日志输出)"
    const prev = lastRenderedRef.current
    if (next === prev) return

    const nearBottom = term.buffer.active.baseY - term.buffer.active.viewportY <= 1
    scheduleFit()
    if (prev && next.startsWith(prev)) {
      const appendText = next.slice(prev.length)
      if (appendText) term.write(toTerminalText(appendText))
    } else {
      term.reset()
      term.write(toTerminalText(next))
    }

    lastRenderedRef.current = next
    if (realtime && nearBottom) term.scrollToBottom()
  }, [content, error, loading, open, realtime, scheduleFit])

  React.useEffect(() => {
    if (!open) {
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
      disposeTerminal()
    }
  }, [disposeTerminal])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          fullscreen
            ? "flex h-screen min-h-screen max-h-screen w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none"
            : "flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-270"
        }
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="flex items-start justify-between border-b bg-muted/15">
          <DialogHeader className="px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          <div className="h-full flex items-center gap-3 me-20">
            <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
              <span className="text-sm font-medium">全屏</span>
              <Switch
                checked={fullscreen}
                onCheckedChange={setFullscreen}
                aria-label="全屏"
              />
            </div>
            <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
              <span className="text-sm font-medium">实时日志</span>
              <Switch
                checked={realtime}
                onCheckedChange={onRealtimeChange}
                aria-label="实时日志"
              />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <div className="relative h-full overflow-hidden rounded-lg border border-slate-700/60 bg-slate-950/95 shadow-inner">
              <div ref={setTerminalHost} className="h-full w-full px-2 py-2" />
            {loading ? (
              <div className="absolute inset-0 bg-black/60 p-4 text-sm text-zinc-300">日志加载中...</div>
            ) : null}
            {error ? (
              <div className="absolute inset-0 bg-black/60 p-4 text-sm text-red-400">{error}</div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
