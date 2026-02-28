import { API_PROXY_BASE, fetchJsonDeduped } from "./common";
import { formatAge } from "./utils";

export type NamespaceRow = {
  id: string;
  name: string;
  status: string;
  labels: number;
  annotations: number;
  age: string;
};

type RawNamespace = {
  metadata?: {
    uid?: string;
    name?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    creationTimestamp?: string;
  };
  status?: { phase?: string };
};

const NAMESPACES_ENDPOINT = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/namespaces`;

export async function fetchNamespaces(): Promise<NamespaceRow[]> {
  const data = await fetchJsonDeduped<{ items?: RawNamespace[] }>(NAMESPACES_ENDPOINT);
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item) => {
    const md = item.metadata || {};
    return {
      id: md.uid || md.name || Math.random().toString(36).slice(2),
      name: md.name || "-",
      status: item.status?.phase || "Unknown",
      labels: Object.keys(md.labels || {}).length,
      annotations: Object.keys(md.annotations || {}).length,
      age: formatAge(md.creationTimestamp)
    };
  });
}
