"use client"

import * as React from "react"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { TerminalSessionPanel } from "@/app/(console)/dashboard/components/resource-pages/terminal-session-panel"

function TerminalStandaloneContent() {
  const searchParams = useSearchParams()

  const [sessionValues, setSessionValues] = React.useState<{
    title?: string
    subtitle?: string
    wsUrl?: string | null
    emptyMessage?: string
  } | null>(null)
  const sessionKey = searchParams.get("session")

  React.useEffect(() => {
    if (!sessionKey) {
      setSessionValues(null)
      return
    }
    try {
      const key = `kubespark-terminal-session:${sessionKey}`
      const raw = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
      if (!raw) {
        setSessionValues(null)
        return
      }
      const parsed = JSON.parse(raw) as {
        title?: string
        subtitle?: string
        wsUrl?: string | null
        emptyMessage?: string
      }
      setSessionValues(parsed)
      window.localStorage.removeItem(key)
      window.sessionStorage.removeItem(key)
    } catch {
      setSessionValues(null)
    }
  }, [sessionKey])

  const title =
    sessionValues?.title || searchParams.get("title") || "容器终端"
  const subtitle =
    sessionValues?.subtitle ||
    searchParams.get("subtitle") ||
    "连接 Kubernetes Pod 的终端会话。"
  const wsUrl =
    sessionValues?.wsUrl ?? searchParams.get("wsUrl")
  const emptyMessage =
    sessionValues?.emptyMessage ||
    searchParams.get("emptyMessage") ||
    "终端连接地址不可用。"

  const resolvedWindowTitle = React.useMemo(() => {
    const trimmedSubtitle = subtitle?.trim() || ""
    const fallback = trimmedSubtitle || title?.trim() || "容器终端"

    const subtitleMatch = trimmedSubtitle.match(/^连接 Kubernetes Pod（.+）的终端会话。$/)
    if (subtitleMatch) {
      return trimmedSubtitle
    }

    if (!wsUrl) return fallback

    try {
      const parsed = new URL(wsUrl)
      const namespace = parsed.searchParams.get("namespace")?.trim() || ""
      const podMatch = parsed.pathname.match(/\/pods\/([^/]+)\/exec$/)
      const podName = podMatch?.[1] ? decodeURIComponent(podMatch[1]).trim() : ""
      if (namespace && podName) {
        return `连接 Kubernetes Pod（${namespace}/${podName}）的终端会话。`
      }
    } catch {
      // ignore parse error and use fallback title
    }

    return fallback
  }, [subtitle, title, wsUrl])

  React.useLayoutEffect(() => {
    const nextTitle = resolvedWindowTitle
    if (nextTitle) {
      document.title = nextTitle
    }
  }, [resolvedWindowTitle])

  React.useEffect(() => {
    const nextTitle = resolvedWindowTitle
    if (!nextTitle) return

    const raf = window.requestAnimationFrame(() => {
      document.title = nextTitle
    })
    const timer = window.setTimeout(() => {
      document.title = nextTitle
    }, 120)

    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [resolvedWindowTitle])

  return (
    <main className="flex h-screen min-h-screen w-screen flex-col bg-background">
      <section className="min-h-0 flex-1">
        <TerminalSessionPanel
          active
          wsUrl={wsUrl}
          emptyMessage={emptyMessage}
          className="relative h-full overflow-hidden bg-[#1e1e1e] shadow-inner"
        />
      </section>
    </main>
  )
}

export default function TerminalStandalonePage() {
  return (
    <Suspense fallback={<main className="h-screen min-h-screen w-screen bg-background" />}>
      <TerminalStandaloneContent />
    </Suspense>
  )
}
