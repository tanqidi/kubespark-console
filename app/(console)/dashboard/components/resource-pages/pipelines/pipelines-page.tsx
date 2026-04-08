"use client"

import * as React from "react"
import type { EditorProps } from "@monaco-editor/react"
import { IconSettings2 } from "@tabler/icons-react"
import dynamic from "next/dynamic"
import { parse, stringify } from "yaml"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import { StepHeaderNav } from "@/app/(console)/dashboard/components/resource-pages/step-header-nav"
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
})

const MONACO_OPTIONS: EditorProps["options"] = {
  automaticLayout: true,
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  stickyScroll: { enabled: false },
  tabSize: 2,
  wordWrap: "on",
}

type PipelineRow = {
  id: string
  name: string
  repository: string
  branch: string
  status: string
  updatedAt: string
}

type PipelineDialogStep = "basic" | "advanced"

const PIPELINE_NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字和连字符（-），必须以小写字母开头并以小写字母或数字结尾，最长 63 个字符。"

const pipelineColumns: ColumnConfig<PipelineRow>[] = [
  {
    key: "name",
    label: "名称",
    enableHiding: false,
    cell: (_value, row) => renderNameDescriptionCell(row.name, row.repository),
  },
  { key: "branch", label: "分支" },
  { key: "status", label: "状态", render: "badge" },
  { key: "updatedAt", label: "更新时间" },
]

function validatePipelineName(name: string): string | null {
  if (!name) return "请输入流水线名称"
  if (name.length > 63) return PIPELINE_NAME_RULE_MESSAGE
  if (!/^[a-z](?:[-a-z0-9]*[a-z0-9])?$/.test(name)) return PIPELINE_NAME_RULE_MESSAGE
  return null
}

function validateGitUrl(url: string): string | null {
  if (!url.trim()) return "请输入 Git 地址"
  return null
}

function buildPipelineYamlText(params: {
  name: string
  description: string
  gitUrl: string
  branch: string
  gitUsername: string
  gitPassword: string
}): string {
  const annotations: Record<string, string> = {}
  if (params.description.trim()) annotations.description = params.description.trim()

  return stringify(
    {
      apiVersion: "devops.kubespark.io/v1alpha1",
      kind: "Pipeline",
      metadata: {
        ...(params.name.trim() ? { name: params.name.trim() } : {}),
        ...(Object.keys(annotations).length > 0 ? { annotations } : {}),
      },
      spec: {
        source: {
          url: params.gitUrl.trim(),
          branch: params.branch.trim() || "main",
          auth: {
            username: params.gitUsername.trim(),
            password: params.gitPassword,
          },
        },
      },
    },
    {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }
  )
}

function parsePipelineYamlText(yamlText: string): {
  name: string
  description: string
  gitUrl: string
  branch: string
  gitUsername: string
  gitPassword: string
} {
  const normalized = yamlText.trim()
  if (!normalized) throw new Error("请输入 YAML 内容")

  const parsed = parse(normalized)
  const root =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  if (!root) throw new Error("YAML 内容格式无效")

  const kind = typeof root.kind === "string" ? root.kind.trim() : ""
  if (kind && kind !== "Pipeline") throw new Error("YAML 资源类型必须是 Pipeline")

  const metadata =
    typeof root.metadata === "object" && root.metadata !== null && !Array.isArray(root.metadata)
      ? (root.metadata as Record<string, unknown>)
      : {}
  const annotations =
    typeof metadata.annotations === "object" &&
    metadata.annotations !== null &&
    !Array.isArray(metadata.annotations)
      ? (metadata.annotations as Record<string, unknown>)
      : {}
  const spec =
    typeof root.spec === "object" && root.spec !== null && !Array.isArray(root.spec)
      ? (root.spec as Record<string, unknown>)
      : {}
  const source =
    typeof spec.source === "object" && spec.source !== null && !Array.isArray(spec.source)
      ? (spec.source as Record<string, unknown>)
      : {}
  const auth =
    typeof source.auth === "object" && source.auth !== null && !Array.isArray(source.auth)
      ? (source.auth as Record<string, unknown>)
      : {}

  return {
    name: typeof metadata.name === "string" ? metadata.name : "",
    description: typeof annotations.description === "string" ? annotations.description : "",
    gitUrl: typeof source.url === "string" ? source.url : "",
    branch: typeof source.branch === "string" ? source.branch : "main",
    gitUsername: typeof auth.username === "string" ? auth.username : "",
    gitPassword: typeof auth.password === "string" ? auth.password : "",
  }
}

export function PipelinesPageClient() {
  const [rows, setRows] = React.useState<PipelineRow[]>([])
  const [nameQuery, setNameQuery] = React.useState("")

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [createStep, setCreateStep] = React.useState<PipelineDialogStep>("basic")
  const [creating, setCreating] = React.useState(false)

  const [pipelineName, setPipelineName] = React.useState("")
  const [pipelineDescription, setPipelineDescription] = React.useState("")
  const [gitUrl, setGitUrl] = React.useState("")
  const [gitUsername, setGitUsername] = React.useState("")
  const [gitPassword, setGitPassword] = React.useState("")
  const [branch, setBranch] = React.useState("main")

  const [createNameInvalid, setCreateNameInvalid] = React.useState(false)
  const [createNameError, setCreateNameError] = React.useState<string | null>(null)
  const [createGitUrlError, setCreateGitUrlError] = React.useState<string | null>(null)
  const [createYamlMode, setCreateYamlMode] = React.useState(false)
  const [createYamlText, setCreateYamlText] = React.useState("")
  const [createYamlError, setCreateYamlError] = React.useState<string | null>(null)

  const resetCreateState = React.useCallback(() => {
    setPipelineName("")
    setPipelineDescription("")
    setGitUrl("")
    setGitUsername("")
    setGitPassword("")
    setBranch("main")
    setCreateNameInvalid(false)
    setCreateNameError(null)
    setCreateGitUrlError(null)
    setCreateYamlMode(false)
    setCreateYamlText("")
    setCreateYamlError(null)
    setCreateStep("basic")
  }, [])

  const columns = React.useMemo(
    () =>
      createColumns<PipelineRow>({
        columns: pipelineColumns,
      }),
    []
  )

  const handleCreateSubmit = React.useCallback(() => {
    if (creating) return

    let nextName = pipelineName.trim()
    let nextDescription = pipelineDescription.trim()
    let nextGitUrl = gitUrl.trim()
    let nextGitUsername = gitUsername.trim()
    let nextGitPassword = gitPassword
    let nextBranch = branch.trim() || "main"

    if (createYamlMode) {
      try {
        const parsed = parsePipelineYamlText(createYamlText)
        nextName = parsed.name.trim()
        nextDescription = parsed.description.trim()
        nextGitUrl = parsed.gitUrl.trim()
        nextGitUsername = parsed.gitUsername.trim()
        nextGitPassword = parsed.gitPassword
        nextBranch = parsed.branch.trim() || "main"

        setPipelineName(nextName)
        setPipelineDescription(nextDescription)
        setGitUrl(nextGitUrl)
        setGitUsername(nextGitUsername)
        setGitPassword(nextGitPassword)
        setBranch(nextBranch)
        setCreateYamlError(null)
      } catch (error) {
        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
        return
      }
    }

    const nameError = validatePipelineName(nextName)
    const gitAddressError = validateGitUrl(nextGitUrl)

    setCreateNameInvalid(Boolean(nameError))
    setCreateNameError(nameError)
    setCreateGitUrlError(gitAddressError)

    if (nameError || gitAddressError) {
      if (createYamlMode) setCreateYamlError(nameError ?? gitAddressError)
      return
    }

    setCreating(true)

    const now = new Date()
    const timestamp = now.toISOString().replace("T", " ").slice(0, 19)
    const row: PipelineRow = {
      id: `pipeline-${Date.now()}`,
      name: nextName,
      repository: nextGitUrl,
      branch: nextBranch,
      status: "未执行",
      updatedAt: timestamp,
    }
    setRows((prev) => [row, ...prev])

    setCreateDialogOpen(false)
    resetCreateState()
    setCreating(false)
  }, [
    branch,
    createYamlMode,
    createYamlText,
    creating,
    gitPassword,
    gitUrl,
    gitUsername,
    pipelineDescription,
    pipelineName,
    resetCreateState,
  ])

  const query = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (!query) return true
    return row.name.toLowerCase().includes(query)
  })

  return (
    <>
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open && creating) return
          setCreateDialogOpen(open)
          if (!open) resetCreateState()
        }}
      >
        <DialogContent
          className="flex h-[90vh] min-h-[90vh] max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-start justify-between border-b bg-muted/15">
              <DialogHeader className="px-6 py-4">
                <DialogTitle>创建流水线</DialogTitle>
                <DialogDescription>创建流水线并配置 Git 仓库拉取信息。</DialogDescription>
              </DialogHeader>
              <div className="me-20 flex h-full items-center">
                <div className="flex items-center gap-3 rounded-full border bg-background px-4 py-2">
                  <span className="text-sm font-medium">编辑 YAML</span>
                  <Switch
                    checked={createYamlMode}
                    onCheckedChange={(checked) => {
                      if (creating) return
                      if (checked) {
                        setCreateYamlText(
                          buildPipelineYamlText({
                            name: pipelineName,
                            description: pipelineDescription,
                            gitUrl,
                            branch,
                            gitUsername,
                            gitPassword,
                          })
                        )
                        setCreateYamlError(null)
                        setCreateYamlMode(true)
                        return
                      }

                      try {
                        const parsed = parsePipelineYamlText(createYamlText)
                        setPipelineName(parsed.name)
                        setPipelineDescription(parsed.description)
                        setGitUrl(parsed.gitUrl)
                        setGitUsername(parsed.gitUsername)
                        setGitPassword(parsed.gitPassword)
                        setBranch(parsed.branch)
                        setCreateYamlError(null)
                        setCreateYamlMode(false)
                      } catch (error) {
                        setCreateYamlError(error instanceof Error ? error.message : "YAML 解析失败")
                      }
                    }}
                    disabled={creating}
                    aria-label="编辑 YAML"
                  />
                </div>
              </div>
            </div>

            {!createYamlMode ? (
              <StepHeaderNav
                items={[
                  {
                    id: "basic",
                    title: "基本信息",
                    status: createStep === "basic" ? "当前" : "已设置",
                    active: createStep === "basic",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => {
                      if (creating) return
                      setCreateStep("basic")
                    },
                  },
                  {
                    id: "advanced",
                    title: "高级设置",
                    status: createStep === "advanced" ? "当前" : branch.trim() ? "已设置" : "未设置",
                    active: createStep === "advanced",
                    icon: <IconSettings2 className="size-4" />,
                    disabled: creating,
                    onClick: () => {
                      if (creating) return
                      setCreateStep("advanced")
                    },
                  },
                ]}
              />
            ) : null}

            <div className={createYamlMode ? "min-h-0 flex-1 p-6" : "min-h-0 flex-1 overflow-y-auto"}>
              {createYamlMode ? (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border">
                    <MonacoEditor
                      language="yaml"
                      theme="vs-dark"
                      value={createYamlText}
                      onChange={(value) => {
                        setCreateYamlText(value ?? "")
                        if (createYamlError) setCreateYamlError(null)
                        if (createNameInvalid) setCreateNameInvalid(false)
                        if (createNameError) setCreateNameError(null)
                        if (createGitUrlError) setCreateGitUrlError(null)
                      }}
                      options={MONACO_OPTIONS}
                      height="100%"
                    />
                  </div>
                  {createYamlError ? <FieldError className="mt-3">{createYamlError}</FieldError> : null}
                </div>
              ) : createStep === "basic" ? (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">基本信息</h3>
                    <p className="mt-1 text-sm text-muted-foreground">填写流水线名称和 Git 仓库信息。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field data-invalid={createNameInvalid}>
                      <FieldLabel htmlFor="pipeline-create-name">名称</FieldLabel>
                      <Input
                        id="pipeline-create-name"
                        value={pipelineName}
                        onChange={(event) => {
                          setPipelineName(event.target.value)
                          if (createNameInvalid) setCreateNameInvalid(false)
                          if (createNameError) setCreateNameError(null)
                        }}
                        placeholder="请输入流水线名称"
                        autoComplete="off"
                        aria-invalid={createNameInvalid}
                        disabled={creating}
                      />
                      {createNameError ? (
                        <FieldError>{createNameError}</FieldError>
                      ) : (
                        <FieldDescription>{PIPELINE_NAME_RULE_MESSAGE}</FieldDescription>
                      )}
                    </Field>

                    <Field data-invalid={Boolean(createGitUrlError)}>
                      <FieldLabel htmlFor="pipeline-create-git-url">Git 地址</FieldLabel>
                      <Input
                        id="pipeline-create-git-url"
                        value={gitUrl}
                        onChange={(event) => {
                          setGitUrl(event.target.value)
                          if (createGitUrlError) setCreateGitUrlError(null)
                        }}
                        placeholder="https://github.com/org/repo.git"
                        autoComplete="off"
                        aria-invalid={Boolean(createGitUrlError)}
                        disabled={creating}
                      />
                      {createGitUrlError ? <FieldError>{createGitUrlError}</FieldError> : null}
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="pipeline-create-username">账号</FieldLabel>
                      <Input
                        id="pipeline-create-username"
                        value={gitUsername}
                        onChange={(event) => setGitUsername(event.target.value)}
                        placeholder="请输入 Git 账号"
                        autoComplete="off"
                        disabled={creating}
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="pipeline-create-password">密码 / Token</FieldLabel>
                      <Input
                        id="pipeline-create-password"
                        type="password"
                        value={gitPassword}
                        onChange={(event) => setGitPassword(event.target.value)}
                        placeholder="请输入密码或 Token"
                        autoComplete="off"
                        disabled={creating}
                      />
                    </Field>
                  </FieldGroup>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-[15px] font-semibold">高级设置</h3>
                    <p className="mt-1 text-sm text-muted-foreground">补充默认分支与描述信息。</p>
                  </div>
                  <FieldGroup className="flex flex-col gap-4">
                    <Field>
                      <FieldLabel htmlFor="pipeline-create-branch">分支</FieldLabel>
                      <Input
                        id="pipeline-create-branch"
                        value={branch}
                        onChange={(event) => setBranch(event.target.value)}
                        placeholder="main"
                        autoComplete="off"
                        disabled={creating}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="pipeline-create-description">描述</FieldLabel>
                      <Textarea
                        id="pipeline-create-description"
                        value={pipelineDescription}
                        onChange={(event) => setPipelineDescription(event.target.value)}
                        placeholder="请输入描述"
                        maxLength={256}
                        className="min-h-28"
                        disabled={creating}
                      />
                      <FieldDescription>描述仅用于界面展示，最长 256 个字符。</FieldDescription>
                    </Field>
                  </FieldGroup>
                </div>
              )}
            </div>

            <DialogFooter className="border-t bg-background px-6 py-5">
              {createYamlMode ? (
                <>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" onClick={handleCreateSubmit} disabled={creating}>
                    {creating ? "创建中..." : "创建"}
                  </Button>
                </>
              ) : createStep === "basic" ? (
                <>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={creating}>
                      取消
                    </Button>
                  </DialogClose>
                  <Button type="button" disabled={creating} onClick={() => setCreateStep("advanced")}>
                    下一步
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" disabled={creating} onClick={() => setCreateStep("basic")}>
                    上一步
                  </Button>
                  <Button type="button" onClick={handleCreateSubmit} disabled={creating}>
                    {creating ? "创建中..." : "创建"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => {
          resetCreateState()
          setCreateDialogOpen(true)
        }}
        toolbarEnd={
          <Input
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="名称"
            className="h-9 w-40"
          />
        }
      />
    </>
  )
}
