"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconArrowsMaximize, IconArrowsMinimize, IconDownload } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse } from "yaml"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

type MonacoViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  subtitle?: string
  value: string
  language?: string
  theme?: EditorProps["theme"]
  loading?: boolean
  error?: string | null
  downloadFileName?: string
  className?: string
  editorOptions?: EditorProps["options"]
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function deriveYamlSubtitle(yamlText: string): string {
  const text = yamlText.trim()
  if (!text) return ""

  try {
    const root = asObject(parse(text))
    const kind = asString(root.kind).trim()
    const metadata = asObject(root.metadata)
    const name = asString(metadata.name).trim()
    const namespace = asString(metadata.namespace).trim()

    const resourceLabel = kind ? `Kubernetes ${kind}` : "Kubernetes 资源"
    if (namespace && name) return `查看 ${resourceLabel}（${namespace}/${name}）的 YAML 内容。`
    if (name) return `查看 ${resourceLabel}（${name}）的 YAML 内容。`
    return `查看 ${resourceLabel} 的 YAML 内容。`
  } catch {
    return "查看当前资源的 YAML 内容。"
  }
}

function deriveYamlDownloadFileName(yamlText: string): string {
  const text = yamlText.trim()
  if (!text) return "resource.yaml"

  try {
    const root = asObject(parse(text))
    const metadata = asObject(root.metadata)
    const name = asString(metadata.name).trim()
    if (!name) return "resource.yaml"

    const safe = name.replace(/[\\/:*?"<>|]/g, "_")
    return `${safe || "resource"}.yaml`
  } catch {
    return "resource.yaml"
  }
}

const defaultOptions: EditorProps["options"] = {
  // automaticLayout: true,
  // fontSize: 13,
  // minimap: { enabled: false },
  // readOnly: true,
  // scrollBeyondLastLine: false,
  stickyScroll: { enabled: false },
  // wordWrap: "on",
}

export function MonacoViewerDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  value,
  language = "yaml",
  theme = "vs-dark",
  error = null,
  downloadFileName,
  className,
  editorOptions,
}: MonacoViewerDialogProps) {
  const [fullscreen, setFullscreen] = React.useState(false)
  const resolvedTitle = title?.trim() || "Resource details"
  const resolvedSubtitle = React.useMemo(() => {
    const custom = subtitle?.trim()
    if (custom) return custom
    return deriveYamlSubtitle(value)
  }, [subtitle, value])

  React.useEffect(() => {
    if (!open) setFullscreen(false)
  }, [open])

  const canDownload = value.trim().length > 0

  const handleDownload = React.useCallback(() => {
    if (!canDownload) return
    const inferredName = deriveYamlDownloadFileName(value)
    const preferredName = downloadFileName?.trim() || inferredName
    const safeName = preferredName.replace(/[\\/:*?"<>|]/g, "_") || "resource.yaml"
    const finalName = safeName.endsWith(".yaml") || safeName.endsWith(".yml")
      ? safeName
      : `${safeName}.yaml`

    const blob = new Blob([value], { type: "text/yaml;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = finalName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [canDownload, downloadFileName, value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="!animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none"
        className={cn(
          fullscreen
            ? "flex h-screen min-h-screen max-h-screen w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 !animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none data-[state=closed]:!zoom-out-100 data-[state=open]:!zoom-in-100 sm:max-w-none"
            : "flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[90vw] max-w-[1280px] flex-col gap-0 overflow-hidden p-0 !animate-none !transition-none !duration-0 data-[state=closed]:!animate-none data-[state=open]:!animate-none data-[state=closed]:!zoom-out-100 data-[state=open]:!zoom-in-100 sm:max-w-[1280px]",
          className
        )}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="flex items-start justify-between border-b bg-muted/15">
          <DialogHeader className="px-6 py-4">
            <DialogTitle className={title ? undefined : "sr-only"}>
              {resolvedTitle}
            </DialogTitle>
            {resolvedSubtitle ? <DialogDescription>{resolvedSubtitle}</DialogDescription> : null}
          </DialogHeader>
          <div className="h-full flex items-center gap-3 me-20">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={handleDownload}
              disabled={!canDownload}
              aria-label="下载YAML"
              title="下载YAML"
            >
              <IconDownload />
              <span className="sr-only">下载YAML</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={`rounded-full transition-colors ${
                fullscreen ? "border-black bg-black text-white hover:bg-black hover:text-white" : ""
              }`}
              onClick={() => setFullscreen((prev) => !prev)}
              aria-label={fullscreen ? "退出全屏" : "全屏"}
              title={fullscreen ? "退出全屏" : "全屏"}
            >
              {fullscreen ? <IconArrowsMinimize /> : <IconArrowsMaximize />}
              <span className="sr-only">{fullscreen ? "退出全屏" : "全屏"}</span>
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <div className="relative h-full overflow-hidden rounded-lg border border-slate-700/60 bg-[#1e1e1e] shadow-inner">
            <MonacoEditor
              language={language}
              theme={theme}
              value={value}
              height="100%"
              loading={null}
              options={{ ...defaultOptions, ...(editorOptions ?? {}) }}
            />
            {error ? (
              <div className="absolute inset-0 bg-[#1e1e1e] p-4 text-sm text-red-400">{error}</div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
