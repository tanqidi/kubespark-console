import { buildResourceCollectionEndpoint, fetchJsonDeduped } from "./common"
import {
  buildMetadata,
  checkNamespacedResourceExists,
  type BaseCreateInput,
  type ExistenceCheckInput,
} from "./create-utils"

export type JobCreateKind = "Job" | "CronJob"

export type JobStrategyInput = {
  backoffLimit?: number
  completions?: number
  parallelism?: number
  activeDeadlineSeconds?: number
}

export type JobPodInput = {
  restartPolicy?: "Never" | "OnFailure"
  containers?: Array<{
    name?: string
    type?: "container" | "initContainer"
    image: string
    imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
  }>
}

export type CreateJobInput = BaseCreateInput & {
  kind: JobCreateKind
  strategy?: JobStrategyInput
  pod?: JobPodInput
}

function buildDefaultTaskContainer() {
  return {
    name: "task",
    image: "busybox:1.36",
    command: ["sh", "-c", "echo task-created"],
  }
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

function resolveContainerName(name: string | undefined, index: number): string {
  const candidate = toDnsLabelFragment(name ?? "")
  if (candidate) return candidate
  return `task-${index + 1}`
}

function buildPodContainerSpec(pod?: JobPodInput) {
  const raw = Array.isArray(pod?.containers) ? pod.containers : []
  const normalized = raw
    .map((item, index) => {
      const image = typeof item.image === "string" ? item.image.trim() : ""
      if (!image) return null
      const imagePullPolicy =
        item.imagePullPolicy === "Always" || item.imagePullPolicy === "Never"
          ? item.imagePullPolicy
          : item.imagePullPolicy === "IfNotPresent"
            ? "IfNotPresent"
            : undefined
      return {
        name: resolveContainerName(item.name, index),
        type: item.type === "initContainer" ? "initContainer" : "container",
        image,
        ...(imagePullPolicy ? { imagePullPolicy } : {}),
      }
    })
    .filter(
      (item): item is {
        name: string
        type: "container" | "initContainer"
        image: string
        imagePullPolicy?: "Always" | "IfNotPresent" | "Never"
      } =>
      Boolean(item)
    )
  const containers = normalized
    .filter((item) => item.type === "container")
    .map((item) => ({
      name: item.name,
      image: item.image,
      ...(item.imagePullPolicy ? { imagePullPolicy: item.imagePullPolicy } : {}),
    }))
  const initContainers = normalized
    .filter((item) => item.type === "initContainer")
    .map((item) => ({
      name: item.name,
      image: item.image,
      ...(item.imagePullPolicy ? { imagePullPolicy: item.imagePullPolicy } : {}),
    }))

  return {
    containers: containers.length > 0 ? containers : [buildDefaultTaskContainer()],
    ...(initContainers.length > 0 ? { initContainers } : {}),
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

  const requestBody =
    input.kind === "CronJob"
      ? {
          apiVersion: "batch/v1",
          kind: "CronJob",
          metadata,
          spec: {
            schedule: "*/5 * * * *",
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
