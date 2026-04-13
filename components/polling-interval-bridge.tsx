"use client"

import * as React from "react"

const DEFAULT_POLL_DELAY_MS = 3000
const PATCHED_FLAG = "__kubesparkPollingIntervalPatched__"

type PatchedWindow = Window & {
  [PATCHED_FLAG]?: boolean
}

function parseConfiguredPollMs(): number {
  const raw = process.env.NEXT_PUBLIC_AUTO_REFRESH_SECONDS?.trim() ?? ""
  if (!raw) return 0
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.trunc(seconds * 1000)
}

export function PollingIntervalBridge() {
  React.useEffect(() => {
    const target = window as PatchedWindow
    if (target[PATCHED_FLAG]) return

    const configuredMs = parseConfiguredPollMs()
    const originalSetInterval = window.setInterval.bind(window)

    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === DEFAULT_POLL_DELAY_MS) {
        if (configuredMs <= 0) {
          return -1 as unknown as number
        }
        return originalSetInterval(handler, configuredMs, ...args)
      }
      return originalSetInterval(handler, timeout, ...args)
    }) as typeof window.setInterval

    target[PATCHED_FLAG] = true
  }, [])

  return null
}
