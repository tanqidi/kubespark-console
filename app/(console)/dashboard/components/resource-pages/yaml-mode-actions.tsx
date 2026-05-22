"use client"

import * as React from "react"
import { IconDownload, IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useTranslations } from "@/app/lib/i18n"

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
  const t = useTranslations()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const switchId = React.useId()

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
            className="rounded-full"
            onClick={handleTriggerUpload}
            disabled={disabled || uploadDisabled}
            aria-label={t("common.uploadYaml")}
            title={t("common.uploadYaml")}
          >
            <IconUpload />
            <span className="sr-only">{t("common.uploadYaml")}</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="rounded-full"
            onClick={onDownloadYaml}
            disabled={disabled || downloadDisabled}
            aria-label={t("common.downloadYaml")}
            title={t("common.downloadYaml")}
          >
            <IconDownload />
            <span className="sr-only">{t("common.downloadYaml")}</span>
          </Button>
        </>
      ) : null}

      <div className="flex items-center space-x-2 rounded-full border bg-background px-4 py-2">
        <Switch
          id={switchId}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={t("common.editYaml")}
        />
        <Label htmlFor={switchId}>{t("common.editYaml")}</Label>
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
