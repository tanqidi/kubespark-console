"use client"

import * as React from "react"
import { IconTrash } from "@tabler/icons-react"

import { AdvancedToggleCard } from "@/app/(console)/dashboard/components/resource-pages/advanced-toggle-card"
import type { MetadataEntry } from "@/app/(console)/dashboard/components/resource-pages/resource-metadata-editor"
import { useTranslations } from "@/app/lib/i18n"
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
  onRequestDeleteEntry?: (entry: MetadataEntry, index: number) => void
  resolveEntryStatus?: (entry: MetadataEntry, index: number) => string | null
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
  onRequestDeleteEntry,
  resolveEntryStatus,
  disabled = false,
  title = "变量配置",
  description = "维护流水线运行所需的键值变量或秘钥参数，值为空则跳过修改。",
}: ResourceKeyValueEditorProps) {
  const t = useTranslations()

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
        <FieldLabel className="mb-2">{t("keyValueDialog.keyValue")}</FieldLabel>
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <div
              key={`kv-${index}`}
              className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>{t("keyValueDialog.key")}</InputGroupText>
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
                  <InputGroupText>{t("keyValueDialog.value")}</InputGroupText>
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
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (onRequestDeleteEntry) {
                      onRequestDeleteEntry(entry, index)
                      return
                    }
                    setEntries((current) =>
                      current.length <= 1
                        ? [{ key: "", value: "" }]
                        : current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }}
                  disabled={disabled}
                  className="shrink-0"
                  aria-label={t("keyValueDialog.delete")}
                >
                  <IconTrash data-icon="inline-start" />
                  {t("keyValueDialog.delete")}
                </Button>
                {resolveEntryStatus ? (
                  <span className="text-xs text-muted-foreground">{resolveEntryStatus(entry, index) ?? ""}</span>
                ) : null}
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEntries((current) => [...current, { key: "", value: "" }])}
              disabled={disabled}
            >
              {t("keyValueDialog.add")}
            </Button>
          </div>
        </div>
      </div>
    </AdvancedToggleCard>
  )
}
