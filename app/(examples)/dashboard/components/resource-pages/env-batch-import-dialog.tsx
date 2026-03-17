"use client"

import * as React from "react"
import {
  fetchConfigMapEntries,
  type ConfigMapEntry,
  type ConfigMapKeyRefOption,
} from "@/app/lib/kubespark/configmaps"
import {
  fetchSecretEntries,
  type SecretEntry,
  type SecretKeyRefOption,
} from "@/app/lib/kubespark/secrets"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

type BatchSource = "configMap" | "secret"

type BatchEntry = ConfigMapEntry | SecretEntry

export type EnvBatchImportItem = {
  source: BatchSource
  sourceResource: string
  sourceKey: string
  name: string
}

type EnvBatchImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespace: string
  configMapOptions: ConfigMapKeyRefOption[]
  secretOptions: SecretKeyRefOption[]
  isBusy?: boolean
  onImport: (items: EnvBatchImportItem[]) => void
}

export function EnvBatchImportDialog({
  open,
  onOpenChange,
  namespace,
  configMapOptions,
  secretOptions,
  isBusy = false,
  onImport,
}: EnvBatchImportDialogProps) {
  const [source, setSource] = React.useState<BatchSource>("configMap")
  const [resourceName, setResourceName] = React.useState("")
  const [rows, setRows] = React.useState<BatchEntry[]>([])
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const sourceOptions = source === "configMap" ? configMapOptions : secretOptions
  const selectedKeySet = React.useMemo(() => new Set(selectedKeys), [selectedKeys])
  const selectedCount = selectedKeys.length
  const allChecked = rows.length > 0 && selectedCount === rows.length
  const someChecked = selectedCount > 0 && selectedCount < rows.length
  const disabled = isBusy || loading

  React.useEffect(() => {
    if (!open) return

    if (configMapOptions.length > 0) {
      setSource("configMap")
      setResourceName(configMapOptions[0].name)
      return
    }
    if (secretOptions.length > 0) {
      setSource("secret")
      setResourceName(secretOptions[0].name)
      return
    }
    setSource("configMap")
    setResourceName("")
  }, [configMapOptions, open, secretOptions])

  React.useEffect(() => {
    if (!open) return
    setSelectedKeys([])
    setError(null)

    if (sourceOptions.length === 0) {
      setResourceName("")
      setRows([])
      return
    }

    const exists = sourceOptions.some((item) => item.name === resourceName)
    if (!exists) {
      setResourceName(sourceOptions[0].name)
    }
  }, [open, resourceName, sourceOptions])

  React.useEffect(() => {
    if (!open) return
    if (!namespace.trim() || !resourceName.trim()) {
      setRows([])
      setSelectedKeys([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const fetcher =
      source === "configMap"
        ? fetchConfigMapEntries(namespace, resourceName)
        : fetchSecretEntries(namespace, resourceName)

    void fetcher
      .then((entries) => {
        if (cancelled) return
        setRows(entries)
        setSelectedKeys((current) => current.filter((key) => entries.some((entry) => entry.key === key)))
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return
        setRows([])
        setSelectedKeys([])
        setError(fetchError instanceof Error ? fetchError.message : "加载资源键值失败")
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [namespace, open, resourceName, source])

  const toggleKey = React.useCallback((key: string, checked: boolean) => {
    setSelectedKeys((current) => {
      if (checked) {
        if (current.includes(key)) return current
        return [...current, key]
      }
      return current.filter((item) => item !== key)
    })
  }, [])

  const handleImport = React.useCallback(() => {
    if (!resourceName.trim() || selectedKeys.length === 0) return

    const items: EnvBatchImportItem[] = rows
      .filter((entry) => selectedKeySet.has(entry.key))
      .map((entry) => ({
        source,
        sourceResource: resourceName,
        sourceKey: entry.key,
        name: entry.key,
      }))

    if (items.length === 0) return
    onImport(items)
    onOpenChange(false)
  }, [onImport, onOpenChange, resourceName, rows, selectedKeySet, selectedKeys.length, source])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="!bg-transparent !backdrop-blur-none"
        className="flex h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
      >
        <DialogHeader className="border-b bg-muted/15 px-6 py-4">
          <DialogTitle>批量添加环境变量</DialogTitle>
          <DialogDescription>
            选择资源与键后批量回填到容器环境变量。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <Tabs
            value={source}
            onValueChange={(value) => {
              if (value === "configMap" || value === "secret") {
                setSource(value)
              }
            }}
            className="w-fit"
          >
            <TabsList>
              <TabsTrigger value="configMap">配置字典</TabsTrigger>
              <TabsTrigger value="secret">保密字典</TabsTrigger>
            </TabsList>
          </Tabs>

          <Select
            value={resourceName}
            onValueChange={setResourceName}
            disabled={disabled || sourceOptions.length === 0}
          >
            <SelectTrigger className="h-9 w-72">
              <SelectValue
                placeholder={source === "configMap" ? "选择配置字典" : "选择保密字典"}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sourceOptions.length > 0 ? (
                  sourceOptions.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__empty__" disabled>
                    {source === "configMap" ? "当前项目暂无配置字典" : "当前项目暂无保密字典"}
                  </SelectItem>
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-6 pb-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead className="w-14">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={(checked) => {
                        const nextChecked = checked === true
                        setSelectedKeys(nextChecked ? rows.map((entry) => entry.key) : [])
                      }}
                      disabled={disabled || rows.length === 0}
                      aria-label="全选"
                    />
                  </TableHead>
                  <TableHead>键</TableHead>
                  <TableHead>值</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : rows.length > 0 ? (
                  rows.map((entry) => {
                    const checked = selectedKeySet.has(entry.key)
                    return (
                      <TableRow
                        key={entry.key}
                        className="cursor-pointer hover:bg-accent/50"
                        onClick={() => toggleKey(entry.key, !checked)}
                      >
                        <TableCell>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(nextChecked) => toggleKey(entry.key, nextChecked === true)}
                            onClick={(event) => event.stopPropagation()}
                            disabled={disabled}
                            aria-label={`选择键 ${entry.key}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{entry.key}</TableCell>
                        <TableCell>
                          <div className="max-w-[560px] truncate text-muted-foreground">
                            {entry.value || "-"}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                      {resourceName ? "该资源暂无可导入键值" : "请先选择资源"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              共 {rows.length} 项，已选择 {selectedCount} 项
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={disabled}>
                取消
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={disabled || !resourceName || selectedCount === 0}
              >
                确认添加
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
