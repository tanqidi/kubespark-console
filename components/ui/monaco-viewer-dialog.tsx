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
  loading?: boolean
  error?: string | null
  className?: string
  editorOptions?: EditorProps["options"]
}

const defaultOptions: EditorProps["options"] = {
  automaticLayout: true,
  fontSize: 13,
  minimap: { enabled: false },
  readOnly: true,
  scrollBeyondLastLine: false,
  wordWrap: "on",
}

export function MonacoViewerDialog({
  open,
  onOpenChange,
  title = "\u67e5\u770b YAML",
  value,
  language = "yaml",
  loading = false,
  error = null,
  className,
  editorOptions,
}: MonacoViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "h-[80vh] max-h-[80vh] w-[80vw] max-w-[80vw] sm:max-w-[80vw] gap-0 p-0 flex flex-col overflow-hidden",
          className
        )}
      >
        <DialogHeader className="h-full gap-0 p-0 text-left">
          <DialogTitle className="border-b px-6 py-4">{title}</DialogTitle>
          <DialogDescription asChild className="m-0 flex-1">
            <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg">
              {loading ? (
                <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                  {"\u6b63\u5728\u52a0\u8f7d..."}
                </div>
              ) : error ? (
                <div className="text-destructive flex h-full items-center justify-center px-6 text-sm">
                  {error}
                </div>
              ) : (
                <MonacoEditor
                  height="100%"
                  language={language}
                  value={value}
                  options={{ ...defaultOptions, ...(editorOptions ?? {}) }}
                />
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
