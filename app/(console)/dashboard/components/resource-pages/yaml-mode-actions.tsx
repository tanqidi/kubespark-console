"use client"

import * as React from "react"
import { IconDownload, IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

type YamlModeActionsProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  showFileActions?: boolean
  onUploadYamlText?: (content: string, fileName: string) => void
  onDownloadYaml?: () => void
  uploadDisabled?: boolean
  downloadDisabled?: boolean
}

export function YamlModeActions({
  checked,
  onCheckedChange,
  disabled = false,
  showFileActions = true,
  onUploadYamlText,
  onDownloadYaml,
  uploadDisabled = false,
  downloadDisabled = false,
}: YamlModeActionsProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const handleTriggerUpload = React.useCallback(() => {
    if (disabled || uploadDisabled) return
    fileInputRef.current?.click()
  }, [disabled, uploadDisabled])

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const target = event.currentTarget
      const file = target.files?.[0]
      if (!file || !onUploadYamlText) {
        target.value = ""
        return
      }

      try {
        const content = await file.text()
        onUploadYamlText(content, file.name)
      } finally {
        target.value = ""
      }
    },
    [onUploadYamlText]
  )

  return (
    <div className="flex items-center gap-3">
      {checked && showFileActions ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleTriggerUpload}
            disabled={disabled || uploadDisabled}
            aria-label="上传 YAML"
            title="上传 YAML"
          >
            <IconUpload />
            <span className="sr-only">上传 YAML</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onDownloadYaml}
            disabled={disabled || downloadDisabled}
            aria-label="下载 YAML"
            title="下载 YAML"
          >
            <IconDownload />
            <span className="sr-only">下载 YAML</span>
          </Button>
        </>
      ) : null}

      <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
        <span className="text-sm font-medium">编辑 YAML</span>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label="编辑 YAML"
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".yaml,.yml,text/yaml,text/x-yaml,text/plain"
        className="hidden"
        onChange={(event) => {
          void handleFileChange(event)
        }}
        disabled={disabled || uploadDisabled}
      />
    </div>
  )
}
