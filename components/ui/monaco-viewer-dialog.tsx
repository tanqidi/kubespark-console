"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
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
  className,
  editorOptions,
}: MonacoViewerDialogProps) {
  const resolvedTitle = title?.trim() || "Resource details"
  const resolvedSubtitle = React.useMemo(() => {
    const custom = subtitle?.trim()
    if (custom) return custom
    return deriveYamlSubtitle(value)
  }, [subtitle, value])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex flex-col sm:max-w-270",
          className
        )}
      >
        <DialogHeader>
          <DialogTitle className={title ? undefined : "sr-only"}>
            {resolvedTitle}
          </DialogTitle>
          {resolvedSubtitle ? <DialogDescription>{resolvedSubtitle}</DialogDescription> : null}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden">
          <MonacoEditor
            language={language}
            theme={theme}
            value={value}
            height="100%"
            options={{ ...defaultOptions, ...(editorOptions ?? {}) }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
