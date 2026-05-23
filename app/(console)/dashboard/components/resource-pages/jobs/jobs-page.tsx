"use client"

import * as React from "react"
import { IconDotsVertical, IconEye, IconInfoCircle, IconPencil, IconTrash } from "@tabler/icons-react"
import type { ColumnDef } from "@tanstack/react-table"

import { DataTable } from "@/app/(console)/dashboard/components/data-table"
import {
  CreateJobDialog,
  type JobDialogInitialValues,
} from "@/app/(console)/dashboard/components/resource-pages/jobs/create-job-dialog"
// import { ResourceLoadingState } from "@/app/(console)/dashboard/components/resource-pages/loading-state" // disabled: avoid layout jitter during loading
import {
  createColumns,
  renderNameDescriptionCell,
  type ColumnConfig,
} from "@/app/(console)/dashboard/components/table/columns-factory"
import { fetchResourceByName, fetchResourceDescribe } from "@/app/lib/kubespark/common"
import { createJob, updateJob } from "@/app/lib/kubespark/jobs"
import { DeleteConfirmDialog } from "@/app/(console)/dashboard/components/resource-pages/delete-confirm-dialog"
import { fetchJobRows, type JobResourceRow } from "@/app/lib/kubespark/resource-rows"
import { deleteJob } from "@/app/lib/kubespark/resource-delete"
import { fetchNamespaces } from "@/app/lib/kubespark/projects"
import { fetchNamespacedResourceYaml } from "@/app/lib/kubespark/resource-yaml"
import { FilterCombobox } from "@/components/ui/filter-combobox"
import { MonacoViewerDialog } from "@/components/ui/monaco-viewer-dialog"
import { DescribeViewerDialog } from "@/app/(console)/dashboard/components/resource-pages/describe-viewer-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslations } from "@/app/lib/i18n";
import { useIntervalRefresh } from "@/app/(console)/dashboard/hooks/use-interval-refresh";

type JobRow = JobResourceRow

function getJobColumns(t: (key: string) => string): ColumnConfig<JobRow>[] {
  return [
    {
      key: "name",
      label: t("table.columns.name"),
      enableHiding: false,
      cell: (_value, row) => renderNameDescriptionCell(row.name, row.description),
    },
    { key: "status", label: t("table.columns.status"), render: "status" as const },
    { key: "namespace", label: t("table.columns.namespace") },
    { key: "duration", label: t("table.columns.duration") },
    { key: "retry", label: t("table.columns.retry") },
    { key: "age", label: t("table.columns.age") },
    { key: "updatedAt", label: t("table.columns.updatedAt") },
  ]
}

const JOB_RESOURCE_BY_KIND: Record<JobRow["kind"], string> = {
  Job: "jobs",
  CronJob: "cronjobs",
}

const CONTAINER_PORT_PROTOCOL_SET = new Set([
  "TCP",
  "UDP",
  "SCTP",
])
const DEFAULT_CRON_SCHEDULE = "0 0 1 * *"

type JsonObject = Record<string, unknown>
type JobDialogContainer = NonNullable<NonNullable<JobDialogInitialValues["pod"]>["containers"]>[number]

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function toOptionalIntegerString(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return String(Math.trunc(value))
  }
  const text = asString(value).trim()
  return /^\d+$/.test(text) ? text : ""
}

function toMemoryMiText(value: unknown): string {
  const text = asString(value).trim()
  if (!text) return ""
  const mi = text.match(/^(\d+)mi$/i)
  if (mi?.[1]) return mi[1]
  return /^\d+$/.test(text) ? text : ""
}

function toPortProtocol(
  value: unknown
): "TCP" | "UDP" | "SCTP" {
  const text = asString(value).trim().toUpperCase()
  return CONTAINER_PORT_PROTOCOL_SET.has(text)
    ? (text as "TCP" | "UDP" | "SCTP")
    : "TCP"
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
}

function formatStringListAsEditorText(value: unknown): string {
  const list = toStringArray(value)
  return list.length > 0 ? list.join(",") : ""
}

function toProbeScheme(value: unknown): "HTTP" | "HTTPS" {
  return asString(value).trim().toUpperCase() === "HTTPS" ? "HTTPS" : "HTTP"
}

function toProbePortText(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 65535) {
    return String(Math.trunc(value))
  }
  return toOptionalIntegerString(value)
}

function parseProbeDraftFromSpec(raw: unknown) {
  const spec = asObject(raw)
  if (Object.keys(spec).length === 0) return null

  const httpGet = asObject(spec.httpGet)
  const tcpSocket = asObject(spec.tcpSocket)
  const exec = asObject(spec.exec)
  const commandText = formatStringListAsEditorText(exec.command)

  let mode: "http" | "command" | "tcp" = "http"
  if (commandText) {
    mode = "command"
  } else if (Object.keys(tcpSocket).length > 0) {
    mode = "tcp"
  }

  return {
    mode,
    httpScheme: toProbeScheme(httpGet.scheme),
    httpPath: asString(httpGet.path).trim() || "/",
    httpPort: toProbePortText(httpGet.port) || "80",
    command: commandText,
    tcpPort: toProbePortText(tcpSocket.port) || "80",
    initialDelaySeconds: toOptionalIntegerString(spec.initialDelaySeconds) || "0",
    timeoutSeconds: toOptionalIntegerString(spec.timeoutSeconds) || "1",
    periodSeconds: toOptionalIntegerString(spec.periodSeconds) || "10",
    successThreshold: toOptionalIntegerString(spec.successThreshold) || "1",
    failureThreshold: toOptionalIntegerString(spec.failureThreshold) || "3",
  }
}

function parseProbeMapFromContainer(item: JsonObject) {
  const liveness = parseProbeDraftFromSpec(item.livenessProbe)
  const readiness = parseProbeDraftFromSpec(item.readinessProbe)
  const startup = parseProbeDraftFromSpec(item.startupProbe)

  return {
    ...(liveness ? { liveness } : {}),
    ...(readiness ? { readiness } : {}),
    ...(startup ? { startup } : {}),
  }
}

function parseJobInitialValues(kind: JobRow["kind"], row: JobRow, payload: unknown): JobDialogInitialValues {
  const resource = asObject(payload)
  const metadata = asObject(resource.metadata)
  const annotations = asObject(metadata.annotations)
  const labels = asObject(metadata.labels)
  const spec = asObject(resource.spec)
  const strategySource =
    kind === "CronJob" ? asObject(asObject(asObject(spec.jobTemplate).spec)) : spec
  const podSpec =
    kind === "CronJob"
      ? asObject(asObject(asObject(strategySource.template).spec))
      : asObject(asObject(spec.template).spec)

  const hostTimeVolumeNames = new Set(
    (Array.isArray(podSpec.volumes) ? podSpec.volumes : [])
      .map((vol) => asObject(vol))
      .filter((vol) => asString(asObject(vol.hostPath).path) === "/etc/localtime")
      .map((vol) => asString(vol.name))
      .filter((name) => name.length > 0)
  )

  const parseContainers = (
    source: unknown,
    type: "container" | "initContainer"
  ): JobDialogContainer[] =>
    (Array.isArray(source) ? source : [])
      .map((entry) => {
        const item = asObject(entry)
        const resources = asObject(item.resources)
        const requests = asObject(resources.requests)
        const limits = asObject(resources.limits)
        const mounts = Array.isArray(item.volumeMounts) ? item.volumeMounts : []
        const syncHostTimezone = mounts.some((mount) => {
          const mountObj = asObject(mount)
          const mountPath = asString(mountObj.mountPath)
          const mountName = asString(mountObj.name)
          return (
            mountPath === "/etc/localtime" ||
            (mountName.length > 0 && hostTimeVolumeNames.has(mountName))
          )
        })
        const ports = (Array.isArray(item.ports) ? item.ports : [])
          .map((port) => {
            const portObj = asObject(port)
            const containerPort =
              typeof portObj.containerPort === "number"
                ? String(portObj.containerPort)
                : asString(portObj.containerPort)
            if (!containerPort.trim()) return null
            return {
              protocol: toPortProtocol(portObj.protocol),
              name: asString(portObj.name),
              containerPort,
            }
          })
          .filter((port): port is { protocol: "TCP" | "UDP" | "SCTP"; name: string; containerPort: string } => Boolean(port))
        const env = (Array.isArray(item.env) ? item.env : [])
          .map((entry) => {
            const envItem = asObject(entry)
            const name = asString(envItem.name).trim()
            if (!name) return null

            const valueFrom = asObject(envItem.valueFrom)
            const configMapKeyRef = asObject(valueFrom.configMapKeyRef)
            const secretKeyRef = asObject(valueFrom.secretKeyRef)
            const configMapName = asString(configMapKeyRef.name).trim()
            const configMapKey = asString(configMapKeyRef.key).trim()
            const secretName = asString(secretKeyRef.name).trim()
            const secretKey = asString(secretKeyRef.key).trim()

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
              value: asString(envItem.value),
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

        const image = asString(item.image).trim()
        if (!image.trim()) return null

        const imagePullPolicy = asString(item.imagePullPolicy)
        const command = toStringArray(item.command)
        const args = toStringArray(item.args)
        const securityContextRaw = asObject(item.securityContext)
        const securityContext = {
          ...(securityContextRaw.privileged === true ? { privileged: true } : {}),
          ...(securityContextRaw.allowPrivilegeEscalation === true ? { allowPrivilegeEscalation: true } : {}),
          ...(securityContextRaw.readOnlyRootFilesystem === true ? { readOnlyRootFilesystem: true } : {}),
          ...(securityContextRaw.runAsNonRoot === true ? { runAsNonRoot: true } : {}),
          ...(toOptionalIntegerString(securityContextRaw.runAsUser)
            ? { runAsUser: toOptionalIntegerString(securityContextRaw.runAsUser) }
            : {}),
          ...(toOptionalIntegerString(securityContextRaw.runAsGroup)
            ? { runAsGroup: toOptionalIntegerString(securityContextRaw.runAsGroup) }
            : {}),
        }
        const normalizedImagePullPolicy: "Always" | "IfNotPresent" | "Never" =
          imagePullPolicy === "Always" || imagePullPolicy === "Never"
            ? imagePullPolicy
            : "IfNotPresent"

        const normalized: JobDialogContainer = {
          name: asString(item.name),
          type,
          image,
          imagePullPolicy: normalizedImagePullPolicy,
          ...(command.length > 0 ? { command } : {}),
          ...(args.length > 0 ? { args } : {}),
          ...(env.length > 0 ? { env } : {}),
          syncHostTimezone,
          ...(ports.length > 0 ? { ports } : {}),
          cpuRequest: asString(requests.cpu),
          cpuLimit: asString(limits.cpu),
          memoryRequestMi: toMemoryMiText(requests.memory),
          memoryLimitMi: toMemoryMiText(limits.memory),
          ...(Object.keys(securityContext).length > 0 ? { securityContext } : {}),
          probes: parseProbeMapFromContainer(item),
        }
        return normalized
      })
      .filter((item): item is JobDialogContainer => item !== null)

  const containers = [
    ...parseContainers(podSpec.containers, "container"),
    ...parseContainers(podSpec.initContainers, "initContainer"),
  ]

  const parsedVolumes = (Array.isArray(podSpec.volumes) ? podSpec.volumes : [])
    .map((entry) => asObject(entry))
    .map((volume) => {
      const name = asString(volume.name).trim()
      const hostPath = asObject(volume.hostPath)
      const pvc = asObject(volume.persistentVolumeClaim)
      const hasEmptyDir = Object.prototype.hasOwnProperty.call(volume, "emptyDir")

      if (!name || hostTimeVolumeNames.has(name)) return null
      if (asString(pvc.claimName).trim()) {
        return {
          volumeId: name,
          volumeKind: "persistent" as const,
          volumeName: asString(pvc.claimName).trim(),
        }
      }
      if (hasEmptyDir) {
        return {
          volumeId: name,
          volumeKind: "ephemeral" as const,
          volumeName: name,
        }
      }
      if (asString(hostPath.path).trim()) {
        return {
          volumeId: name,
          volumeKind: "hostPath" as const,
          volumeName: asString(hostPath.path).trim(),
        }
      }
      return null
    })
    .filter(
      (
        volume
      ): volume is {
        volumeId: string
        volumeKind: "persistent" | "ephemeral" | "hostPath"
        volumeName: string
      } => Boolean(volume)
    )

  const resolvedStorageList = parsedVolumes.map((volume) => {
    const source = [
      ...(Array.isArray(podSpec.containers) ? podSpec.containers : []),
      ...(Array.isArray(podSpec.initContainers) ? podSpec.initContainers : []),
    ]
    const mounts = source
      .map((entry) => asObject(entry))
      .flatMap((container) => {
        const containerName = asString(container.name).trim()
        const volumeMounts = Array.isArray(container.volumeMounts) ? container.volumeMounts : []
        return volumeMounts
          .map((mount) => asObject(mount))
          .filter((mount) => asString(mount.name).trim() === volume.volumeId)
          .map((mount) => ({
            containerName,
            mountMode: mount.readOnly === true ? ("ro" as const) : ("rw" as const),
            mountPath: asString(mount.mountPath).trim(),
          }))
      })
      .filter((mount) => mount.containerName && mount.mountPath)

    return {
      volumeId: volume.volumeId,
      volumeKind: volume.volumeKind,
      volumeName: volume.volumeName,
      mounts,
    }
  })

  const parsedConfigList = (Array.isArray(podSpec.volumes) ? podSpec.volumes : [])
    .map((entry) => asObject(entry))
    .map((volume, index) => {
      const volumeId = asString(volume.name).trim()
      const configMap = asObject(volume.configMap)
      const secret = asObject(volume.secret)
      const configMapName = asString(configMap.name).trim()
      const secretName = asString(secret.secretName).trim()
      const sourceKind = secretName ? "secret" : configMapName ? "configMap" : null
      const sourceName = secretName || configMapName
      if (!sourceKind || !sourceName || !volumeId || hostTimeVolumeNames.has(volumeId)) return null
      return {
        volumeId,
        sourceKind,
        sourceName,
        index,
      }
    })
    .filter(
      (
        item
      ): item is {
        volumeId: string
        sourceKind: "configMap" | "secret"
        sourceName: string
        index: number
      } => Boolean(item)
    )
    .map((configItem) => {
      const allContainers = [
        ...(Array.isArray(podSpec.containers) ? podSpec.containers : []),
        ...(Array.isArray(podSpec.initContainers) ? podSpec.initContainers : []),
      ]
      const mounts = allContainers
        .map((entry) => asObject(entry))
        .flatMap((container) => {
          const containerName = asString(container.name).trim()
          const volumeMounts = Array.isArray(container.volumeMounts) ? container.volumeMounts : []
          return volumeMounts
            .map((mount) => asObject(mount))
            .filter((mount) => asString(mount.name).trim() === configItem.volumeId)
            .map((mount) => ({
              containerName,
              mountMode: mount.readOnly === true ? ("ro" as const) : ("none" as const),
              mountPath: asString(mount.mountPath).trim(),
            }))
        })
        .filter((mount) => mount.containerName.length > 0)

      return {
        sourceKind: configItem.sourceKind,
        sourceName: configItem.sourceName,
        mounts,
      }
    })

  return {
    name: asString(metadata.name) || row.name,
    namespace: asString(metadata.namespace) || row.namespace,
    description: asString(annotations.description),
    labels: Object.fromEntries(
      Object.entries(labels).filter(([, value]) => typeof value === "string")
    ) as Record<string, string>,
    annotations: Object.fromEntries(
      Object.entries(annotations).filter(([, value]) => typeof value === "string")
    ) as Record<string, string>,
    schedule: kind === "CronJob" ? asString(spec.schedule).trim() || DEFAULT_CRON_SCHEDULE : undefined,
    strategy: {
      backoffLimit: toOptionalIntegerString(strategySource.backoffLimit),
      completions: toOptionalIntegerString(strategySource.completions),
      parallelism: toOptionalIntegerString(strategySource.parallelism),
      activeDeadlineSeconds: toOptionalIntegerString(strategySource.activeDeadlineSeconds),
    },
    pod: {
      restartPolicy: asString(podSpec.restartPolicy) === "OnFailure" ? "OnFailure" : "Never",
      ...(parsedConfigList.length > 0 ? { configList: parsedConfigList } : {}),
      ...(resolvedStorageList.length > 0 ? { storage: resolvedStorageList[0] } : {}),
      ...(resolvedStorageList.length > 0 ? { storageList: resolvedStorageList } : {}),
      containers,
    },
  }
}

export function JobsPageClient() {
  const t = useTranslations()
  const [rows, setRows] = React.useState<JobRow[]>([])
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [editDialogOpen, setEditDialogOpen] = React.useState(false)
  const [editInitialValues, setEditInitialValues] = React.useState<JobDialogInitialValues | null>(null)
  const [editKind, setEditKind] = React.useState<JobRow["kind"]>("Job")
  const [createNamespaceOptions, setCreateNamespaceOptions] = React.useState<
    Array<{ id: string; name: string }>
  >([])
  const [, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [jobType, setJobType] = React.useState<JobRow["kind"]>("Job")
  const [namespaceQuery, setNamespaceQuery] = React.useState("")
  const [nameQuery, setNameQuery] = React.useState("")
  const [yamlOpen, setYamlOpen] = React.useState(false)
  const [yamlContent, setYamlContent] = React.useState("")
  const [yamlLoading, setYamlLoading] = React.useState(false)
  const [yamlError, setYamlError] = React.useState<string | null>(null)
  const [yamlSubtitle, setYamlSubtitle] = React.useState(t("actions.viewYamlSubtitle"))
  const [describeOpen, setDescribeOpen] = React.useState(false)
  const [describeContent, setDescribeContent] = React.useState("")
  const [describeLoading, setDescribeLoading] = React.useState(false)
  const [describeError, setDescribeError] = React.useState<string | null>(null)
  const [describeSubtitle, setDescribeSubtitle] = React.useState(t("actions.viewDetailsSubtitle"))
  const [pendingDeleteRow, setPendingDeleteRow] = React.useState<JobRow | null>(null)
  const [deleting, setDeleting] = React.useState(false)

  // 先获取翻译的字符串，避免在 React 元素内直接调用 t 函数导致菜单问题
  const viewYamlText = t("actions.viewYaml")
  const viewDetailsText = t("actions.details")
  const editText = t("actions.edit")
  const deleteText = t("actions.delete")
  const apiRequestFailedText = t("actions.apiRequestFailed")

  const handleViewYaml = React.useCallback((row: JobRow) => {
    const resource = JOB_RESOURCE_BY_KIND[row.kind]
    const yamlOptions =
      row.kind === "Job"
        ? ({
            documentType: "job" as const,
          })
        : ({
            documentType: "cronjob" as const,
          })
    setYamlOpen(true)
    setYamlError(null)
    setYamlLoading(true)
    setYamlContent("")
    setYamlSubtitle(t("actions.viewYamlSubtitleWithName", { kind: row.kind, namespace: row.namespace, name: row.name }))

    void fetchNamespacedResourceYaml(resource, row.namespace, row.name, yamlOptions)
      .then(({ payload, text }) => {
        setYamlContent(text)
        console.log("[Jobs] view yaml response", {
          kind: row.kind,
          resource,
          job: { name: row.name, namespace: row.namespace },
          result: payload,
        })
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("actions.loadYamlFailed")
        setYamlError(message)
        console.error("[Jobs] view yaml request failed", {
          kind: row.kind,
          resource,
          job: { name: row.name, namespace: row.namespace },
          error: e,
        })
      })
      .finally(() => {
        setYamlLoading(false)
      })
  }, [t])

  const handleViewDescribe = React.useCallback((row: JobRow) => {
    const resource = JOB_RESOURCE_BY_KIND[row.kind]
    setDescribeOpen(true)
    setDescribeError(null)
    setDescribeLoading(true)
    setDescribeContent("")
    setDescribeSubtitle(t("actions.viewDetailsSubtitleWithName", { kind: row.kind, namespace: row.namespace, name: row.name }))

    void fetchResourceDescribe("batch", "v1", resource, row.name, row.namespace)
      .then(({ text }) => {
        setDescribeContent(text || t("actions.noOutput"))
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("actions.loadDetailsFailed")
        setDescribeError(message)
      })
      .finally(() => {
        setDescribeLoading(false)
      })
  }, [t])

  const requestDelete = React.useCallback((row: JobRow) => {
    setPendingDeleteRow(row)
  }, [])

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDeleteRow || deleting) return
    setDeleting(true)

    void deleteJob(pendingDeleteRow.kind, pendingDeleteRow.namespace, pendingDeleteRow.name)
      .then(() => {
        setPendingDeleteRow(null)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("actions.deleteFailed")
        setError(message)
        console.error("[Jobs] delete request failed", {
          kind: pendingDeleteRow.kind,
          job: { name: pendingDeleteRow.name, namespace: pendingDeleteRow.namespace },
          error: e,
        })
      })
      .finally(() => {
        setDeleting(false)
      })
  }, [deleting, pendingDeleteRow, t])

  const handleDeleteSelectedRows = React.useCallback((selectedRows: JobRow[]) => {
    if (selectedRows.length === 0) return
    void Promise.all(
      selectedRows.map((row) => deleteJob(row.kind, row.namespace, row.name))
    ).catch((e: unknown) => {
      const message = e instanceof Error ? e.message : t("actions.deleteFailed")
      setError(message)
      console.error("[Jobs] bulk delete request failed", e)
    })
  }, [t])

  const handleEdit = React.useCallback((row: JobRow) => {
    const resource = JOB_RESOURCE_BY_KIND[row.kind]
    void fetchResourceByName<unknown>("batch", "v1", resource, row.name, {
      namespace: row.namespace,
    })
      .then(({ payload }) => {
        setEditKind(row.kind)
        setEditInitialValues(parseJobInitialValues(row.kind, row, payload))
        setEditDialogOpen(true)
      })
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : t("actions.loadDetailsFailed")
        setError(message)
      })
  }, [t])

  const columns = React.useMemo(() => {
    const baseColumns = createColumns<JobRow>({
      columns: getJobColumns(t),
      includeActions: false,
    })

    const actionColumn: ColumnDef<JobRow> = {
      id: "actions",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const current = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex size-8 text-muted-foreground data-[state=open]:bg-muted focus-visible:ring-0 focus-visible:border-transparent"
                size="icon"
              >
                <IconDotsVertical />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => handleViewYaml(current)}>
                  <IconEye className="size-4" />
                  {viewYamlText}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleViewDescribe(current)}>
                  <IconInfoCircle className="size-4" />
                  {viewDetailsText}
                </DropdownMenuItem>
                {current.kind === "CronJob" ? (
                  <DropdownMenuItem onSelect={() => handleEdit(current)}>
                    <IconPencil className="size-4" />
                    {editText}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => requestDelete(current)}
                >
                  <IconTrash className="size-4" />
                  {deleteText}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    }

    return [...baseColumns, actionColumn]
  }, [handleEdit, handleViewDescribe, handleViewYaml, requestDelete, viewYamlText, viewDetailsText, editText, deleteText, t])

  const refreshRows = React.useCallback(async (silent: boolean) => {
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const [mapped, namespacesResult] = await Promise.all([
        fetchJobRows(),
        fetchNamespaces().catch(() => []),
      ])
      const namespaces = namespacesResult
      setRows(mapped)
      setCreateNamespaceOptions(
        namespaces
          .map((item) => ({ id: item.name, name: item.name }))
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      setError(null)
    } catch (e: unknown) {
      if (!silent) {
        setRows([])
        setError(e instanceof Error ? e.message : apiRequestFailedText)
      } else {
        console.error("[Jobs] polling refresh failed", e)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiRequestFailedText])

  const handleCreateSubmit = React.useCallback(
    async (payload: Parameters<typeof createJob>[0]) => {
      await createJob(payload)
      await refreshRows(false)
    },
    [refreshRows]
  )

  const handleEditSubmit = React.useCallback(
    async (payload: Parameters<typeof updateJob>[0]) => {
      await updateJob(payload)
      await refreshRows(false)
    },
    [refreshRows]
  )

  React.useEffect(() => {
    void refreshRows(false)
  }, [refreshRows])

  useIntervalRefresh(() => refreshRows(true), 3000)

  const namespaceOptions = React.useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.namespace)))
        .sort((a, b) => a.localeCompare(b))
        .map((namespace) => ({ id: namespace, name: namespace })),
    [rows]
  )

  // if (loading) return <ResourceLoadingState /> // kept for potential future use
  if (error) {
    return (
      <div className="px-4 lg:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("actions.loadFailed")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  const nsQuery = namespaceQuery.trim().toLowerCase()
  const nmQuery = nameQuery.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (row.kind !== jobType) return false
    if (nsQuery && row.namespace.toLowerCase() !== nsQuery) return false
    if (nmQuery && !row.name.toLowerCase().includes(nmQuery)) return false
    return true
  })

  const jobTabs = (
    <Tabs value={jobType} onValueChange={(value) => setJobType(value as JobRow["kind"])} className="w-fit">
      <TabsList>
        <TabsTrigger value="Job">{t("actions.job")}</TabsTrigger>
        <TabsTrigger value="CronJob">{t("actions.cronJob")}</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  const jobFilters = (
    <>
      <FilterCombobox
        options={namespaceOptions}
        value={namespaceQuery}
        onValueChange={setNamespaceQuery}
        placeholder={t("table.columns.namespace")}
        emptyText={t("actions.noNamespaceFound")}
        className="w-40"
      />
      <Input
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder={t("table.columns.name")}
        className="h-9 w-40"
      />
    </>
  )

  return (
    <>
      <CreateJobDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        kind={jobType}
        namespaceOptions={createNamespaceOptions}
        onSubmit={handleCreateSubmit}
      />
      <CreateJobDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open)
          if (!open) {
            setEditInitialValues(null)
          }
        }}
        mode="edit"
        kind={editKind}
        namespaceOptions={createNamespaceOptions}
        initialValues={editInitialValues}
        onSubmit={handleEditSubmit}
      />
      <DescribeViewerDialog
        title={t("actions.viewDetailsTitle")}
        subtitle={describeSubtitle}
        open={describeOpen}
        onOpenChange={setDescribeOpen}
        content={describeContent}
        loading={describeLoading}
        error={describeError}
      />
      <MonacoViewerDialog
        title={t("actions.viewYamlTitle")}
        subtitle={yamlSubtitle}
        open={yamlOpen}
        onOpenChange={setYamlOpen}
        value={yamlContent}
        language="yaml"
        loading={yamlLoading}
        error={yamlError}
      />
      <DeleteConfirmDialog
        open={Boolean(pendingDeleteRow)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDeleteRow(null)
        }}
        title={pendingDeleteRow?.kind === "CronJob" ? t("actions.deleteCronJobTitle") : t("actions.deleteJobTitle")}
        description={
          pendingDeleteRow
            ? (pendingDeleteRow.kind === "CronJob" 
              ? t("actions.deleteCronJobDescription", { name: pendingDeleteRow.name })
              : t("actions.deleteJobDescription", { name: pendingDeleteRow.name }))
            : ""
        }
        deleting={deleting}
        onConfirm={handleConfirmDelete}
      />
      <DataTable
        data={filteredRows}
        columns={columns}
        onCreate={() => setCreateDialogOpen(true)}
        toolbarStart={jobTabs}
        toolbarEnd={jobFilters}
        onDeleteSelectedRows={handleDeleteSelectedRows}
      />
    </>
  )
}

