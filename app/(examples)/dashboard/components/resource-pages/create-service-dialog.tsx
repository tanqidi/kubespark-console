"use client"

import * as React from "react"
import {
  IconAdjustments,
  IconAdjustmentsHorizontal,
  IconSettings2,
} from "@tabler/icons-react"

import { checkServiceExists } from "@/app/lib/kubespark/resource-create"
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

type ServiceCreateStep = "basic" | "service" | "advanced"

type CreateServiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  namespaceOptions: NamespaceOption[]
}

const NAME_RULE_MESSAGE =
  "名称只能包含小写字母、数字、短横线（-）和点（.），必须以字母或数字开头和结尾，最长 253 个字符。"

function validateName(value: string): string | null {
  if (!value) return "请输入名称"
  if (value.length > 253) return NAME_RULE_MESSAGE
  if (!/^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$/.test(value)) {
    return NAME_RULE_MESSAGE
  }
  return null
}

export function CreateServiceDialog({
  open,
  onOpenChange,
  namespaceOptions,
}: CreateServiceDialogProps) {
  const [activeStep, setActiveStep] = React.useState<ServiceCreateStep>("basic")
  const [name, setName] = React.useState("")
  const [namespace, setNamespace] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [namespaceError, setNamespaceError] = React.useState<string | null>(null)
  const [stepError, setStepError] = React.useState<string | null>(null)
  const [checkingNext, setCheckingNext] = React.useState(false)
  const [basicCompleted, setBasicCompleted] = React.useState(false)
  const [serviceCompleted, setServiceCompleted] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setActiveStep("basic")
      setName("")
      setNamespace("")
      setDescription("")
      setNameError(null)
      setNamespaceError(null)
      setStepError(null)
      setCheckingNext(false)
      setBasicCompleted(false)
      setServiceCompleted(false)
    }
  }, [open])

  const handleBasicNext = React.useCallback(async () => {
    if (checkingNext) return

    const normalizedName = name.trim().toLowerCase()
    const normalizedNamespace = namespace.trim()
    const nextNameError = validateName(normalizedName)
    const nextNamespaceError = normalizedNamespace ? null : "请选择项目"

    setNameError(nextNameError)
    setNamespaceError(nextNamespaceError)
    setStepError(null)

    if (nextNameError || nextNamespaceError) return

    setCheckingNext(true)
    try {
      const exists = await checkServiceExists({
        name: normalizedName,
        namespace: normalizedNamespace,
      })
      if (exists) {
        setNameError("服务名称已存在，请更换后重试")
        return
      }

      setBasicCompleted(true)
      setActiveStep("service")
    } catch (error) {
      setStepError(error instanceof Error ? error.message : "服务名称校验失败，请稍后重试")
    } finally {
      setCheckingNext(false)
    }
  }, [checkingNext, name, namespace])

  const handleServiceNext = React.useCallback(() => {
    setServiceCompleted(true)
    setActiveStep("advanced")
    setStepError(null)
  }, [])

  const canNavigateService = basicCompleted
  const canNavigateAdvanced = basicCompleted && serviceCompleted
  const isBusy = checkingNext

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
        <DialogHeader className="border-b bg-muted/15 px-6 py-5 pr-20">
          <DialogTitle>创建服务</DialogTitle>
          <DialogDescription>使用 Kubernetes Service 创建网络访问入口。</DialogDescription>
        </DialogHeader>

        <StepHeaderNav
          items={[
            {
              id: "basic",
              title: "基本信息",
              status: activeStep === "basic" ? "当前" : basicCompleted ? "已设置" : "未设置",
              active: activeStep === "basic",
              icon: <IconSettings2 className="size-4" />,
              disabled: isBusy,
              onClick: () => setActiveStep("basic"),
            },
            {
              id: "service",
              title: "服务设置",
              status:
                activeStep === "service"
                  ? "当前"
                  : serviceCompleted
                    ? "已设置"
                    : "未设置",
              active: activeStep === "service",
              icon: <IconAdjustmentsHorizontal className="size-4" />,
              disabled: isBusy || !canNavigateService,
              onClick: () => setActiveStep("service"),
            },
            {
              id: "advanced",
              title: "高级设置",
              status: activeStep === "advanced" ? "当前" : "未设置",
              active: activeStep === "advanced",
              icon: <IconAdjustments className="size-4" />,
              disabled: isBusy || !canNavigateAdvanced,
              onClick: () => setActiveStep("advanced"),
            },
          ]}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {activeStep === "basic" ? (
            <FieldGroup className="grid gap-6 md:grid-cols-2">
              <Field data-invalid={Boolean(nameError)}>
                <FieldLabel htmlFor="service-create-name">名称</FieldLabel>
                <Input
                  id="service-create-name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    if (nameError) setNameError(null)
                    if (stepError) setStepError(null)
                  }}
                  placeholder="请输入服务名称"
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
                <FieldLabel htmlFor="service-create-namespace">项目</FieldLabel>
                <Select
                  value={namespace}
                  onValueChange={(value) => {
                    setNamespace(value)
                    if (namespaceError) setNamespaceError(null)
                    if (stepError) setStepError(null)
                  }}
                  disabled={isBusy}
                >
                  <SelectTrigger id="service-create-namespace" aria-invalid={Boolean(namespaceError)}>
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
                  <FieldDescription>选择服务所属项目。</FieldDescription>
                )}
              </Field>

              <Field className="md:col-span-2">
                <FieldLabel htmlFor="service-create-description">描述</FieldLabel>
                <Textarea
                  id="service-create-description"
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
          ) : activeStep === "service" ? (
            <div className="rounded-lg border border-dashed px-5 py-8">
              <div className="text-base font-semibold">服务设置</div>
              <p className="mt-2 text-sm text-muted-foreground">
                第二步先展示流程占位内容。下一版会在这里补充端口、访问方式、选择器等服务配置项。
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-5 py-8">
              <div className="text-base font-semibold">高级设置</div>
              <p className="mt-2 text-sm text-muted-foreground">
                第三步先展示流程占位内容。下一版会在这里补充会话亲和性、流量策略和更多高级参数。
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                当前版本暂不开放创建提交。
              </p>
            </div>
          )}

          {stepError ? <FieldError className="mt-4">{stepError}</FieldError> : null}
        </div>

        {activeStep === "basic" ? (
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isBusy}>
                  取消
                </Button>
              </DialogClose>
              <Button type="button" onClick={() => void handleBasicNext()} disabled={isBusy}>
                {checkingNext ? "校验中..." : "下一步"}
              </Button>
            </div>
          </DialogFooter>
        ) : activeStep === "service" ? (
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveStep("basic")}
                disabled={isBusy}
              >
                上一步
              </Button>
              <Button type="button" onClick={handleServiceNext} disabled={isBusy}>
                下一步
              </Button>
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <div className="flex w-full items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setActiveStep("service")}
                disabled={isBusy}
              >
                上一步
              </Button>
              <Button type="button" disabled>
                创建
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

