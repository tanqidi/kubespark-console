import { stringify } from "yaml"

export type ResourceDocumentType =
  | "pod"
  | "job"
  | "cronjob"
  | "service"
  | "ingress"
  | "configmap"
  | "secret"
  | "storageclass"
  | "persistentvolume"
  | "persistentvolumeclaim"
  | "deployment"
  | "statefulset"
  | "daemonset"
  | "namespace"
  | "workspace"
export type ResourceDocumentOutput = "yaml" | "json"
export type ResourceDocumentLanguage = "yaml" | "json"

export type ResourceDocumentResult = {
  normalized: unknown
  text: string
  language: ResourceDocumentLanguage
}

type JsonObject = Record<string, unknown>

const ROOT_KEY_ORDER = [
  "kind",
  "apiVersion",
  "metadata",
  "spec",
  "type",
  "data",
  "stringData",
  "binaryData",
  "immutable",
  "status",
]

const METADATA_KEY_ORDER = [
  "name",
  "generateName",
  "namespace",
  "labels",
  "annotations",
  "finalizers",
  "ownerReferences",
  "resourceVersion",
  "creationTimestamp",
  "uid",
]

const SPEC_KEY_ORDER = [
  "schedule",
  "concurrencyPolicy",
  "suspend",
  "successfulJobsHistoryLimit",
  "failedJobsHistoryLimit",
  "parallelism",
  "completions",
  "backoffLimit",
  "activeDeadlineSeconds",
  "ttlSecondsAfterFinished",
  "selector",
  "template",
  "jobTemplate",
  "restartPolicy",
  "containers",
  "initContainers",
  "volumes",
  "ports",
  "clusterIP",
  "clusterIPs",
  "type",
  "sessionAffinity",
  "ipFamilies",
  "ipFamilyPolicy",
  "internalTrafficPolicy",
  "externalTrafficPolicy",
  "rules",
  "tls",
  "storageClassName",
  "accessModes",
  "resources",
  "volumeName",
  "persistentVolumeReclaimPolicy",
  "volumeBindingMode",
  "allowVolumeExpansion",
  "provisioner",
  "parameters",
]

const CONTAINER_KEY_ORDER = [
  "name",
  "image",
  "imagePullPolicy",
  "command",
  "args",
  "workingDir",
  "env",
  "envFrom",
  "ports",
  "resources",
  "volumeMounts",
  "livenessProbe",
  "readinessProbe",
  "startupProbe",
  "lifecycle",
  "securityContext",
]

const PROBE_KEY_ORDER = [
  "httpGet",
  "tcpSocket",
  "exec",
  "initialDelaySeconds",
  "periodSeconds",
  "timeoutSeconds",
  "successThreshold",
  "failureThreshold",
  "terminationGracePeriodSeconds",
]

const PORT_KEY_ORDER = [
  "name",
  "protocol",
  "port",
  "targetPort",
  "nodePort",
  "containerPort",
  "appProtocol",
]

const ENV_KEY_ORDER = ["name", "value", "valueFrom"]

const VALUE_FROM_KEY_ORDER = [
  "fieldRef",
  "resourceFieldRef",
  "configMapKeyRef",
  "secretKeyRef",
]

const REF_KEY_ORDER = ["name", "key", "optional"]

const RESOURCES_KEY_ORDER = ["requests", "limits"]

const RESOURCE_UNIT_KEY_ORDER = ["cpu", "memory", "ephemeral-storage", "storage"]

const VOLUME_KEY_ORDER = [
  "name",
  "hostPath",
  "emptyDir",
  "configMap",
  "secret",
  "projected",
  "persistentVolumeClaim",
  "downwardAPI",
  "csi",
  "nfs",
]

const VOLUME_MOUNT_KEY_ORDER = ["name", "mountPath", "subPath", "readOnly", "mountPropagation"]

const HOST_PATH_KEY_ORDER = ["path", "type"]

const HTTP_GET_KEY_ORDER = ["path", "port", "host", "scheme", "httpHeaders"]

const TCP_SOCKET_KEY_ORDER = ["port", "host"]

const SECURITY_CONTEXT_KEY_ORDER = [
  "privileged",
  "allowPrivilegeEscalation",
  "readOnlyRootFilesystem",
  "runAsNonRoot",
  "runAsUser",
  "runAsGroup",
  "capabilities",
]

const MAP_ALPHA_SORT_PARENTS = new Set([
  "data",
  "stringData",
  "binaryData",
  "labels",
  "annotations",
  "matchLabels",
])

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function orderKeysByPriority(keys: string[], priority: string[]): string[] {
  const keySet = new Set(keys)
  const ordered = priority.filter((key) => keySet.has(key))
  const rest = keys.filter((key) => !priority.includes(key))
  return [...ordered, ...rest]
}

function isContainerLikeObject(value: JsonObject): boolean {
  return "image" in value || "imagePullPolicy" in value || "env" in value || "volumeMounts" in value
}

function resolveKeyOrder(value: JsonObject, parentKey?: string): string[] | null {
  if (!parentKey) return ROOT_KEY_ORDER
  if (parentKey === "metadata") return METADATA_KEY_ORDER
  if (parentKey === "spec") return SPEC_KEY_ORDER
  if (parentKey === "template" || parentKey === "jobTemplate") return ["metadata", "spec"]
  if (parentKey === "selector") return ["matchLabels", "matchExpressions"]
  if (parentKey === "containers" || parentKey === "initContainers") return CONTAINER_KEY_ORDER
  if (parentKey === "ports") return PORT_KEY_ORDER
  if (parentKey === "env") return ENV_KEY_ORDER
  if (parentKey === "valueFrom") return VALUE_FROM_KEY_ORDER
  if (parentKey === "configMapKeyRef" || parentKey === "secretKeyRef") return REF_KEY_ORDER
  if (parentKey === "resources") return RESOURCES_KEY_ORDER
  if (parentKey === "requests" || parentKey === "limits") return RESOURCE_UNIT_KEY_ORDER
  if (parentKey === "volumes") return VOLUME_KEY_ORDER
  if (parentKey === "volumeMounts") return VOLUME_MOUNT_KEY_ORDER
  if (parentKey === "hostPath") return HOST_PATH_KEY_ORDER
  if (parentKey === "httpGet") return HTTP_GET_KEY_ORDER
  if (parentKey === "tcpSocket") return TCP_SOCKET_KEY_ORDER
  if (parentKey === "exec") return ["command"]
  if (parentKey === "livenessProbe" || parentKey === "readinessProbe" || parentKey === "startupProbe") {
    return PROBE_KEY_ORDER
  }
  if (parentKey === "securityContext") return SECURITY_CONTEXT_KEY_ORDER
  if (isContainerLikeObject(value)) return CONTAINER_KEY_ORDER
  return null
}

function reorderDocumentValue(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => reorderDocumentValue(item, parentKey))
  }

  const objectValue = asObject(value)
  if (Object.keys(objectValue).length === 0 && (typeof value !== "object" || value === null)) {
    return value
  }

  const keys = Object.keys(objectValue)
  if (keys.length === 0) return objectValue

  const orderedKeys = MAP_ALPHA_SORT_PARENTS.has(parentKey ?? "")
    ? [...keys].sort((a, b) => a.localeCompare(b))
    : (() => {
        const keyOrder = resolveKeyOrder(objectValue, parentKey)
        return keyOrder ? orderKeysByPriority(keys, keyOrder) : keys
      })()

  const reordered: JsonObject = {}
  orderedKeys.forEach((key) => {
    reordered[key] = reorderDocumentValue(objectValue[key], key)
  })
  return reordered
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

function decodeBase64ToUtf8(value: string): string | null {
  const normalized = value.replace(/\s+/g, "")
  if (!normalized) return null

  const padding = normalized.length % 4
  const base64 = padding === 0 ? normalized : `${normalized}${"=".repeat(4 - padding)}`

  try {
    if (typeof atob === "function") {
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    }

    if (typeof Buffer !== "undefined") {
      return Buffer.from(base64, "base64").toString("utf8")
    }
  } catch {
    return null
  }

  return null
}

function isReadableText(value: string): boolean {
  if (!value) return true
  if (value.includes("\u0000")) return false

  let controlCount = 0
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    const allowedControl = code === 0x09 || code === 0x0a || code === 0x0d
    if (code < 0x20 && !allowedControl) controlCount += 1
  }

  return controlCount / value.length < 0.05
}

function normalizeManifestMetadata(value: unknown): JsonObject {
  const metadata = { ...asObject(value) }
  delete metadata.uid
  delete metadata.resourceVersion
  delete metadata.generation
  delete metadata.creationTimestamp
  delete metadata.deletionTimestamp
  delete metadata.deletionGracePeriodSeconds
  delete metadata.managedFields
  delete metadata.ownerReferences
  delete metadata.selfLink
  return metadata
}

function normalizePodDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = { ...asObject(root.metadata) }
  delete metadata.ownerReferences
  delete metadata.managedFields

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Pod",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if ("metadata" in root) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeJobDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Job",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "batch/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeCronJobDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "CronJob",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "batch/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeServiceDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Service",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeIngressDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Ingress",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "networking.k8s.io/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeConfigMapDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "ConfigMap",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("data" in root) normalized.data = root.data
  if ("binaryData" in root) normalized.binaryData = root.binaryData
  if ("immutable" in root) normalized.immutable = root.immutable

  Object.keys(root).forEach((key) => {
    if (
      key === "kind" ||
      key === "apiVersion" ||
      key === "metadata" ||
      key === "data" ||
      key === "binaryData" ||
      key === "immutable" ||
      key === "status"
    ) {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeSecretDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)
  const data = asObject(root.data)
  const decodedStringData: Record<string, string> = {}
  const remainingData: Record<string, string> = {}

  Object.entries(data).forEach(([key, value]) => {
    if (typeof value !== "string") return
    const decoded = decodeBase64ToUtf8(value)
    if (decoded !== null && isReadableText(decoded)) {
      decodedStringData[key] = decoded
    } else {
      remainingData[key] = value
    }
  })

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Secret",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("type" in root) normalized.type = root.type
  if (Object.keys(remainingData).length > 0) normalized.data = remainingData
  if (Object.keys(decodedStringData).length > 0) normalized.stringData = decodedStringData
  if ("stringData" in root) {
    normalized.stringData = {
      ...asObject(normalized.stringData),
      ...asObject(root.stringData),
    }
  }
  if ("immutable" in root) normalized.immutable = root.immutable

  Object.keys(root).forEach((key) => {
    if (
      key === "kind" ||
      key === "apiVersion" ||
      key === "metadata" ||
      key === "type" ||
      key === "data" ||
      key === "stringData" ||
      key === "immutable" ||
      key === "status"
    ) {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeStorageClassDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "StorageClass",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "storage.k8s.io/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("provisioner" in root) normalized.provisioner = root.provisioner
  if ("parameters" in root) normalized.parameters = root.parameters
  if ("reclaimPolicy" in root) normalized.reclaimPolicy = root.reclaimPolicy
  if ("volumeBindingMode" in root) normalized.volumeBindingMode = root.volumeBindingMode
  if ("allowVolumeExpansion" in root) normalized.allowVolumeExpansion = root.allowVolumeExpansion
  if ("mountOptions" in root) normalized.mountOptions = root.mountOptions
  if ("allowedTopologies" in root) normalized.allowedTopologies = root.allowedTopologies

  Object.keys(root).forEach((key) => {
    if (
      key === "kind" ||
      key === "apiVersion" ||
      key === "metadata" ||
      key === "provisioner" ||
      key === "parameters" ||
      key === "reclaimPolicy" ||
      key === "volumeBindingMode" ||
      key === "allowVolumeExpansion" ||
      key === "mountOptions" ||
      key === "allowedTopologies" ||
      key === "status"
    ) {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizePersistentVolumeClaimDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "PersistentVolumeClaim",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizePersistentVolumeDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "PersistentVolume",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeDeploymentDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Deployment",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "apps/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeStatefulSetDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "StatefulSet",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "apps/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeDaemonSetDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "DaemonSet",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "apps/v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeNamespaceDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Namespace",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "v1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeWorkspaceDocument(payload: unknown): JsonObject {
  const root = asObject(payload)
  const metadata = normalizeManifestMetadata(root.metadata)

  const normalized: JsonObject = {
    kind: asNonEmptyString(root.kind) ?? "Workspace",
    apiVersion: asNonEmptyString(root.apiVersion) ?? "tanqidi.com/v1alpha1",
  }

  if (Object.keys(metadata).length > 0) normalized.metadata = metadata
  if ("spec" in root) normalized.spec = root.spec

  Object.keys(root).forEach((key) => {
    if (key === "kind" || key === "apiVersion" || key === "metadata" || key === "spec" || key === "status") {
      return
    }
    normalized[key] = root[key]
  })

  return normalized
}

function normalizeDocumentByType(type: ResourceDocumentType, payload: unknown): unknown {
  if (type === "pod") return normalizePodDocument(payload)
  if (type === "job") return normalizeJobDocument(payload)
  if (type === "cronjob") return normalizeCronJobDocument(payload)
  if (type === "service") return normalizeServiceDocument(payload)
  if (type === "ingress") return normalizeIngressDocument(payload)
  if (type === "configmap") return normalizeConfigMapDocument(payload)
  if (type === "secret") return normalizeSecretDocument(payload)
  if (type === "storageclass") return normalizeStorageClassDocument(payload)
  if (type === "persistentvolume") return normalizePersistentVolumeDocument(payload)
  if (type === "persistentvolumeclaim") return normalizePersistentVolumeClaimDocument(payload)
  if (type === "deployment") return normalizeDeploymentDocument(payload)
  if (type === "statefulset") return normalizeStatefulSetDocument(payload)
  if (type === "daemonset") return normalizeDaemonSetDocument(payload)
  if (type === "namespace") return normalizeNamespaceDocument(payload)
  if (type === "workspace") return normalizeWorkspaceDocument(payload)
  return payload
}

export function buildResourceDocument(params: {
  type: ResourceDocumentType
  payload: unknown
  output?: ResourceDocumentOutput
}): ResourceDocumentResult {
  const { type, payload, output = "yaml" } = params
  const normalized = reorderDocumentValue(normalizeDocumentByType(type, payload))

  if (output === "json") {
    return {
      normalized,
      text: JSON.stringify(normalized, null, 2),
      language: "json",
    }
  }

  return {
    normalized,
    text: stringify(normalized, {
      indent: 2,
      lineWidth: 0,
      sortMapEntries: false,
    }),
    language: "yaml",
  }
}
