"use client"

import * as React from "react"
import { IconTrash } from "@tabler/icons-react"

import { AdvancedToggleCard } from "@/app/(console)/dashboard/components/resource-pages/advanced-toggle-card"
import {
  isAutoMetadataAnnotationKey,
  isAutoMetadataLabelKey,
} from "@/app/lib/kubespark/metadata-ignore"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group"

export type MetadataEntry = { key: string; value: string }

export function isDescriptionAnnotationKey(key: string): boolean {
  return key.trim().toLowerCase() === "description"
}

function isIgnoredMetadataAnnotationKey(key: string): boolean {
  return isAutoMetadataAnnotationKey(key)
}

function isIgnoredMetadataLabelKey(key: string): boolean {
  return isAutoMetadataLabelKey(key)
}

export function hasUserProvidedMetadata(
  labels: MetadataEntry[],
  annotations: MetadataEntry[]
): boolean {
  const hasLabel = labels.some(
    (item) => item.key.trim().length > 0 && !isIgnoredMetadataLabelKey(item.key)
  )
  const hasAnnotation = annotations.some(
    (item) => item.key.trim().length > 0 && !isIgnoredMetadataAnnotationKey(item.key)
  )
  return hasLabel || hasAnnotation
}

export function metadataEntriesToRecord(entries: MetadataEntry[]): Record<string, string> {
  return Object.fromEntries(
    entries
      .map((item) => ({ key: item.key.trim(), value: item.value.trim() }))
      .filter((item) => item.key.length > 0)
      .map((item) => [item.key, item.value])
  ) as Record<string, string>
}

export function metadataRecordToEntries(record: Record<string, string>): MetadataEntry[] {
  const entries = Object.entries(record)
    .map(([key, value]) => ({ key: key.trim(), value: value.trim() }))
    .filter((item) => item.key.length > 0)
  return entries.length > 0 ? entries : [{ key: "", value: "" }]
}

type ResourceMetadataEditorProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  labels: MetadataEntry[]
  setLabels: React.Dispatch<React.SetStateAction<MetadataEntry[]>>
  annotations: MetadataEntry[]
  setAnnotations: React.Dispatch<React.SetStateAction<MetadataEntry[]>>
  description: string
  setDescription: (value: string) => void
  disabled?: boolean
  titleText?: string
}

export function ResourceMetadataEditor({
  checked,
  onCheckedChange,
  labels,
  setLabels,
  annotations,
  setAnnotations,
  description,
  setDescription,
  disabled = false,
  titleText = "统一管理路由的标签与注解信息。",
}: ResourceMetadataEditorProps) {
  React.useEffect(() => {
    const descriptionText = description.trim()
    setAnnotations((current) => {
      const descriptionIndex = current.findIndex((item) => isDescriptionAnnotationKey(item.key))
      if (!descriptionText) {
        if (descriptionIndex < 0) return current
        if ((current[descriptionIndex]?.value ?? "") === "") return current
        return current.map((item, index) =>
          index === descriptionIndex ? { ...item, value: "" } : item
        )
      }
      if (descriptionIndex < 0) {
        const hasOnlyEmptyRow =
          current.length === 1 &&
          (current[0]?.key.trim() ?? "") === "" &&
          (current[0]?.value.trim() ?? "") === ""
        if (hasOnlyEmptyRow) {
          return [{ key: "description", value: descriptionText }]
        }
        return [...current, { key: "description", value: descriptionText }]
      }
      if ((current[descriptionIndex]?.value ?? "") === descriptionText) return current
      return current.map((item, index) =>
        index === descriptionIndex ? { ...item, value: descriptionText } : item
      )
    })
  }, [description, setAnnotations])

  return (
    <AdvancedToggleCard
      checked={checked}
      disabled={disabled}
      ariaLabel="添加元数据"
      title="添加元数据"
      description={titleText}
      onCheckedChange={(nextChecked) => {
        if (disabled) return
        if (nextChecked) {
          if (labels.length === 0) {
            setLabels([{ key: "", value: "" }])
          }
          if (annotations.length === 0) {
            const descriptionText = description.trim()
            setAnnotations(
              descriptionText
                ? [{ key: "description", value: descriptionText }]
                : [{ key: "", value: "" }]
            )
          }
        }
        if (!nextChecked) {
          const descriptionText = description.trim()
          setLabels([{ key: "", value: "" }])
          setAnnotations(
            descriptionText
              ? [{ key: "description", value: descriptionText }]
              : [{ key: "", value: "" }]
          )
        }
        onCheckedChange(nextChecked)
      }}
    >
      <div>
        <FieldLabel className="mb-2">标签</FieldLabel>
        <div className="space-y-3">
          {labels.map((entry, index) => (
            <div
              key={`label-${index}`}
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
                    setLabels((current) =>
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
                    setLabels((current) =>
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
                  setLabels((current) =>
                    current.length <= 1
                      ? [{ key: "", value: "" }]
                      : current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }}
                disabled={disabled}
                className="shrink-0"
                aria-label="删除标签"
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
              onClick={() => setLabels((current) => [...current, { key: "", value: "" }])}
              disabled={disabled}
            >
              添加
            </Button>
          </div>
        </div>
      </div>

      <div>
        <FieldLabel className="mb-2">注解</FieldLabel>
        <div className="space-y-3">
          {annotations.map((entry, index) => (
            <div
              key={`annotation-${index}`}
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
                    setAnnotations((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, key: nextValue } : item
                      )
                    )
                    if (isDescriptionAnnotationKey(nextValue)) {
                      setDescription(entry.value)
                    }
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
                    setAnnotations((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, value: nextValue } : item
                      )
                    )
                    if (isDescriptionAnnotationKey(entry.key)) {
                      setDescription(nextValue)
                    }
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
                  setAnnotations((current) =>
                    current.length <= 1
                      ? [{ key: "", value: "" }]
                      : current.filter((_, itemIndex) => itemIndex !== index)
                  )
                }}
                disabled={disabled}
                className="shrink-0"
                aria-label="删除注解"
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
              onClick={() => setAnnotations((current) => [...current, { key: "", value: "" }])}
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
