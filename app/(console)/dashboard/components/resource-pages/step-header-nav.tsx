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
    highlightByActiveOnly?: boolean
}

export function StepHeaderNav({ items, highlightByActiveOnly = false }: StepHeaderNavProps) {
    const activeIndex = items.findIndex((item) => item.active)

    return (
        <div className="border-b bg-muted/30">
            <div className="flex w-full items-center overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {items.map((item, index) => {
                    const isDone =
                        !highlightByActiveOnly &&
                        activeIndex >= 0 &&
                        index < activeIndex &&
                        (item.status.includes("已") || 
                         ["success", "completed", "passed", "configured"].includes(item.status.toLowerCase()))
                    const isProgressed = item.active || isDone
                    const statusTone = item.active || isDone ? "bg-emerald-500" : "bg-muted-foreground/35"
                    const statusTextTone = item.active || isDone ? "text-foreground" : "text-muted-foreground"
                    const shapeClass =
                        items.length === 1
                            ? "rounded-lg"
                            : index === 0
                                ? "rounded-l-lg rounded-r-none"
                                : index === items.length - 1
                                    ? "rounded-r-lg rounded-l-none border-l-0"
                                    : "rounded-none border-l-0"

                    return (
                        <button
                            key={item.id}
                            type="button"
                            className={cn(
                                "inline-flex min-w-fit shrink-0 items-center gap-1.5 border px-3.5 py-2.5 text-left transition",
                                isProgressed
                                    ? "border-primary/35 bg-primary/10"
                                    : "border-border/70 bg-background/85 hover:border-primary/25 hover:bg-primary/5",
                                shapeClass,
                                item.disabled && "cursor-not-allowed opacity-70"
                            )}
                            onClick={item.onClick}
                            disabled={item.disabled}
                            aria-current={item.active ? "step" : undefined}
                        >
              <span
                  className={cn(
                      "inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground me-1.5",
                      (item.active || isDone) && "border-emerald-500/40 text-foreground"
                  )}
              >
                {item.icon ?? <span className="text-[12px] font-semibold">{index + 1}</span>}
              </span>

                            <span className="flex min-w-0 flex-col">
                <span className="text-[12px] font-semibold leading-none">{item.title}</span>
                <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[11px] leading-4", statusTextTone)}>
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
