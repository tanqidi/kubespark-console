export const API_PROXY_BASE = process.env.NEXT_PUBLIC_API_PROXY_BASE || "/api/kubespark";

const inFlightGet = new Map<string, Promise<unknown>>();

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kubespark_token") || sessionStorage.getItem("kubespark_token");
}

export async function fetchJsonDeduped<T>(url: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || "GET").toUpperCase();
  const key = `${method} ${url}`;

  if (method === "GET") {
    const existing = inFlightGet.get(key);
    if (existing) return existing as Promise<T>;
  }

  const p = (async () => {
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

    const res = await fetch(url, { cache: "no-store", ...init, headers });
    if (!res.ok) {
      if (res.status === 401) {
        if (typeof window !== "undefined") {
          const currentPath = window.location.pathname + window.location.search;
          window.location.href = currentPath !== "/login" ? `/login?redirect=${encodeURIComponent(currentPath)}` : "/login";
          return new Promise<T>(() => {});
        }
        throw new Error("未授权，请先登录");
      }

      let detail = "";
      try {
        const text = await res.text();
        detail = text ? `: ${text.slice(0, 300)}` : "";
      } catch {}
      throw new Error(`请求失败，状态码 ${res.status}${detail}`);
    }

    const json = (await res.json()) as unknown;
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if ("code" in obj || "data" in obj) {
        const env = json as ApiEnvelope<T>;
        const code = env.code ?? 200;
        if (code !== 200) throw new Error(env.message || `后端返回错误 code=${code}`);
        return (env.data as T) ?? ({} as T);
      }
    }
    return json as T;
  })();

  if (method === "GET") {
    inFlightGet.set(key, p);
    p.finally(() => inFlightGet.delete(key));
  }
  return p;
}

export async function deleteResource(group: string, version: string, resource: string, name: string, namespace?: string): Promise<void> {
  const nsQuery = namespace ? `?namespace=${encodeURIComponent(namespace)}` : "";
  const url = `${API_PROXY_BASE}/kapis/resources.kubespark.io/v1alpha1/resources/${encodeURIComponent(group)}/${encodeURIComponent(version)}/${encodeURIComponent(resource)}/${encodeURIComponent(name)}${nsQuery}`;
  await fetchJsonDeduped<unknown>(url, { method: "DELETE" });
}
