import { API_PROXY_BASE, fetchJsonDeduped } from "./common"
import { formatAge, resolveUpdatedAt } from "./utils"

const BASE = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1`

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function unwrapItems(payload: unknown): unknown[] {
  const root = asObject(payload)
  const container = root.data ?? payload
  const items = asObject(container).items
  return Array.isArray(items) ? items : []
}

function byteLengthOf(obj: unknown): number {
  try {
    const encoded = new TextEncoder().encode(JSON.stringify(obj ?? {}))
    return encoded.length
  } catch {
    return 0
  }
}

function formatSize(bytes: number): string {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} Mi`
  return `${(bytes / 1024).toFixed(1)} Ki`
}

export type ConfigMapResourceRow = {
  id: string
  name: string
  namespace: string
  dataItems: number
  size: string
  age: string
  updatedAt: string
}

export async function fetchConfigMapRows(limit = 300): Promise<ConfigMapResourceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(`${BASE}/configmaps`)
  const items = unwrapItems(payload)
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const dataObj = asObject(resource.data)
    const binaryData = asObject(resource.binaryData)
    const dataItems = Object.keys(dataObj).length + Object.keys(binaryData).length
    const sizeBytes = byteLengthOf(dataObj) + byteLengthOf(binaryData)
    const name = asString(metadata.name, "configmap")
    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      namespace: asString(metadata.namespace, "default"),
      dataItems,
      size: formatSize(sizeBytes),
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export type ServiceResourceRow = {
  id: string
  name: string
  type: string
  namespace: string
  clusterIp: string
  ports: string
  age: string
  updatedAt: string
}

export async function fetchServiceRows(limit = 300): Promise<ServiceResourceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(`${BASE}/services`)
  const items = unwrapItems(payload)
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const name = asString(metadata.name, "service")
    const ports = Array.isArray(spec.ports)
      ? spec.ports
          .map((p) => {
            const port = asObject(p).port
            const protocol = asObject(p).protocol
            return `${String(port ?? "-")}/${asString(protocol, "TCP")}`
          })
          .join(",")
      : "-"

    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      type: asString(spec.type),
      namespace: asString(metadata.namespace, "default"),
      clusterIp: asString(spec.clusterIP),
      ports: ports || "-",
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export type SecretResourceRow = {
  id: string
  name: string
  namespace: string
  type: string
  dataItems: number
  size: string
  age: string
  updatedAt: string
}

export async function fetchSecretRows(limit = 300): Promise<SecretResourceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(`${BASE}/secrets`)
  const items = unwrapItems(payload)
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const dataObj = asObject(resource.data)
    const name = asString(metadata.name, "secret")
    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      namespace: asString(metadata.namespace, "default"),
      type: asString(resource.type),
      dataItems: Object.keys(dataObj).length,
      size: formatSize(byteLengthOf(dataObj)),
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export type RouteResourceRow = {
  id: string
  name: string
  namespace: string
  host: string
  path: string
  service: string
  age: string
  updatedAt: string
}

export async function fetchRouteRows(limit = 300): Promise<RouteResourceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(`${BASE}/ingresses`)
  const items = unwrapItems(payload)
  const mapped: RouteResourceRow[] = []

  items.slice(0, limit).forEach((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const rules = Array.isArray(spec.rules) ? spec.rules : []
    const name = asString(metadata.name, "ingress")
    const namespace = asString(metadata.namespace, "default")
    const baseId = asString(metadata.uid, `${name}-${index}`)
    const updatedAt = resolveUpdatedAt(resource)
    const age = formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined)

    if (!rules.length) {
      mapped.push({
        id: `${baseId}-0`,
        name,
        namespace,
        host: "-",
        path: "/",
        service: "-",
        age,
        updatedAt,
      })
      return
    }

    rules.forEach((rule, ruleIndex) => {
      const ruleObj = asObject(rule)
      const host = asString(ruleObj.host)
      const http = asObject(ruleObj.http)
      const paths = Array.isArray(http.paths) ? http.paths : []

      if (!paths.length) {
        mapped.push({
          id: `${baseId}-${ruleIndex}`,
          name,
          namespace,
          host,
          path: "/",
          service: "-",
          age,
          updatedAt,
        })
        return
      }

      paths.forEach((pathItem, pathIndex) => {
        const pathObj = asObject(pathItem)
        const backend = asObject(pathObj.backend)
        const serviceObj = asObject(backend.service)
        mapped.push({
          id: `${baseId}-${ruleIndex}-${pathIndex}`,
          name,
          namespace,
          host,
          path: asString(pathObj.path, "/"),
          service: asString(serviceObj.name ?? serviceObj.serviceName),
          age,
          updatedAt,
        })
      })
    })
  })

  return mapped
}

export type StorageClassResourceRow = {
  id: string
  name: string
  provisioner: string
  reclaimPolicy: string
  volumeBindingMode: string
  allowExpansion: string
  age: string
  updatedAt: string
}

function formatAllowExpansion(value: unknown): string {
  if (typeof value !== "boolean") return "-"
  return value ? "Yes" : "No"
}

export async function fetchStorageClassRows(limit = 300): Promise<StorageClassResourceRow[]> {
  const payload = await fetchJsonDeduped<unknown>(`${BASE}/storageclasses`)
  const items = unwrapItems(payload)
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const name = asString(metadata.name, "storageclass")
    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      provisioner: asString(resource.provisioner),
      reclaimPolicy: asString(resource.reclaimPolicy),
      volumeBindingMode: asString(resource.volumeBindingMode),
      allowExpansion: formatAllowExpansion(resource.allowVolumeExpansion),
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export type JobKind = "Job" | "CronJob"

export type JobResourceRow = {
  id: string
  name: string
  status: string
  namespace: string
  duration: string
  retry: number
  age: string
  updatedAt: string
  kind: JobKind
}

function resolveJobStatus(resource: JsonObject): string {
  const status = asObject(resource.status)
  const succeeded = status.succeeded
  const active = status.active
  const failed = status.failed
  if (typeof succeeded === "number" && succeeded > 0) return "Succeeded"
  if (typeof active === "number" && active > 0) return "Running"
  if (typeof failed === "number" && failed > 0) return "Failed"
  return "Pending"
}

function resolveCronJobStatus(resource: JsonObject): string {
  const status = asObject(resource.status)
  const active = status.active
  const activeJobs = Array.isArray(active) ? active.length : 0
  if (activeJobs > 0) return "Running"
  if (typeof status.lastScheduleTime === "string" && status.lastScheduleTime.length > 0) return "Succeeded"
  return "Pending"
}

function resolveJobDuration(resource: JsonObject): string {
  const status = asObject(resource.status)
  const start = Date.parse(asString(status.startTime, ""))
  const end = Date.parse(asString(status.completionTime, ""))
  if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
    const sec = Math.max(1, Math.round((end - start) / 1000))
    return `${sec}s`
  }
  return "-"
}

export async function fetchJobRows(limit = 300): Promise<JobResourceRow[]> {
  const [jobsPayload, cronJobsPayload] = await Promise.all([
    fetchJsonDeduped<unknown>(`${BASE}/jobs`),
    fetchJsonDeduped<unknown>(`${BASE}/cronjobs`),
  ])
  const items = [...unwrapItems(jobsPayload), ...unwrapItems(cronJobsPayload)]
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const status = asObject(resource.status)
    const name = asString(metadata.name)
    const kind: JobKind = resource.kind === "CronJob" ? "CronJob" : "Job"

    return {
      id: asString(metadata.uid, `${kind}-${name}-${index}`),
      name,
      status: kind === "CronJob" ? resolveCronJobStatus(resource) : resolveJobStatus(resource),
      namespace: asString(metadata.namespace, "default"),
      duration: kind === "CronJob" ? "-" : resolveJobDuration(resource),
      retry: typeof status.failed === "number" ? status.failed : 0,
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
      kind,
    }
  })
}

export type WorkloadKind = "Deployment" | "StatefulSet" | "DaemonSet"

export type WorkloadResourceRow = {
  id: string
  name: string
  status: string
  namespace: string
  desired: number
  updated: number
  available: number
  ready: number
  age: string
  updatedAt: string
  kind: WorkloadKind
}

function resolveWorkloadStatus(desired: number, updated: number, available: number, ready: number): string {
  if (ready >= Math.max(1, desired) || available >= desired) return "Normal"
  if (ready > 0 || updated > 0) return "Updating"
  return "Abnormal"
}

export async function fetchWorkloadRows(limit = 300): Promise<WorkloadResourceRow[]> {
  const [deploymentsPayload, daemonSetsPayload, statefulSetsPayload] = await Promise.all([
    fetchJsonDeduped<unknown>(`${BASE}/deployments`),
    fetchJsonDeduped<unknown>(`${BASE}/daemonsets`),
    fetchJsonDeduped<unknown>(`${BASE}/statefulsets`),
  ])

  const items = [
    ...unwrapItems(deploymentsPayload),
    ...unwrapItems(daemonSetsPayload),
    ...unwrapItems(statefulSetsPayload),
  ]

  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const status = asObject(resource.status)
    const name = asString(metadata.name)
    const kind = resource.kind
    const resolvedKind: WorkloadKind =
      kind === "DaemonSet" || kind === "StatefulSet" || kind === "Deployment"
        ? kind
        : "Deployment"
    const desired =
      typeof spec.replicas === "number"
        ? spec.replicas
        : typeof status.desiredNumberScheduled === "number"
          ? status.desiredNumberScheduled
          : 0
    const updated =
      typeof status.updatedReplicas === "number"
        ? status.updatedReplicas
        : typeof status.updatedNumberScheduled === "number"
          ? status.updatedNumberScheduled
          : 0
    const available =
      typeof status.availableReplicas === "number"
        ? status.availableReplicas
        : typeof status.numberAvailable === "number"
          ? status.numberAvailable
          : 0
    const ready =
      typeof status.readyReplicas === "number"
        ? status.readyReplicas
        : typeof status.numberReady === "number"
          ? status.numberReady
          : 0

    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name,
      status: resolveWorkloadStatus(desired, updated, available, ready),
      namespace: asString(metadata.namespace, "default"),
      desired,
      updated,
      available,
      ready,
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
      kind: resolvedKind,
    }
  })
}

export type PersistentVolumeResourceRow = {
  id: string
  name: string
  capacity: string
  storageClass: string
  accessMode: string
  reclaimPolicy: string
  status: string
  node: string
  updatedAt: string
}

export type PersistentVolumeClaimResourceRow = {
  id: string
  name: string
  namespace: string
  capacity: string
  storageClass: string
  accessMode: string
  status: string
  boundPV: string
  updatedAt: string
}

export type VolumeRowsResult = {
  persistentVolumes: PersistentVolumeResourceRow[]
  persistentVolumeClaims: PersistentVolumeClaimResourceRow[]
}

function mapPersistentVolumes(items: unknown[], limit: number): PersistentVolumeResourceRow[] {
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const status = asObject(resource.status)

    const accessModes = asStringList(spec.accessModes)
    const accessMode = accessModes.length ? accessModes.join(",") : "-"

    const nodeAffinity = asObject(spec.nodeAffinity)
    const required = asObject(nodeAffinity.required)
    const selectorTerms = Array.isArray(required.nodeSelectorTerms) ? required.nodeSelectorTerms : []
    const firstTerm = selectorTerms[0]
    const matchExpressions = Array.isArray(asObject(firstTerm).matchExpressions)
      ? (asObject(firstTerm).matchExpressions as unknown[])
      : []
    const firstExpression = matchExpressions[0]
    const values = asStringList(asObject(firstExpression).values)
    const node = values[0] ?? "-"

    const capacity = asObject(spec.capacity)
    const name = asString(metadata.name, "pv")

    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      capacity: asString(capacity.storage),
      storageClass: asString(spec.storageClassName),
      accessMode,
      reclaimPolicy: asString(spec.persistentVolumeReclaimPolicy),
      status: asString(status.phase),
      node,
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

function mapPersistentVolumeClaims(
  items: unknown[],
  limit: number
): PersistentVolumeClaimResourceRow[] {
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const status = asObject(resource.status)

    const accessModes = asStringList(spec.accessModes)
    const accessMode = accessModes.length ? accessModes.join(",") : "-"

    const specResources = asObject(spec.resources)
    const requests = asObject(specResources.requests)
    const capacity = asString(asObject(status.capacity).storage, asString(requests.storage))
    const namespace = asString(metadata.namespace, "default")
    const name = asString(metadata.name, "pvc")

    return {
      id: asString(metadata.uid, `${namespace}-${name}-${index}`),
      name: asString(metadata.name),
      namespace,
      capacity,
      storageClass: asString(spec.storageClassName),
      accessMode,
      status: asString(status.phase),
      boundPV: asString(spec.volumeName),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export async function fetchVolumeRows(limit = 300): Promise<VolumeRowsResult> {
  const [pvcPayload, pvPayload] = await Promise.all([
    fetchJsonDeduped<unknown>(`${BASE}/persistentvolumeclaims`),
    fetchJsonDeduped<unknown>(`${BASE}/persistentvolumes`),
  ])

  const persistentVolumeClaims = mapPersistentVolumeClaims(unwrapItems(pvcPayload), limit)
  const persistentVolumes = mapPersistentVolumes(unwrapItems(pvPayload), limit)

  return { persistentVolumes, persistentVolumeClaims }
}
