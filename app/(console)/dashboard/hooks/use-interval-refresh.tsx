"use client"

import * as React from "react"

export function useIntervalRefresh(
  refreshFn: () => void | Promise<void>,
  intervalMs: number = 3000
) {
  const savedRefreshFn = React.useRef(refreshFn)

  React.useEffect(() => {
    savedRefreshFn.current = refreshFn
  }, [refreshFn])

  React.useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      if (cancelled) return
      await savedRefreshFn.current()
    }

    // Initial refresh
    void refresh()

    const timerId = window.setInterval(() => {
      // 检查 DOM 中是否有打开的下拉菜单
      // Radix UI 的 DropdownMenu 在打开时会有 data-state="open" 或者类似的属性
      const hasOpenMenu = document.querySelector('[data-state="open"]') !== null
      
      // 只有在没有菜单打开时才刷新
      if (!hasOpenMenu) {
        void refresh()
      }
    }, intervalMs)

    return () => {
      cancelled = true
      window.clearInterval(timerId)
    }
  }, [intervalMs])
}
