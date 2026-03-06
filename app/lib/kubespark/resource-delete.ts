import { deleteResource } from "./common"
import type { JobKind, WorkloadKind } from "./resource-rows"

const WORKLOAD_DELETE_TARGET: Record<
  WorkloadKind,
  { group: string; version: string; resource: string }
> = {
  Deployment: { group: "apps", version: "v1", resource: "deployments" },
  StatefulSet: { group: "apps", version: "v1", resource: "statefulsets" },
  DaemonSet: { group: "apps", version: "v1", resource: "daemonsets" },
}

const JOB_DELETE_TARGET: Record<
  JobKind,
  { group: string; version: string; resource: string }
> = {
  Job: { group: "batch", version: "v1", resource: "jobs" },
  CronJob: { group: "batch", version: "v1", resource: "cronjobs" },
}

export async function deleteWorkload(
  kind: WorkloadKind,
  namespace: string,
  name: string
): Promise<void> {
  const target = WORKLOAD_DELETE_TARGET[kind]
  return deleteResource(target.group, target.version, target.resource, name, namespace)
}

export async function deleteJob(
  kind: JobKind,
  namespace: string,
  name: string
): Promise<void> {
  const target = JOB_DELETE_TARGET[kind]
  return deleteResource(target.group, target.version, target.resource, name, namespace)
}

export async function deleteService(namespace: string, name: string): Promise<void> {
  return deleteResource("core", "v1", "services", name, namespace)
}

export async function deleteIngress(namespace: string, name: string): Promise<void> {
  return deleteResource("networking.k8s.io", "v1", "ingresses", name, namespace)
}

export async function deleteConfigMap(namespace: string, name: string): Promise<void> {
  return deleteResource("core", "v1", "configmaps", name, namespace)
}

export async function deleteSecret(namespace: string, name: string): Promise<void> {
  return deleteResource("core", "v1", "secrets", name, namespace)
}
