"use client"

import * as React from "react"
import { IconTrash } from "@tabler/icons-react"

import { AdvancedToggleCard } from "@/app/(console)/dashboard/components/resource-pages/advanced-toggle-card"
import type { MetadataEntry } from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"

type ResourceKeyValueEditorProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  entries: MetadataEntry[]
  setEntries: React.Dispatch<React.SetStateAction<MetadataEntry[]>>
  disabled?: boolean
  title?: string
  description?: string
}

export function hasUserProvidedKeyValues(entries: MetadataEntry[]): boolean {
  return entries.some((item) => item.key.trim().length > 0)
}

export function ResourceKeyValueEditor({
  checked,
  onCheckedChange,
  entries,
  setEntries,
  disabled = false,
  title = "变量配置",
  description = "维护流水线运行所需的键值变量或秘钥参数。",
}: ResourceKeyValueEditorProps) {
  return (
    <AdvancedToggleCard
      checked={checked}
      disabled={disabled}
      ariaLabel={title}
      title={title}
      description={description}
      onCheckedChange={(nextChecked) => {
        if (disabled) return
        if (nextChecked) {
          if (entries.length === 0) setEntries([{ key: "", value: "" }])
        } else {
          setEntries([{ key: "", value: "" }])
        }
        onCheckedChange(nextChecked)
      }}
    >
      <div>
        <FieldLabel className="mb-2">键值</FieldLabel>
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div
              key={`kv-${index}`}
              className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>键</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  value={entry.key}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setEntries((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: nextValue } : item
                      )
                    )
                  }}
                  autoComplete="off"
                  disabled={disabled}
                  className="min-w-0"
                />
              </InputGroup>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>值</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  value={entry.value}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setEntries((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: nextValue } : item
                      )
                    )
                  }}
                  autoComplete="off"
                  disabled={disabled}
                  className="min-w-0"
                />
              </InputGroup>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEntries((current) =>
                    current.length <= 1
                      ? [{ key: "", value: "" }]
                      : current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }}
                disabled={disabled}
                className="shrink-0"
                aria-label="删除键值"
              >
                <IconTrash data-icon="inline-start" />
                删除
              </Button>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEntries((current) => [...current, { key: "", value: "" }])}
              disabled={disabled}
            >
              添加
            </Button>
          </div>
        </div>
      </div>
    </AdvancedToggleCard>
  )
}
