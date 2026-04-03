"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import dynamic from "next/dynamic"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

const LOG_EDITOR_OPTIONS: EditorProps["options"] = {
  readOnly: true,
  minimap: { enabled: false },
  stickyScroll: { enabled: false },
  wordWrap: "on",
  scrollBeyondLastLine: false,
  lineNumbers: "off",
  glyphMargin: false,
  folding: false,
}

type LogViewerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  subtitle?: string
  realtime: boolean
  onRealtimeChange: (checked: boolean) => void
  loading?: boolean
  error?: string | null
  content: string
}

export function LogViewerDialog({
  open,
  onOpenChange,
  title,
  subtitle = "展示最近日志输出。",
  realtime,
  onRealtimeChange,
  loading = false,
  error = null,
  content,
}: LogViewerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-270">
        <div className="flex items-start justify-between border-b bg-muted/15">
          <DialogHeader className="px-6 py-4">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>
          <div className="h-full flex items-center me-20">
            <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
              <span className="text-sm font-medium">实时日志</span>
              <Switch
                checked={realtime}
                onCheckedChange={onRealtimeChange}
                aria-label="实时日志"
              />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-6">
          <div className="h-full overflow-hidden rounded-md border bg-black">
            {loading ? (
              <div className="p-4 text-sm text-zinc-300">日志加载中...</div>
            ) : error ? (
              <div className="p-4 text-sm text-red-400">{error}</div>
            ) : (
              <MonacoEditor
                language="plaintext"
                theme="vs-dark"
                value={content || "(无日志输出)"}
                height="100%"
                options={LOG_EDITOR_OPTIONS}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
