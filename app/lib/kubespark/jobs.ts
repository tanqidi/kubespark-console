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

export type CreateJobInput = BaseCreateInput & {
  kind: JobCreateKind
  strategy?: JobStrategyInput
}

function buildDefaultTaskContainer() {
  return {
    name: "task",
    image: "busybox:1.36",
    command: ["sh", "-c", "echo task-created"],
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
                    restartPolicy: "Never",
                    containers: [buildDefaultTaskContainer()],
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
                restartPolicy: "Never",
                containers: [buildDefaultTaskContainer()],
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
