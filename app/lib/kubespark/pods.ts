import { API_PROXY_BASE, fetchJsonDeduped } from "./common";
import { formatAge } from "./utils";

export type PodStatusKey = "running" | "pending" | "failed" | "succeeded" | "unknown";
export type PodRow = {
  id: string;
  name: string;
  namespace: string;
  status: PodStatusKey;
  node: string;
  age: string;
};

type RawPod = {
  metadata?: { uid?: string; name?: string; namespace?: string; creationTimestamp?: string };
  status?: { phase?: string; hostIP?: string };
  spec?: { nodeName?: string };
};

const PODS_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/pods`;

function phaseToStatusKey(phase?: string): PodStatusKey {
  switch (phase) {
    case "Running":
      return "running";
    case "Pending":
      return "pending";
    case "Failed":
      return "failed";
    case "Succeeded":
      return "succeeded";
    default:
      return "unknown";
  }
}

export async function fetchPods(): Promise<PodRow[]> {
  const data = await fetchJsonDeduped<{ items?: RawPod[] }>(PODS_ENDPOINT);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item) => ({
    id: item.metadata?.uid || item.metadata?.name || Math.random().toString(36).slice(2),
    name: item.metadata?.name || "-",
    namespace: item.metadata?.namespace || "default",
    status: phaseToStatusKey(item.status?.phase),
    node: item.spec?.nodeName || item.status?.hostIP || "-",
    age: formatAge(item.metadata?.creationTimestamp)
  }));
}
