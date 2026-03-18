import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
  fetchResourceByName,
} from "./common"
import {
  asObject,
  buildDescriptionPatch,
  buildMetadata,
  checkNamespacedResourceExists,
  type BaseCreateInput,
  type ExistenceCheckInput,
} from "./create-utils"

export type JobCreateKind = "Job" | "CronJob"
const DEFAULT_CRON_SCHEDULE = "0 0 1 * *"

export type JobStrategyInput = {
  backoffLimit?: number
  completions?: number
  parallelism?: number
  activeDeadlineSeconds?: number
}

export type JobPodProbeInput = {
  mode?: "http" | "command" | "tcp"
  httpScheme?: "HTTP" | "HTTPS"
  httpPath?: string
  httpPort?: string
  command?: string
  tcpPort?: string
  initialDelaySeconds?: string
  timeoutSeconds?: string
  periodSeconds?: string
  successThreshold?: string
  failureThreshold?: string
}

export type JobPodContainerSecurityContextInput = {
  privileged?: boolean
  runAsUser?: string
  runAsGroup?: string
  runAsNonRoot?: boolean
  readOnlyRootFilesystem?: boolean
  allowPrivilegeEscalation?: boolean
}

export type JobPodInput = {
  restartPolicy?: "Never" | "OnFailure"
  containers?: Array<{
    name?: string
    type?: "container" | "initContainer"
    image: string
    imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
    command?: string[]
    args?: string[]
    syncHostTimezone?: boolean
    env?: Array<{
      name?: string
      value?: string
      valueFrom?: {
        configMapKeyRef?: {
          name?: string
          key?: string
        }
        secretKeyRef?: {
          name?: string
          key?: string
        }
      }
    }>
    ports?: Array<{
      protocol?: "GRPC" | "HTTP" | "HTTP2" | "HTTPS" | "MONGO" | "REDIS" | "TCP" | "TLS" | "UDP" | "SCTP"
      name?: string
      containerPort: string
    }>
    cpuRequest?: string
    cpuLimit?: string
    memoryRequestMi?: string
    memoryLimitMi?: string
    securityContext?: JobPodContainerSecurityContextInput
    probes?: {
      liveness?: JobPodProbeInput
      readiness?: JobPodProbeInput
      startup?: JobPodProbeInput
    }
  }>
}

export type CreateJobInput = BaseCreateInput & {
  kind: JobCreateKind
  schedule?: string
  strategy?: JobStrategyInput
  pod?: JobPodInput
}

export type UpdateJobInput = BaseCreateInput & {
  kind: JobCreateKind
  schedule?: string
  strategy?: JobStrategyInput
  pod?: JobPodInput
}

function toDnsLabelFragment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "-")
    .replace(/\.+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized.slice(0, 63)
}

function resolveContainerNameFromImage(image: string): string {
  const raw = image.trim()
  if (!raw) return ""
  const withoutDigest = raw.includes("@") ? raw.split("@")[0] ?? raw : raw
  const lastSegment = withoutDigest.split("/").filter(Boolean).pop() ?? withoutDigest
  const tagIndex = lastSegment.lastIndexOf(":")
  const withoutTag = tagIndex > 0 ? lastSegment.slice(0, tagIndex) : lastSegment
  return toDnsLabelFragment(withoutTag)
}

function resolveContainerName(name: string | undefined, image: string, index: number): string {
  const candidate = toDnsLabelFragment(name ?? "")
  if (candidate) return candidate
  const imageDerived = resolveContainerNameFromImage(image)
  if (imageDerived) return imageDerived
  return `container-${index + 1}`
}

function pickCpuQuantity(value: string | undefined): string | undefined {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return undefined
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined
  return text
}

function pickMemoryMiQuantity(value: string | undefined): string | undefined {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return undefined
  if (!/^\d+$/.test(text)) return undefined
  return `${text}Mi`
}

function pickContainerPortProtocol(
  value: unknown
): "TCP" | "UDP" | "SCTP" | undefined {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (normalized === "TCP" || normalized === "UDP" || normalized === "SCTP") {
    return normalized
  }
  return undefined
}

function pickContainerPortNumber(value: unknown): number | undefined {
  const text = typeof value === "string" ? value.trim() : ""
  if (!/^\d+$/.test(text)) return undefined
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return undefined
  if (parsed < 0 || parsed > 65535) return undefined
  return parsed
}

function pickOptionalNonNegativeIntFromUnknown(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value)
  }
  const text = typeof value === "string" ? value.trim() : ""
  if (!/^\d+$/.test(text)) return undefined
  const parsed = Number(text)
  if (!Number.isFinite(parsed) || parsed < 0) return undefined
  return Math.trunc(parsed)
}

function parseCommaSeparatedList(value: unknown): string[] {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) return []
  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function buildProbeSpec(probe?: JobPodProbeInput): Record<string, unknown> | undefined {
  if (!probe) return undefined

  const mode = typeof probe.mode === "string" ? probe.mode.trim().toLowerCase() : "http"
  const initialDelaySeconds = pickOptionalNonNegativeIntFromUnknown(probe.initialDelaySeconds)
  const timeoutSeconds = pickOptionalNonNegativeIntFromUnknown(probe.timeoutSeconds)
  const periodSeconds = pickOptionalNonNegativeIntFromUnknown(probe.periodSeconds)
  const successThreshold = pickOptionalNonNegativeIntFromUnknown(probe.successThreshold)
  const failureThreshold = pickOptionalNonNegativeIntFromUnknown(probe.failureThreshold)

  const modeSpec =
    mode === "command"
      ? (() => {
          const command = parseCommaSeparatedList(probe.command)
          if (command.length === 0) return undefined
          return { exec: { command } }
        })()
      : mode === "tcp"
        ? (() => {
            const port = pickContainerPortNumber(probe.tcpPort)
            if (typeof port !== "number") return undefined
            return { tcpSocket: { port } }
          })()
        : (() => {
            const port = pickContainerPortNumber(probe.httpPort)
            if (typeof port !== "number") return undefined
            const scheme = typeof probe.httpScheme === "string" && probe.httpScheme.toUpperCase() === "HTTPS"
              ? "HTTPS"
              : "HTTP"
            const path = typeof probe.httpPath === "string" && probe.httpPath.trim()
              ? probe.httpPath.trim()
              : "/"
            return {
              httpGet: {
                scheme,
                path,
                port,
              },
            }
          })()

  if (!modeSpec) return undefined

  return {
    ...modeSpec,
    ...(typeof initialDelaySeconds === "number" ? { initialDelaySeconds } : {}),
    ...(typeof timeoutSeconds === "number" ? { timeoutSeconds } : {}),
    ...(typeof periodSeconds === "number" ? { periodSeconds } : {}),
    ...(typeof successThreshold === "number" ? { successThreshold } : {}),
    ...(typeof failureThreshold === "number" ? { failureThreshold } : {}),
  }
}

function buildContainerSecurityContextSpec(
  value: JobPodContainerSecurityContextInput | undefined
): Record<string, unknown> | undefined {
  if (!value) return undefined

  const runAsUser = pickOptionalNonNegativeIntFromUnknown(value.runAsUser)
  const runAsGroup = pickOptionalNonNegativeIntFromUnknown(value.runAsGroup)
  const spec = {
    ...(value.privileged === true ? { privileged: true } : {}),
    ...(value.allowPrivilegeEscalation === true ? { allowPrivilegeEscalation: true } : {}),
    ...(value.readOnlyRootFilesystem === true ? { readOnlyRootFilesystem: true } : {}),
    ...(value.runAsNonRoot === true ? { runAsNonRoot: true } : {}),
    ...(typeof runAsUser === "number" ? { runAsUser } : {}),
    ...(typeof runAsGroup === "number" ? { runAsGroup } : {}),
  }

  return Object.keys(spec).length > 0 ? spec : undefined
}

function buildPodContainerSpec(pod?: JobPodInput) {
  const raw = Array.isArray(pod?.containers) ? pod.containers : []
  const containers: Array<Record<string, unknown>> = []
  const initContainers: Array<Record<string, unknown>> = []
  let withHostTimezone = false

  raw.forEach((item, index) => {
    const image = typeof item.image === "string" ? item.image.trim() : ""
    if (!image) return

    const imagePullPolicy =
      item.imagePullPolicy === "Always" || item.imagePullPolicy === "Never"
        ? item.imagePullPolicy
        : item.imagePullPolicy === "IfNotPresent"
          ? "IfNotPresent"
          : undefined

    const cpuRequest = pickCpuQuantity(item.cpuRequest)
    const cpuLimit = pickCpuQuantity(item.cpuLimit)
    const memoryRequest = pickMemoryMiQuantity(item.memoryRequestMi)
    const memoryLimit = pickMemoryMiQuantity(item.memoryLimitMi)

    const requests =
      cpuRequest || memoryRequest
        ? {
            ...(cpuRequest ? { cpu: cpuRequest } : {}),
            ...(memoryRequest ? { memory: memoryRequest } : {}),
          }
        : undefined
    const limits =
      cpuLimit || memoryLimit
        ? {
            ...(cpuLimit ? { cpu: cpuLimit } : {}),
            ...(memoryLimit ? { memory: memoryLimit } : {}),
          }
        : undefined
    const resources =
      requests || limits
        ? {
            ...(requests ? { requests } : {}),
            ...(limits ? { limits } : {}),
          }
        : undefined

    const ports = (Array.isArray(item.ports) ? item.ports : [])
      .map((port) => {
        const containerPort = pickContainerPortNumber(port.containerPort)
        if (typeof containerPort !== "number") return null
        const protocol = pickContainerPortProtocol(port.protocol)
        const name = typeof port.name === "string" ? port.name.trim() : ""
        return {
          containerPort,
          ...(name ? { name } : {}),
          ...(protocol ? { protocol } : {}),
        }
      })
      .filter((port): port is { containerPort: number; name?: string; protocol?: "TCP" | "UDP" | "SCTP" } => Boolean(port))
    const env = (Array.isArray(item.env) ? item.env : [])
      .map((entry) => {
        const name = typeof entry.name === "string" ? entry.name.trim() : ""
        if (!name) return null
        const valueFrom =
          typeof entry.valueFrom === "object" && entry.valueFrom !== null
            ? (entry.valueFrom as Record<string, unknown>)
            : {}
        const configMapKeyRef =
          typeof valueFrom.configMapKeyRef === "object" && valueFrom.configMapKeyRef !== null
            ? (valueFrom.configMapKeyRef as Record<string, unknown>)
            : {}
        const secretKeyRef =
          typeof valueFrom.secretKeyRef === "object" && valueFrom.secretKeyRef !== null
            ? (valueFrom.secretKeyRef as Record<string, unknown>)
            : {}
        const configMapName =
          typeof configMapKeyRef.name === "string" ? configMapKeyRef.name.trim() : ""
        const configMapKey =
          typeof configMapKeyRef.key === "string" ? configMapKeyRef.key.trim() : ""
        const secretName =
          typeof secretKeyRef.name === "string" ? secretKeyRef.name.trim() : ""
        const secretKey =
          typeof secretKeyRef.key === "string" ? secretKeyRef.key.trim() : ""

        if (configMapName && configMapKey) {
          return {
            name,
            valueFrom: {
              configMapKeyRef: {
                name: configMapName,
                key: configMapKey,
              },
            },
          }
        }
        if (secretName && secretKey) {
          return {
            name,
            valueFrom: {
              secretKeyRef: {
                name: secretName,
                key: secretKey,
              },
            },
          }
        }

        return {
          name,
          value: typeof entry.value === "string" ? entry.value : "",
        }
      })
      .filter(Boolean) as Array<{
        name: string
        value?: string
        valueFrom?: {
          configMapKeyRef?: { name: string; key: string }
          secretKeyRef?: { name: string; key: string }
        }
      }>
    const livenessProbe = buildProbeSpec(item.probes?.liveness)
    const readinessProbe = buildProbeSpec(item.probes?.readiness)
    const startupProbe = buildProbeSpec(item.probes?.startup)
    const securityContext = buildContainerSecurityContextSpec(item.securityContext)

    const containerSpec: Record<string, unknown> = {
      name: resolveContainerName(item.name, image, index),
      image,
      ...(imagePullPolicy ? { imagePullPolicy } : {}),
      ...(Array.isArray(item.command) && item.command.length > 0 ? { command: item.command } : {}),
      ...(Array.isArray(item.args) && item.args.length > 0 ? { args: item.args } : {}),
      ...(resources ? { resources } : {}),
      ...(env.length > 0 ? { env } : {}),
      ...(livenessProbe ? { livenessProbe } : {}),
      ...(readinessProbe ? { readinessProbe } : {}),
      ...(startupProbe ? { startupProbe } : {}),
      ...(securityContext ? { securityContext } : {}),
      ...(item.syncHostTimezone
        ? {
            volumeMounts: [
              {
                name: "host-time",
                readOnly: true,
                mountPath: "/etc/localtime",
              },
            ],
          }
        : {}),
      ...(ports.length > 0 ? { ports } : {}),
    }
    if (item.syncHostTimezone) {
      withHostTimezone = true
    }

    if (item.type === "initContainer") {
      initContainers.push(containerSpec)
      return
    }
    containers.push(containerSpec)
  })

  return {
    ...(containers.length > 0 ? { containers } : {}),
    ...(initContainers.length > 0 ? { initContainers } : {}),
    ...(withHostTimezone
      ? {
          volumes: [
            {
              name: "host-time",
              hostPath: {
                path: "/etc/localtime",
                type: "",
              },
            },
          ],
        }
      : {}),
  }
}

function pickOptionalNonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined
}

function buildJobStrategySpec(strategy?: JobStrategyInput) {
  const backoffLimit = pickOptionalNonNegativeInt(strategy?.backoffLimit)
  const completions = pickOptionalNonNegativeInt(strategy?.completions)
  const parallelism = pickOptionalNonNegativeInt(strategy?.parallelism)
  const activeDeadlineSeconds = pickOptionalNonNegativeInt(strategy?.activeDeadlineSeconds)

  return {
    ...(typeof backoffLimit === "number" ? { backoffLimit } : {}),
    ...(typeof completions === "number" ? { completions } : {}),
    ...(typeof parallelism === "number" ? { parallelism } : {}),
    ...(typeof activeDeadlineSeconds === "number" ? { activeDeadlineSeconds } : {}),
  }
}

function resolveRestartPolicy(pod?: JobPodInput): "Never" | "OnFailure" {
  return pod?.restartPolicy === "OnFailure" ? "OnFailure" : "Never"
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function normalizeCronSchedule(value: unknown): string {
  const text = asString(value).trim()
  return text || DEFAULT_CRON_SCHEDULE
}

export async function checkJobExists(
  input: ExistenceCheckInput & { kind: JobCreateKind }
): Promise<boolean> {
  return checkNamespacedResourceExists({
    group: "batch",
    version: "v1",
    resource: input.kind === "CronJob" ? "cronjobs" : "jobs",
    input,
  })
}

export async function createJob(input: CreateJobInput): Promise<void> {
  const metadata = buildMetadata(input)
  const resource = input.kind === "CronJob" ? "cronjobs" : "jobs"
  const strategySpec = buildJobStrategySpec(input.strategy)
  const restartPolicy = resolveRestartPolicy(input.pod)
  const podContainerSpec = buildPodContainerSpec(input.pod)
  const schedule = normalizeCronSchedule(input.schedule)

  const requestBody =
    input.kind === "CronJob"
      ? {
          apiVersion: "batch/v1",
          kind: "CronJob",
          metadata,
          spec: {
            schedule,
            concurrencyPolicy: "Forbid",
            successfulJobsHistoryLimit: 3,
            failedJobsHistoryLimit: 1,
            jobTemplate: {
              spec: {
                ...strategySpec,
                template: {
                  spec: {
                    restartPolicy,
                    ...podContainerSpec,
                  },
                },
              },
            },
          },
        }
      : {
          apiVersion: "batch/v1",
          kind: "Job",
          metadata,
          spec: {
            ...strategySpec,
            template: {
              spec: {
                restartPolicy,
                ...podContainerSpec,
              },
            },
          },
        }

  const url = buildResourceCollectionEndpoint("batch", "v1", resource, {
    namespace: metadata.namespace,
  })

  await fetchJsonDeduped<unknown>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}

export async function updateJob(input: UpdateJobInput): Promise<void> {
  const metadata = buildMetadata(input)
  const resource = input.kind === "CronJob" ? "cronjobs" : "jobs"
  const strategySpec = buildJobStrategySpec(input.strategy)
  const restartPolicy = resolveRestartPolicy(input.pod)
  const podContainerSpec = buildPodContainerSpec(input.pod)

  const { payload } = await fetchResourceByName<unknown>("batch", "v1", resource, metadata.name, {
    namespace: metadata.namespace,
  })

  const existing = asObject(payload)
  const existingMetadata = asObject(existing.metadata)
  const existingAnnotations = asObject(existingMetadata.annotations)
  const nextDescription = buildDescriptionPatch(input.description).annotations.description
  let mergedAnnotations: Record<string, unknown> = {
    ...existingAnnotations,
  }
  if (nextDescription === null) {
    mergedAnnotations = Object.fromEntries(
      Object.entries(mergedAnnotations).filter(([key]) => key !== "description")
    )
  } else {
    mergedAnnotations = {
      ...mergedAnnotations,
      description: nextDescription,
    }
  }

  const nextSpec =
    input.kind === "CronJob"
      ? (() => {
          const existingSpec = asObject(existing.spec)
          const existingJobTemplate = asObject(existingSpec.jobTemplate)
          const existingJobTemplateSpec = asObject(existingJobTemplate.spec)
          const schedule = normalizeCronSchedule(input.schedule ?? asString(existingSpec.schedule))

          return {
            ...existingSpec,
            schedule,
            jobTemplate: {
              ...existingJobTemplate,
              spec: {
                ...existingJobTemplateSpec,
                ...strategySpec,
                template: {
                  spec: {
                    restartPolicy,
                    ...podContainerSpec,
                  },
                },
              },
            },
          }
        })()
      : {
          ...asObject(existing.spec),
          ...strategySpec,
          template: {
            spec: {
              restartPolicy,
              ...podContainerSpec,
            },
          },
        }

  const requestBody = {
    apiVersion: "batch/v1",
    kind: input.kind,
    metadata: {
      name: metadata.name,
      namespace: metadata.namespace,
      resourceVersion:
        typeof existingMetadata.resourceVersion === "string"
          ? existingMetadata.resourceVersion
          : undefined,
      ...(Object.keys(mergedAnnotations).length > 0 ? { annotations: mergedAnnotations } : {}),
      ...(typeof existingMetadata.labels === "object" && existingMetadata.labels !== null
        ? { labels: existingMetadata.labels }
        : {}),
    },
    spec: nextSpec,
  }

  const url = buildResourceItemEndpoint("batch", "v1", resource, metadata.name, metadata.namespace)
  await fetchJsonDeduped<unknown>(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })
}
