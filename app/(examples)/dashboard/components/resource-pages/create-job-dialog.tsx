"use client"

import * as React from "react"
import {
  IconAdjustments,
  IconBraces,
  IconDatabase,
  IconSettings2,
  IconStack2,
} from "@tabler/icons-react"

import { checkJobExists, type JobCreateKind } from "@/app/lib/kubespark/jobs"
import { StepHeaderNav } from "@/app/(examples)/dashboard/components/resource-pages/step-header-nav"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

type NamespaceOption = {
  id: string
  name: string
}

type CreateJobDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: JobCreateKind
  namespaceOptions: NamespaceOption[]
  onSubmit: (payload: {
    kind: JobCreateKind
    name: string
    namespace: string
    description: string
    strategy?: {
      backoffLimit?: number
      completions?: number
      parallelism?: number
      activeDeadlineSeconds?: number
    }
  }) => Promise<void>
}

type CreateStep = "basic" | "strategy" | "pod" | "storage" | "advanced"

const STEP_ORDER: CreateStep[] = ["basic", "strategy", "pod", "storage", "advanced"]

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"

function validateName(value: string): string | null {
  const next = value.trim().toLowerCase()
  if (!next) return "请输入名称"
  if (next.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(next)) {
    return NAME_RULE_MESSAGE
  }
  return null
}

function resolveSubmitErrorMessage(error: unknown, kind: JobCreateKind): string {
  const raw = error instanceof Error ? error.message : ""
  const text = raw.toLowerCase()
  if (text.includes("already exists") || text.includes("状态码 409")) {
    return kind === "CronJob" ? "定时任务名称已存在，请更换后重试" : "任务名称已存在，请更换后重试"
  }
  return raw || (kind === "CronJob" ? "创建定时任务失败，请稍后重试" : "创建任务失败，请稍后重试")
}

function resolveStepDescription(step: CreateStep): string {
  switch (step) {
    case "pod":
      return "容器组设置功能即将开放。"
    case "storage":
      return "存储设置功能即将开放。"
    case "advanced":
      return "高级设置功能即将开放。"
    default:
      return ""
  }
}

function normalizeIntegerInput(value: string): string {
  return value.replace(/\D+/g, "")
}

function toOptionalNonNegativeInt(value: string): number | undefined {
  const normalized = value.trim()
  if (!normalized) return undefined
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, parsed)
}

export function CreateJobDialog({
  open,
  onOpenChange,
  kind,
  namespaceOptions,
  onSubmit,
}: CreateJobDialogProps) {
  const [activeStep, setActiveStep] = React.useState<CreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [backoffLimit, setBackoffLimit] = React.useState("")
  const [completions, setCompletions] = React.useState("")
  const [parallelism, setParallelism] = React.useState("")
  const [activeDeadlineSeconds, setActiveDeadlineSeconds] = React.useState("")
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [creating, setCreating] = React.useState(false)

  const isBusy = checkingNext || creating
  const currentStepIndex = STEP_ORDER.indexOf(activeStep)
  const isBasicStep = activeStep === "basic"
  const isStrategyStep = activeStep === "strategy"
  const isFinalStep = activeStep === "advanced"

  const dialogTitle = kind === "CronJob" ? "创建定时任务" : "创建任务"
  const dialogDescription =
    kind === "CronJob"
      ? "使用 Kubernetes CronJob 创建按周期执行的任务。"
      : "使用 Kubernetes Job 创建一次性任务。"

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setName("")
      setNamespace("")
      setDescription("")
      setBackoffLimit("")
      setCompletions("")
      setParallelism("")
      setActiveDeadlineSeconds("")
      setNameError(null)
      setNamespaceError(null)
      setSubmitError(null)
      setCheckingNext(false)
      setCreating(false)
    }
  }, [open, kind])

  const goPrev = React.useCallback(() => {
    if (isBusy || isBasicStep) return
    const previousStep = STEP_ORDER[Math.max(0, currentStepIndex - 1)]
    setActiveStep(previousStep)
    setSubmitError(null)
  }, [currentStepIndex, isBasicStep, isBusy])

  const runBasicValidation = React.useCallback(async () => {
    const nextName = name.trim().toLowerCase()
    const nextNamespace = namespace.trim()
    const nextNameError = validateName(nextName)
    const nextNamespaceError = nextNamespace ? null : "请选择项目"
    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    if (nextNameError || nextNamespaceError) return false

    const exists = await checkJobExists({
      kind,
      name: nextName,
      namespace: nextNamespace,
    })
    if (exists) {
      setNameError(kind === "CronJob" ? "定时任务名称已存在，请更换后重试" : "任务名称已存在，请更换后重试")
      return false
    }

    return true
  }, [kind, name, namespace])

  const goNext = React.useCallback(async () => {
    if (isBusy || isFinalStep) return
    setSubmitError(null)

    if (isBasicStep) {
      setCheckingNext(true)
      try {
        const passed = await runBasicValidation()
        if (!passed) return
      } catch (error) {
        setNameError(error instanceof Error ? error.message : "名称校验失败")
        return
      } finally {
        setCheckingNext(false)
      }
    }

    const nextStep = STEP_ORDER[Math.min(STEP_ORDER.length - 1, currentStepIndex + 1)]
    setActiveStep(nextStep)
  }, [currentStepIndex, isBasicStep, isBusy, isFinalStep, runBasicValidation])

  const handleSubmit = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (isBusy || !isFinalStep) return

      setSubmitError(null)
      setCreating(true)
      try {
        const passed = await runBasicValidation()
        if (!passed) return

        const strategyDraft = {
          backoffLimit: toOptionalNonNegativeInt(backoffLimit),
          completions: toOptionalNonNegativeInt(completions),
          parallelism: toOptionalNonNegativeInt(parallelism),
          activeDeadlineSeconds: toOptionalNonNegativeInt(activeDeadlineSeconds),
        }
        const strategy =
          typeof strategyDraft.backoffLimit === "number" ||
          typeof strategyDraft.completions === "number" ||
          typeof strategyDraft.parallelism === "number" ||
          typeof strategyDraft.activeDeadlineSeconds === "number"
            ? strategyDraft
            : undefined

        await onSubmit({
          kind,
          name: name.trim().toLowerCase(),
          namespace: namespace.trim(),
          description: description.trim(),
          strategy,
        })

        onOpenChange(false)
      } catch (error) {
        setSubmitError(resolveSubmitErrorMessage(error, kind))
      } finally {
        setCreating(false)
      }
    },
    [
      activeDeadlineSeconds,
      backoffLimit,
      completions,
      description,
      isBusy,
      isFinalStep,
      kind,
      name,
      namespace,
      onOpenChange,
      onSubmit,
      parallelism,
      runBasicValidation,
    ]
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isBusy) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent
        className="flex max-h-[90vh] w-[min(90vw,130vh)] flex-col overflow-hidden p-0 sm:max-w-270"
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>

          <StepHeaderNav
            items={[
              {
                id: "basic",
                title: "基本信息",
                status: activeStep === "basic" ? "当前" : "已设置",
                active: activeStep === "basic",
                icon: <IconSettings2 className="size-4" />,
                disabled: isBusy,
                onClick: () => {
                  if (isBusy) return
                  setActiveStep("basic")
                  setSubmitError(null)
                },
              },
              {
                id: "strategy",
                title: "策略设置",
                status: activeStep === "strategy" ? "当前" : currentStepIndex > 1 ? "已设置" : "未设置",
                active: activeStep === "strategy",
                icon: <IconAdjustments className="size-4" />,
                disabled: isBusy,
                onClick: () => {
                  if (isBusy) return
                  if (currentStepIndex >= 1) {
                    setActiveStep("strategy")
                    setSubmitError(null)
                    return
                  }
                  void goNext()
                },
              },
              {
                id: "pod",
                title: "容器组设置",
                status: activeStep === "pod" ? "当前" : currentStepIndex > 2 ? "已设置" : "未设置",
                active: activeStep === "pod",
                icon: <IconBraces className="size-4" />,
                disabled: isBusy,
                onClick: () => {
                  if (isBusy || currentStepIndex < 1) return
                  setActiveStep("pod")
                  setSubmitError(null)
                },
              },
              {
                id: "storage",
                title: "存储设置",
                status: activeStep === "storage" ? "当前" : currentStepIndex > 3 ? "已设置" : "未设置",
                active: activeStep === "storage",
                icon: <IconDatabase className="size-4" />,
                disabled: isBusy,
                onClick: () => {
                  if (isBusy || currentStepIndex < 2) return
                  setActiveStep("storage")
                  setSubmitError(null)
                },
              },
              {
                id: "advanced",
                title: "高级设置",
                status: activeStep === "advanced" ? "当前" : "未设置",
                active: activeStep === "advanced",
                icon: <IconStack2 className="size-4" />,
                disabled: isBusy,
                onClick: () => {
                  if (isBusy || currentStepIndex < 3) return
                  setActiveStep("advanced")
                  setSubmitError(null)
                },
              },
            ]}
          />

          <div className="min-h-0 flex-1 px-6 py-6">
            {isBasicStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">基本信息</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    填写任务名称、所属项目以及描述信息。
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field data-invalid={Boolean(nameError)}>
                    <FieldLabel htmlFor="create-job-name">名称</FieldLabel>
                    <Input
                      id="create-job-name"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        if (nameError) setNameError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      placeholder={kind === "CronJob" ? "请输入定时任务名称" : "请输入任务名称"}
                      autoComplete="off"
                      aria-invalid={Boolean(nameError)}
                      disabled={isBusy}
                    />
                    {nameError ? (
                      <FieldError>{nameError}</FieldError>
                    ) : (
                      <FieldDescription>{NAME_RULE_MESSAGE}</FieldDescription>
                    )}
                  </Field>

                  <Field data-invalid={Boolean(namespaceError)}>
                    <FieldLabel htmlFor="create-job-namespace">项目</FieldLabel>
                    <Select
                      value={namespace}
                      onValueChange={(value) => {
                        setNamespace(value)
                        if (namespaceError) setNamespaceError(null)
                        if (submitError) setSubmitError(null)
                      }}
                      disabled={isBusy}
                    >
                      <SelectTrigger id="create-job-namespace" aria-invalid={Boolean(namespaceError)}>
                        <SelectValue placeholder="请选择项目" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {namespaceOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {namespaceError ? (
                      <FieldError>{namespaceError}</FieldError>
                    ) : (
                      <FieldDescription>选择任务所属项目。</FieldDescription>
                    )}
                  </Field>

                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="create-job-description">描述</FieldLabel>
                    <Textarea
                      id="create-job-description"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="请输入描述（选填）"
                      maxLength={256}
                      className="min-h-24"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      描述将写入资源注解 `description`，最长 256 个字符。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : isStrategyStep ? (
              <div>
                <div className="mb-4">
                  <h3 className="text-[15px] font-semibold">策略设置</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    配置任务重试、并发与超时策略。全部为选填，留空将使用默认值。
                  </p>
                </div>

                <FieldGroup className="grid gap-6 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="create-job-backoff-limit">最大重试次数</FieldLabel>
                    <Input
                      id="create-job-backoff-limit"
                      value={backoffLimit}
                      onChange={(event) => setBackoffLimit(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：6"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      失败前最多可重试的次数。留空时按系统默认策略处理。
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-completions">容器组完成数量</FieldLabel>
                    <Input
                      id="create-job-completions"
                      value={completions}
                      onChange={(event) => setCompletions(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：1"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      任务完成所需的成功执行次数。未填写则使用平台默认行为。
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-parallelism">并行容器组数量</FieldLabel>
                    <Input
                      id="create-job-parallelism"
                      value={parallelism}
                      onChange={(event) => setParallelism(normalizeIntegerInput(event.target.value))}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：1"
                      disabled={isBusy}
                    />
                    <FieldDescription>同一时刻允许并发运行的容器组数量。</FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="create-job-active-deadline">最大运行时间（s）</FieldLabel>
                    <Input
                      id="create-job-active-deadline"
                      value={activeDeadlineSeconds}
                      onChange={(event) =>
                        setActiveDeadlineSeconds(normalizeIntegerInput(event.target.value))
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="例如：3600"
                      disabled={isBusy}
                    />
                    <FieldDescription>
                      限制任务最长运行秒数，超时后任务会被系统终止。
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </div>
            ) : (
              <div>
                <div className="mb-3">
                  <h3 className="text-[15px] font-semibold">
                    {activeStep === "strategy"
                      ? "策略设置"
                      : activeStep === "pod"
                        ? "容器组设置"
                        : activeStep === "storage"
                          ? "存储设置"
                          : "高级设置"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{resolveStepDescription(activeStep)}</p>
                </div>
              </div>
            )}

            {submitError ? <FieldError className="mt-4">{submitError}</FieldError> : null}
          </div>

          {isBasicStep ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isBusy}>
                    取消
                  </Button>
                </DialogClose>
                <Button type="button" onClick={() => void goNext()} disabled={isBusy}>
                  {checkingNext ? "校验中..." : "下一步"}
                </Button>
              </div>
            </DialogFooter>
          ) : isFinalStep ? (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={isBusy}>
                  上一步
                </Button>
                <Button type="submit" disabled={isBusy}>
                  {creating ? "创建中..." : "创建"}
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
              <div className="flex w-full items-center justify-between gap-3">
                <Button type="button" variant="outline" onClick={goPrev} disabled={isBusy}>
                  上一步
                </Button>
                <Button type="button" onClick={() => void goNext()} disabled={isBusy}>
                  下一步
                </Button>
              </div>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
