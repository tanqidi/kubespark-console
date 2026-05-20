"use client"

import * as React from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconDownload,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react"
import "@xterm/xterm/css/xterm.css"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"

export type PipelineRunStage = {
  id: number
  name: string
  number: number
  status: string
  steps: Array<{
    id: number
    name: string
    number: number
    status: string
    image: string
  }>
}

const LOG_TERMINAL_THEME = {
  background: "#1e1e1e",
  foreground: "#d4d4d4",
  cursor: "#d4d4d4",
  selectionBackground: "rgba(255,255,255,0.18)",
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
  onDownload?: () => void
  downloadDisabled?: boolean
  stages?: PipelineRunStage[]
  currentStage?: number
  currentStep?: number
  onStageStepChange?: (stage: number, step: number) => void
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
  onDownload,
  downloadDisabled = false,
  stages = [],
  currentStage,
  currentStep,
  onStageStepChange,
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
      lineHeight: 1.35,
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
    const initial = loading || Boolean(error) ? "" : (latestContentRef.current || "(无日志输出)")
    if (initial) terminal.write(toTerminalText(initial))
    lastRenderedRef.current = initial
  }, [error, loading, terminalHost])

  const scheduleFit = React.useCallback(() => {
    const fitAddon = fitAddonRef.current
    if (!fitAddon) return

    fitAddon.fit()
    const t1 = window.setTimeout(() => fitAddonRef.current?.fit(), 50)
    fitTimerRefs.current.push(t1)
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
        overlayClassName="!animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none"
        className={
          fullscreen
            ? "flex h-screen min-h-screen max-h-screen w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 !animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none data-[state=closed]:!zoom-out-100 data-[state=open]:!zoom-in-100 sm:max-w-none"
            : "flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[90vw] max-w-[1280px] flex-col gap-0 overflow-hidden p-0 !animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none data-[state=closed]:!zoom-out-100 data-[state=open]:!zoom-in-100 sm:max-w-[1280px]"
        }
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="flex items-start justify-between border-b bg-muted/15">
          <DialogHeader className="px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          <div className="h-full flex items-center gap-3 me-20">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={onDownload}
              disabled={downloadDisabled}
              aria-label="下载日志"
              title="下载日志"
            >
              <IconDownload />
              <span className="sr-only">下载日志</span>
            </Button>
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`rounded-full transition-colors ${
                realtime ? "border-black bg-black text-white hover:bg-black hover:text-white" : ""
              }`}
              onClick={() => onRealtimeChange(!realtime)}
              aria-label={realtime ? "停止实时日志" : "开启实时日志"}
              title={realtime ? "停止实时日志" : "开启实时日志"}
            >
              {realtime ? <IconPlayerPause /> : <IconPlayerPlay />}
              <span className="sr-only">{realtime ? "停止实时日志" : "开启实时日志"}</span>
            </Button>
          </div>
        </div>
        {stages.length > 0 && (
          <StepHeaderNav
            items={stages.flatMap((stage) =>
              stage.steps.map((step) => ({
                id: `stage-${stage.number}-step-${step.number}`,
                title: step.name,
                status: step.status || "pending",
                active: currentStage === stage.number && currentStep === step.number,
                onClick: () => onStageStepChange?.(stage.number, step.number),
              }))
            )}
            disableOnSkippedAfterFailed={true}
          />
        )}
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <div className="relative h-full overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner">
              <div ref={setTerminalHost} className="h-full w-full px-2 py-2" />
            {error ? (
              <div className="absolute inset-0 bg-[#1e1e1e] p-4 text-sm text-red-400">{error}</div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

