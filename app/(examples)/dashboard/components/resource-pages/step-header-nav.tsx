"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type StepHeaderNavItem = {
  id: string
  title: string
  status: string
  active: boolean
  icon?: ReactNode
  disabled?: boolean
  onClick: () => void
}

type StepHeaderNavProps = {
  items: StepHeaderNavItem[]
}

export function StepHeaderNav({ items }: StepHeaderNavProps) {
  return (
    <div className="border-b bg-muted/35">
      <div className="flex w-full items-center gap-2 overflow-x-auto px-4 py-2">
        {items.map((item, index) => {
          const isDone = !item.active && item.status.includes("已")
          const statusTone = item.active
            ? "bg-primary"
            : isDone
              ? "bg-primary/35"
              : "bg-border"

          return (
            <button
              key={item.id}
              type="button"
              className={cn(
                "inline-flex min-w-fit items-center gap-2 rounded-md border px-3 py-2 text-left transition",
                item.active
                  ? "border-primary/30 bg-primary/10"
                  : "border-transparent bg-background/75 hover:border-border hover:bg-background",
                item.disabled && "cursor-not-allowed opacity-70"
              )}
              onClick={item.onClick}
              disabled={item.disabled}
              aria-current={item.active ? "step" : undefined}
            >
              <span
                className={cn(
                  "inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground",
                  item.active && "border-primary/40 text-primary"
                )}
              >
                {item.icon ?? <span className="text-xs font-semibold">{index + 1}</span>}
              </span>

              <span className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold leading-none">{item.title}</span>
                <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-1.5 rounded-full", statusTone)} />
                  {item.status}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
