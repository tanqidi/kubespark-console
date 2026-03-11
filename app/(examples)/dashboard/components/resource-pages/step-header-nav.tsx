"use client"

import { cn } from "@/lib/utils"

export type StepHeaderNavItem = {
  id: string
  title: string
  status: string
  active: boolean
  disabled?: boolean
  onClick: () => void
}

type StepHeaderNavProps = {
  items: StepHeaderNavItem[]
}

export function StepHeaderNav({ items }: StepHeaderNavProps) {
  return (
    <div className="border-b bg-slate-100/80">
      <div className="flex w-full items-center gap-1.5 overflow-x-auto px-3 py-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "inline-flex min-w-fit items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-left transition",
              item.active
                ? "border-slate-300 bg-background"
                : "border-transparent hover:border-slate-200 hover:bg-background/70",
              item.disabled && "cursor-not-allowed opacity-70"
            )}
            onClick={item.onClick}
            disabled={item.disabled}
            aria-current={item.active ? "step" : undefined}
          >
            <div className="flex shrink-0 flex-col items-center">
              <span className="size-3.5 rotate-45 rounded-[2px] border border-[#19314a] bg-[#2a4663]" />
              <span className="-mt-px size-3.5 rotate-45 rounded-[2px] border border-[#a8b8c7] bg-[#c9d5df]" />
              <span
                className={cn(
                  "-mt-px size-2.5 rounded-full border-2 bg-background",
                  item.active ? "border-emerald-500" : "border-slate-300"
                )}
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold leading-none text-[#1f3550]">
                {item.title}
              </span>
              <span className="mt-0.5 text-[11px] leading-4 text-[#64748b]">
                {item.status}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
