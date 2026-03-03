"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"

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
  value: string
  language?: string
  theme?: EditorProps["theme"]
  loading?: boolean
  error?: string | null
  className?: string
  editorOptions?: EditorProps["options"]
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
  value,
  language = "yaml",
  theme = "vs-dark",
  className,
  editorOptions,
}: MonacoViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[90vh] max-h-[90vh] sm:max-w-[90vw] flex flex-col",
          className
        )}
      >
        <DialogHeader>
          {title ? <DialogTitle>{title}</DialogTitle> : null}
        </DialogHeader>
        <DialogDescription asChild>
          <MonacoEditor
            language={language}
            theme={theme}
            value={value}
            options={{ ...defaultOptions, ...(editorOptions ?? {}) }}
          />
        </DialogDescription>
      </DialogContent>
    </Dialog>
  )
}
