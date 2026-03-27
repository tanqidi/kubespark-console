"use client"

import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"

type AdvancedToggleCardProps = {
  checked: boolean
  disabled: boolean
  ariaLabel: string
  title: string
  description: string
  onCheckedChange: (checked: boolean) => void
  children: React.ReactNode
}

export function AdvancedToggleCard({
  checked,
  disabled,
  ariaLabel,
  title,
  description,
  onCheckedChange,
  children,
}: AdvancedToggleCardProps) {
  const hasBodyContent = React.Children.toArray(children).some(
    (child) => child !== null && child !== undefined && child !== false
  )

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(next === true)}
          aria-label={ariaLabel}
          disabled={disabled}
          className="mt-1 shrink-0"
        />
        <div>
          <div className="text-sm">{title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        </div>
      </div>
      {checked && hasBodyContent ? <div className="mt-4 rounded-lg bg-muted/60 p-4">{children}</div> : null}
    </div>
  )
}
