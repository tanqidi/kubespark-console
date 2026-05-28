import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
  fetchResourceCollection,
  fetchResourceByName,
} from "./common"

export type WorkloadCreateKind = "Deployment" | "StatefulSet" | "DaemonSet"

export type WorkloadGvr = {
  group: string
  version: string
  resource: string
}

const WORKLOAD_GVR_BY_KIND: Record<WorkloadCreateKind, WorkloadGvr> = {
  Deployment: { group: "apps", version: "v1", resource: "deployments" },
  StatefulSet: { group: "apps", version: "v1", resource: "statefulsets" },
  DaemonSet: { group: "apps", version: "v1", resource: "daemonsets" },
}

export type CreateWorkloadInput = {
  kind: WorkloadCreateKind
  namespace: string
  name: string
  payload: Record<string, unknown>
}

export type UpdateWorkloadInput = {
  kind: WorkloadCreateKind
  namespace: string
  name: string
  payload: Record<string, unknown>
}

type WorkloadResourcePayload = Record<string, unknown> & {
  metadata?: Record<string, unknown>
  spec?: Record<string, unknown> & {
    template?: Record<string, unknown> & {
      metadata?: Record<string, unknown> & {
        annotations?: Record<string, string>
      }
    }
  }
}

export async function checkWorkloadExists(
  kind: WorkloadCreateKind,
  namespace: string,
  name: string
): Promise<boolean> {
  const gvr = WORKLOAD_GVR_BY_KIND[kind]
  const { items } = await fetchResourceCollection(
    gvr.group,
    gvr.version,
    gvr.resource,
    {
      namespace,
      fieldSelector: `metadata.name=${name}`,
    }
  )
  return items.length > 0
}

export async function createWorkload(input: CreateWorkloadInput): Promise<unknown> {
  const gvr = WORKLOAD_GVR_BY_KIND[input.kind]
  const endpoint = buildResourceCollectionEndpoint(gvr.group, gvr.version, gvr.resource, {
    namespace: input.namespace,
  })
  return fetchJsonDeduped<unknown>(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload),
  })
}

export async function updateWorkload(input: UpdateWorkloadInput): Promise<unknown> {
  const gvr = WORKLOAD_GVR_BY_KIND[input.kind]
  const endpoint = buildResourceItemEndpoint(
    gvr.group,
    gvr.version,
    gvr.resource,
    input.name,
    input.namespace
  )
  return fetchJsonDeduped<unknown>(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input.payload),
  })
}

export async function rolloutWorkload(input: {
  kind: WorkloadCreateKind
  namespace: string
  name: string
}): Promise<unknown> {
  const gvr = WORKLOAD_GVR_BY_KIND[input.kind]
  const { payload: current } = await fetchResourceByName<unknown>(
    gvr.group,
    gvr.version,
    gvr.resource,
    input.name,
    { namespace: input.namespace }
  )
  const payload = JSON.parse(JSON.stringify(current)) as WorkloadResourcePayload
  payload.metadata ??= {}
  payload.spec ??= {}
  payload.spec.template ??= {}
  payload.spec.template.metadata ??= {}
  payload.spec.template.metadata.annotations ??= {}

  payload.metadata.name =
    typeof payload.metadata.name === "string" && payload.metadata.name ? payload.metadata.name : input.name
  payload.metadata.namespace =
    typeof payload.metadata.namespace === "string" && payload.metadata.namespace
      ? payload.metadata.namespace
      : input.namespace
  delete payload.metadata.managedFields
  delete payload.status

  payload.spec.template.metadata.annotations["kubectl.kubernetes.io/restartedAt"] =
    new Date().toISOString()

  return updateWorkload({
    kind: input.kind,
    namespace: input.namespace,
    name: input.name,
    payload,
  })
}

