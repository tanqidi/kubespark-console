import { API_PROXY_BASE, fetchJsonDeduped } from "./common";
import { parseQuantityCpu, parseQuantityMemGi } from "./utils";

export type NodeStatusKey = "ready" | "unschedulable" | "offline";
export type NodeRoleKey = "controlPlane" | "worker" | "unknown";

export type NodeRowApi = {
  id: string;
  name: string;
  ip: string;
  status: NodeStatusKey;
  role: NodeRoleKey;
  cpuTotal: number;
  memoryTotal: number;
  podsTotal: number;
};

type RawNode = {
  metadata?: { uid?: string; name?: string; labels?: Record<string, string> };
  spec?: { unschedulable?: boolean };
  status?: {
    addresses?: Array<{ type?: string; address?: string }>;
    conditions?: Array<{ type?: string; status?: string }>;
    capacity?: { cpu?: string; memory?: string };
    allocatable?: { pods?: string };
  };
};

const NODES_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/nodes`;

function roleFromLabels(labels?: Record<string, string>): NodeRoleKey {
  if (!labels) return "unknown";
  if ("node-role.kubernetes.io/control-plane" in labels || "node-role.kubernetes.io/master" in labels) return "controlPlane";
  return "worker";
}

function statusFromNode(node: RawNode): NodeStatusKey {
  const ready = node.status?.conditions?.find((c) => c.type === "Ready")?.status === "True";
  if (!ready) return "offline";
  return node.spec?.unschedulable ? "unschedulable" : "ready";
}

export async function fetchNodes(): Promise<NodeRowApi[]> {
  const data = await fetchJsonDeduped<{ items?: RawNode[] }>(NODES_ENDPOINT);
  const items = Array.isArray(data?.items) ? data.items : [];

  return items.map((item) => {
    const metadata = item.metadata || {};
    const status = item.status || {};
    const ip = status.addresses?.find((a) => a.type === "InternalIP")?.address || "-";

    return {
      id: metadata.uid || metadata.name || Math.random().toString(36).slice(2),
      name: metadata.name || "-",
      ip,
      status: statusFromNode(item),
      role: roleFromLabels(metadata.labels),
      cpuTotal: parseQuantityCpu(status.capacity?.cpu),
      memoryTotal: parseQuantityMemGi(status.capacity?.memory),
      podsTotal: Number(status.allocatable?.pods || 0)
    };
  });
}
