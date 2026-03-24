import {
  buildResourceCollectionEndpoint,
  buildResourceItemEndpoint,
  fetchJsonDeduped,
  fetchResourceCollection,
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

