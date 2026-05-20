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
  
  customClasses?: {
    button?: string
    statusDot?: string
    statusText?: string
    badge?: string
  }
}

export type StepHeaderNavStyleConfig = {
  progressed: {
    border: string
    background: string
    hover?: string
  }
  notProgressed: {
    border: string
    background: string
    hover?: string
  }
  disabled: {
    cursor: string
    opacity: string
  }
  statusDot: {
    success: string
    active: string
    failed: string
    default: string
  }
  statusText: {
    active: string
    default: string
  }
  badge: {
    progressed: string
    default: string
  }
}

const defaultStyleConfig: StepHeaderNavStyleConfig = {
  progressed: {
    border: "border-primary/35",
    background: "bg-primary/10",
    hover: "hover:border-primary/25 hover:bg-primary/5",
  },
  notProgressed: {
    border: "border-border/70",
    background: "bg-background/85",
    hover: "hover:border-primary/25 hover:bg-primary/5",
  },
  disabled: {
    cursor: "cursor-not-allowed",
    opacity: "opacity-50",
  },
  statusDot: {
    success: "bg-emerald-500",
    active: "bg-emerald-500",
    failed: "bg-amber-500",
    default: "bg-muted-foreground/35",
  },
  statusText: {
    active: "text-foreground",
    default: "text-muted-foreground",
  },
  badge: {
    progressed: "border-emerald-500/40 text-foreground",
    default: "",
  },
}

type StepHeaderNavProps = {
  items: StepHeaderNavItem[]
  highlightByActiveOnly?: boolean
  styleConfig?: Partial<StepHeaderNavStyleConfig>
  
  disableOnSkippedAfterFailed?: boolean
}

export function StepHeaderNav({ 
  items, 
  highlightByActiveOnly = false, 
  styleConfig = {},
  disableOnSkippedAfterFailed = false,
}: StepHeaderNavProps) {
  const config = { ...defaultStyleConfig, ...styleConfig }
  const activeIndex = items.findIndex((item) => item.active)

  return (
    <div className="border-b bg-muted/30">
      <div className="flex w-full items-center overflow-x-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => {
          const isDone =
            !highlightByActiveOnly &&
            activeIndex >= 0 &&
            index < activeIndex &&
            item.status.includes("已")
          const isProgressed = item.active || isDone
          const isFailed = item.status.includes("失败") || item.status.includes("failure") || item.status.includes("failed")
          
          let shouldDisable = item.disabled || false
          if (disableOnSkippedAfterFailed) {
            const failedBeforeIndex = items.slice(0, index).some(
              (prev) => prev.status.includes("失败") || prev.status.includes("failure") || prev.status.includes("failed")
            )
            shouldDisable = shouldDisable || (failedBeforeIndex && item.status.includes("skipped"))
          }
          
          const isDisabled = shouldDisable

          const statusTone = item.customClasses?.statusDot || (
            isFailed 
              ? config.statusDot.failed 
              : (item.active || isDone) 
                ? config.statusDot.success 
                : config.statusDot.default
          )
          
          const statusTextTone = item.customClasses?.statusText || (
            isFailed || isProgressed 
              ? config.statusText.active 
              : config.statusText.default
          )

          const shapeClass =
            items.length === 1
              ? "rounded-lg"
              : index === 0
              ? "rounded-l-lg rounded-r-none"
              : index === items.length - 1
                ? "rounded-r-lg rounded-l-none border-l-0"
                : "rounded-none border-l-0"

          const buttonClass = cn(
            "inline-flex min-w-fit shrink-0 items-center gap-1.5 border px-3.5 py-2.5 text-left transition",
            isProgressed
              ? [config.progressed.border, config.progressed.background]
              : [config.notProgressed.border, config.notProgressed.background],
            !isDisabled && (isProgressed ? config.progressed.hover : config.notProgressed.hover),
            shapeClass,
            isDisabled && [config.disabled.cursor, config.disabled.opacity],
            item.customClasses?.button
          )

          const badgeClass = cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground me-1.5",
            (item.active || isDone) && config.badge.progressed,
            item.customClasses?.badge
          )

          return (
            <button
              key={item.id}
              type="button"
              className={buttonClass}
              onClick={item.onClick}
              disabled={isDisabled}
              aria-current={item.active ? "step" : undefined}
            >
              <span className={badgeClass}>
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