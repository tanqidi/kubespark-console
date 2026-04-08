"use client"

import * as React from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

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

type TerminalSessionPanelProps = {
  active: boolean
  wsUrl: string | null
  emptyMessage?: string
  className?: string
}

export function TerminalSessionPanel({
  active,
  wsUrl,
  emptyMessage = "终端连接地址不可用。",
  className,
}: TerminalSessionPanelProps) {
  const [terminalHost, setTerminalHost] = React.useState<HTMLDivElement | null>(null)
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
    if (!active || !terminalHost || terminalRef.current) return

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
      terminal.writeln("\x1b[1;36m正在连接终端...\x1b[0m")
    } else {
      terminal.writeln(`\x1b[1;33m${emptyMessage}\x1b[0m`)
    }

    return () => {
      disposeInput.dispose()
    }
  }, [active, emptyMessage, sendSocketMessage, terminalHost, wsUrl])

  React.useEffect(() => {
    if (!active || !terminalRef.current || !terminalHost) return
    const observer = new ResizeObserver(() => {
      scheduleFit()
    })
    observer.observe(terminalHost)
    scheduleFit()
    return () => observer.disconnect()
  }, [active, scheduleFit, terminalHost])

  React.useEffect(() => {
    if (!active || !wsUrl || !terminalReady || !terminalRef.current) return

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
  }, [active, sendResize, terminalReady, wsUrl])

  React.useEffect(() => {
    if (!active) {
      socketRef.current?.close()
      socketRef.current = null
      disposeTerminal()
      setTerminalHost(null)
    }
  }, [active, disposeTerminal])

  React.useEffect(() => {
    return () => {
      socketRef.current?.close()
      disposeTerminal()
    }
  }, [disposeTerminal])

  return (
    <div className={className ?? "relative h-full overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner"}>
      <div ref={setTerminalHost} className="h-full w-full px-2 py-2" />
    </div>
  )
}
