export type ContainerPortLike = {
  id: string
  name: string
  containerPort: string
}

export type ContainerPortFieldErrors = Record<string, { name?: string; containerPort?: string }>

type InvalidFieldCandidate = {
  invalid: boolean
  fieldId: string | null
}

export function resolveFirstContainerPortErrorFieldId(
  containerId: string,
  ports: ContainerPortLike[],
  errors: ContainerPortFieldErrors
): string | null {
  for (const item of ports) {
    const rowError = errors[item.id]
    if (!rowError) continue
    if (rowError.name) return `${containerId}-port-${item.id}-name`
    if (rowError.containerPort) return `${containerId}-port-${item.id}-container-port`
  }
  return null
}

export function resolveFirstContainerEditorErrorFieldId(params: {
  containerId: string
  imageError: string | null
  ports: ContainerPortLike[]
  portFieldErrors: ContainerPortFieldErrors
}): string | null {
  const { containerId, imageError, ports, portFieldErrors } = params
  const firstPortErrorFieldId = resolveFirstContainerPortErrorFieldId(containerId, ports, portFieldErrors)
  return resolveFirstInvalidFieldId([
    {
      invalid: Boolean(imageError),
      fieldId: `${containerId}-image`,
    },
    {
      invalid: Boolean(firstPortErrorFieldId),
      fieldId: firstPortErrorFieldId,
    },
  ])
}

export function resolveFirstInvalidFieldId(candidates: InvalidFieldCandidate[]): string | null {
  for (const candidate of candidates) {
    if (!candidate.invalid) continue
    if (candidate.fieldId) return candidate.fieldId
  }
  return null
}

export function scrollAndFocusFieldById(fieldId: string | null): void {
  if (!fieldId || typeof document === "undefined") return

  requestAnimationFrame(() => {
    const target = document.getElementById(fieldId) as HTMLElement | null
    if (!target) return

    target.scrollIntoView({ behavior: "smooth", block: "center" })
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      target.focus({ preventScroll: true })
      return
    }
    target.focus?.()
  })
}
