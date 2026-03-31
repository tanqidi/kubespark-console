import { fetchResourceCollection } from "./common"
import {
  formatAge,
  resolveDescriptionFromAnnotations,
  resolveUpdatedAt,
} from "./utils"

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

function readDescription(resource: JsonObject): string {
  const metadata = asObject(resource.metadata)
  const annotations = asObject(metadata.annotations)
  return resolveDescriptionFromAnnotations(annotations)
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
  description: string
  namespace: string
  dataItems: number
  size: string
  age: string
  updatedAt: string
}

export async function fetchConfigMapRows(limit = 300): Promise<ConfigMapResourceRow[]> {
  const { items } = await fetchResourceCollection("core", "v1", "configmaps")
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
      description: readDescription(resource),
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
  description: string
  type: string
  namespace: string
  internalAccess: string
  internalAccessType: string
  externalAccess: string
  externalAccessType: string
  age: string
  updatedAt: string
}

export async function fetchServiceRows(limit = 300): Promise<ServiceResourceRow[]> {
  const { items } = await fetchResourceCollection("core", "v1", "services")
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const name = asString(metadata.name, "service")
    const clusterIpRaw = asString(spec.clusterIP)
    const externalName = asString(spec.externalName, "")

    let internalAccess = clusterIpRaw
    let internalAccessType = "VirtualIP"
    if (clusterIpRaw === "None") {
      internalAccess = "None"
      internalAccessType = "Headless"
    } else if (clusterIpRaw === "-" && externalName) {
      internalAccess = externalName
      internalAccessType = "ExternalName"
    } else if (clusterIpRaw === "-") {
      internalAccessType = "-"
    }

    const nodePorts = Array.isArray(spec.ports)
      ? spec.ports
          .map((p) => {
            const portObj = asObject(p)
            const nodePort = portObj.nodePort
            if (typeof nodePort !== "number" || nodePort <= 0) return null
            const protocol = asString(portObj.protocol, "TCP")
            return `${nodePort}/${protocol}`
          })
          .filter((value): value is string => Boolean(value))
      : []

    const externalAccess = nodePorts.length > 0 ? nodePorts.join(", ") : "-"
    const externalAccessType = nodePorts.length > 0 ? "端口" : "-"

    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      description: readDescription(resource),
      type: asString(spec.type),
      namespace: asString(metadata.namespace, "default"),
      internalAccess,
      internalAccessType,
      externalAccess,
      externalAccessType,
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export type SecretResourceRow = {
  id: string
  name: string
  description: string
  namespace: string
  type: string
  dataItems: number
  size: string
  age: string
  updatedAt: string
}

export async function fetchSecretRows(limit = 300): Promise<SecretResourceRow[]> {
  const { items } = await fetchResourceCollection("core", "v1", "secrets")
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const dataObj = asObject(resource.data)
    const name = asString(metadata.name, "secret")
    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      description: readDescription(resource),
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
  description: string
  namespace: string
  host: string
  path: string
  service: string
  age: string
  updatedAt: string
}

export async function fetchRouteRows(limit = 300): Promise<RouteResourceRow[]> {
  const { items } = await fetchResourceCollection("networking.k8s.io", "v1", "ingresses")
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

    const firstRule = asObject(rules[0])
    const host = asString(firstRule.host, "-")
    const http = asObject(firstRule.http)
    const paths = Array.isArray(http.paths) ? http.paths : []
    const firstPath = asObject(paths[0])
    const backend = asObject(firstPath.backend)
    const serviceObj = asObject(backend.service)

    mapped.push({
      id: `${baseId}-0`,
      name,
      description: readDescription(resource),
      namespace,
      host,
      path: asString(firstPath.path, "/"),
      service: asString(serviceObj.name ?? serviceObj.serviceName),
      age,
      updatedAt,
    })
  })

  return mapped
}

export type StorageClassResourceRow = {
  id: string
  name: string
  description: string
  isDefault: string
  provisioner: string
  reclaimPolicy: string
  volumeBindingMode: string
  allowExpansion: string
  age: string
  updatedAt: string
}

function formatIsDefaultStorageClass(value: unknown): string {
  return typeof value === "string" && value.trim().toLowerCase() === "true" ? "Yes" : "-"
}

function formatAllowExpansion(value: unknown): string {
  if (typeof value !== "boolean") return "-"
  return value ? "Yes" : "No"
}

export async function fetchStorageClassRows(limit = 300): Promise<StorageClassResourceRow[]> {
  const { items } = await fetchResourceCollection("storage.k8s.io", "v1", "storageclasses")
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const annotations = asObject(metadata.annotations)
    const name = asString(metadata.name, "storageclass")
    return {
      id: asString(metadata.uid, `${name}-${index}`),
      name: asString(metadata.name),
      description: readDescription(resource),
      isDefault: formatIsDefaultStorageClass(annotations["storageclass.kubernetes.io/is-default-class"]),
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
  description: string
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
  const [jobsResult, cronJobsResult] = await Promise.all([
    fetchResourceCollection("batch", "v1", "jobs"),
    fetchResourceCollection("batch", "v1", "cronjobs"),
  ])
  const items = [...jobsResult.items, ...cronJobsResult.items]
  return items.slice(0, limit).map((item, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const status = asObject(resource.status)
    const name = asString(metadata.name)
    const kind: JobKind = resource.kind === "CronJob" ? "CronJob" : "Job"

    return {
      id: asString(metadata.uid, `${kind}-${name}-${index}`),
      name,
      description: readDescription(resource),
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

export type WorkloadSelectorPair = {
  key: string
  value: string
}

export type WorkloadPortItem = {
  protocol: "TCP" | "UDP" | "SCTP"
  port: number
}

export type WorkloadResourceRow = {
  id: string
  name: string
  description: string
  status: string
  namespace: string
  desired: number
  updated: number
  available: number
  ready: number
  age: string
  updatedAt: string
  kind: WorkloadKind
  selectors: WorkloadSelectorPair[]
  ports: WorkloadPortItem[]
}

function resolveWorkloadStatus(desired: number, updated: number, available: number, ready: number): string {
  if (ready >= Math.max(1, desired) || available >= desired) return "Normal"
  if (ready > 0 || updated > 0) return "Updating"
  return "Abnormal"
}

function resolveWorkloadSelectors(spec: JsonObject): WorkloadSelectorPair[] {
  const selector = asObject(spec.selector)
  const matchLabels = asObject(selector.matchLabels)

  let source = matchLabels
  if (Object.keys(source).length === 0) {
    const template = asObject(spec.template)
    const metadata = asObject(template.metadata)
    source = asObject(metadata.labels)
  }

  return Object.entries(source)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, value]) => ({ key, value }))
}

function resolveWorkloadPorts(spec: JsonObject): WorkloadPortItem[] {
  const template = asObject(spec.template)
  const podSpec = asObject(template.spec)
  const containers = Array.isArray(podSpec.containers) ? podSpec.containers : []
  const seen = new Set<string>()
  const ports: WorkloadPortItem[] = []

  containers.forEach((container) => {
    const containerObj = asObject(container)
    const containerPorts = Array.isArray(containerObj.ports) ? containerObj.ports : []

    containerPorts.forEach((entry) => {
      const portObj = asObject(entry)
      const containerPort = portObj.containerPort
      if (typeof containerPort !== "number" || containerPort < 1 || containerPort > 65535) {
        return
      }

      const protocolRaw = portObj.protocol
      const protocol: WorkloadPortItem["protocol"] =
        protocolRaw === "UDP" || protocolRaw === "SCTP" ? protocolRaw : "TCP"
      const dedupeKey = `${protocol}:${containerPort}`
      if (seen.has(dedupeKey)) return

      seen.add(dedupeKey)
      ports.push({
        protocol,
        port: containerPort,
      })
    })
  })

  return ports
}

export async function fetchWorkloadRows(limit = 300): Promise<WorkloadResourceRow[]> {
  const [deploymentsResult, daemonSetsResult, statefulSetsResult] = await Promise.all([
    fetchResourceCollection("apps", "v1", "deployments"),
    fetchResourceCollection("apps", "v1", "daemonsets"),
    fetchResourceCollection("apps", "v1", "statefulsets"),
  ])

  const itemsWithKind = [
    ...deploymentsResult.items.map((item) => ({ item, sourceKind: "Deployment" as const })),
    ...daemonSetsResult.items.map((item) => ({ item, sourceKind: "DaemonSet" as const })),
    ...statefulSetsResult.items.map((item) => ({ item, sourceKind: "StatefulSet" as const })),
  ]

  return itemsWithKind.slice(0, limit).map(({ item, sourceKind }, index) => {
    const resource = asObject(item)
    const metadata = asObject(resource.metadata)
    const spec = asObject(resource.spec)
    const status = asObject(resource.status)
    const name = asString(metadata.name)
    const resolvedKind: WorkloadKind =
      resource.kind === "DaemonSet" || resource.kind === "StatefulSet" || resource.kind === "Deployment"
        ? resource.kind
        : sourceKind
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
      description: readDescription(resource),
      status: resolveWorkloadStatus(desired, updated, available, ready),
      namespace: asString(metadata.namespace, "default"),
      desired,
      updated,
      available,
      ready,
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
      kind: resolvedKind,
      selectors: resolveWorkloadSelectors(spec),
      ports: resolveWorkloadPorts(spec),
    }
  })
}

export type PersistentVolumeResourceRow = {
  id: string
  name: string
  description: string
  capacity: string
  storageClass: string
  accessMode: string
  reclaimPolicy: string
  status: string
  node: string
  age: string
  updatedAt: string
}

export type PersistentVolumeClaimResourceRow = {
  id: string
  name: string
  description: string
  namespace: string
  capacity: string
  storageClass: string
  accessMode: string
  status: string
  boundPV: string
  age: string
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
      description: readDescription(resource),
      capacity: asString(capacity.storage),
      storageClass: asString(spec.storageClassName),
      accessMode,
      reclaimPolicy: asString(spec.persistentVolumeReclaimPolicy),
      status: asString(status.phase),
      node,
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
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
      description: readDescription(resource),
      namespace,
      capacity,
      storageClass: asString(spec.storageClassName),
      accessMode,
      status: asString(status.phase),
      boundPV: asString(spec.volumeName),
      age: formatAge(typeof metadata.creationTimestamp === "string" ? metadata.creationTimestamp : undefined),
      updatedAt: resolveUpdatedAt(resource),
    }
  })
}

export async function fetchVolumeRows(limit = 300): Promise<VolumeRowsResult> {
  const [pvcResult, pvResult] = await Promise.all([
    fetchResourceCollection("core", "v1", "persistentvolumeclaims"),
    fetchResourceCollection("core", "v1", "persistentvolumes"),
  ])

  const persistentVolumeClaims = mapPersistentVolumeClaims(pvcResult.items, limit)
  const persistentVolumes = mapPersistentVolumes(pvResult.items, limit)

  return { persistentVolumes, persistentVolumeClaims }
}
