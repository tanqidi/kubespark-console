"use client"

import { IconLoader } from "@tabler/icons-react"

export function ResourceLoadingState() {
  return (
    <div className="px-4 lg:px-6">
      <div className="text-muted-foreground flex h-10 items-center gap-2 text-sm">
        <IconLoader className="size-4 animate-spin" />
        <span>加载中...</span>
      </div>
    </div>
  )
}
