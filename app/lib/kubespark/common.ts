export const API_PROXY_BASE = process.env.NEXT_PUBLIC_API_PROXY_BASE || "/api/kubespark";
const RESOURCE_ENDPOINT_BASE = `${API_PROXY_BASE}/kapis/v1alpha1/resources`;

const inFlightGet = new Map<string, Promise<unknown>>();

type ApiEnvelope<T> = {
  code?: number;
  message?: string;
  data?: T;
};

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function unwrapItems(payload: unknown): unknown[] {
  const root = asObject(payload);
  const container = root.data ?? payload;
  const items = asObject(container).items;
  return Array.isArray(items) ? items : [];
}

export type ResourceListQuery = {
  namespace?: string;
  fieldSelector?: string;
  labelSelector?: string;
};

export type ResourceCollectionResult<T> = {
  requestUrl: string;
  payload: unknown;
  items: T[];
};

export type ResourceByNameQuery = {
  namespace?: string;
  labelSelector?: string;
  fieldSelector?: string;
};

export type ResourceByNameResult<T> = {
  requestUrl: string;
  payload: T;
};

export function buildResourceCollectionEndpoint(
  group: string,
  version: string,
  resource: string,
  query?: ResourceListQuery,
): string {
  const searchParams = new URLSearchParams();
  if (query?.namespace) searchParams.set("namespace", query.namespace);
  if (query?.fieldSelector) searchParams.set("fieldSelector", query.fieldSelector);
  if (query?.labelSelector) searchParams.set("labelSelector", query.labelSelector);

  const base = `${RESOURCE_ENDPOINT_BASE}/${encodeURIComponent(group)}/${encodeURIComponent(version)}/${encodeURIComponent(resource)}`;
  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

export async function fetchResourceCollection<T = unknown>(
  group: string,
  version: string,
  resource: string,
  query?: ResourceListQuery,
): Promise<ResourceCollectionResult<T>> {
  const requestUrl = buildResourceCollectionEndpoint(group, version, resource, query);
  const payload = await fetchJsonDeduped<unknown>(requestUrl);
  return {
    requestUrl,
    payload,
    items: unwrapItems(payload) as T[],
  };
}

export function buildResourceItemEndpoint(
  group: string,
  version: string,
  resource: string,
  name: string,
  namespace?: string,
): string {
  const searchParams = new URLSearchParams();
  if (namespace) searchParams.set("namespace", namespace);

  const base = `${RESOURCE_ENDPOINT_BASE}/${encodeURIComponent(group)}/${encodeURIComponent(version)}/${encodeURIComponent(resource)}/${encodeURIComponent(name)}`;
  const queryString = searchParams.toString();
  return queryString ? `${base}?${queryString}` : base;
}

function readMetadataName(value: unknown): string | undefined {
  const metadata = asObject(asObject(value).metadata);
  const name = metadata.name;
  return typeof name === "string" && name.length > 0 ? name : undefined;
}

export async function fetchResourceByName<T = unknown>(
  group: string,
  version: string,
  resource: string,
  name: string,
  query?: ResourceByNameQuery,
): Promise<ResourceByNameResult<T>> {
  const fieldSelector = query?.fieldSelector ?? `metadata.name=${name}`;
  const { requestUrl, items } = await fetchResourceCollection<T>(group, version, resource, {
    namespace: query?.namespace,
    labelSelector: query?.labelSelector,
    fieldSelector,
  });

  const matched = items.find((item) => readMetadataName(item) === name) ?? items[0];
  if (!matched) {
    throw new Error(`Resource not found: ${resource}/${name}`);
  }

  return {
    requestUrl,
    payload: matched,
  };
}

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

      let detailMessage = "";
      try {
        const text = await res.text();
        if (text) {
          try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            const message = parsed?.message;
            if (typeof message === "string" && message.trim()) {
              detailMessage = message.trim();
            } else {
              detailMessage = text.slice(0, 300);
            }
          } catch {
            detailMessage = text.slice(0, 300);
          }
        }
      } catch {}

      throw new Error(
        detailMessage
          ? `请求失败，状态码 ${res.status}：${detailMessage}`
          : `请求失败，状态码 ${res.status}`
      );
    }

    const json = (await res.json()) as unknown;
    if (json && typeof json === "object") {
      const obj = json as Record<string, unknown>;
      if ("code" in obj || "data" in obj) {
        const env = json as ApiEnvelope<T>;
        const code = env.code ?? 200;
        if (code !== 200 && code !== 0) {
          throw new Error(env.message || `后端返回错误 code=${code}`);
        }
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

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { cache: "no-store", ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = currentPath !== "/login" ? `/login?redirect=${encodeURIComponent(currentPath)}` : "/login";
        return new Promise<string>(() => {});
      }
      throw new Error("未授权，请先登录");
    }

    let detailMessage = "";
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const message = parsed?.message;
          if (typeof message === "string" && message.trim()) {
            detailMessage = message.trim();
          } else {
            detailMessage = text.slice(0, 300);
          }
        } catch {
          detailMessage = text.slice(0, 300);
        }
      }
    } catch {}

    throw new Error(
      detailMessage
        ? `请求失败，状态码 ${res.status}：${detailMessage}`
        : `请求失败，状态码 ${res.status}`
    );
  }

  return res.text();
}

export async function fetchTextStream(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { cache: "no-store", ...init, headers });
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = currentPath !== "/login" ? `/login?redirect=${encodeURIComponent(currentPath)}` : "/login";
        return new Promise<Response>(() => {});
      }
      throw new Error("未授权，请先登录");
    }

    let detailMessage = "";
    try {
      const text = await res.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;
          const message = parsed?.message;
          if (typeof message === "string" && message.trim()) {
            detailMessage = message.trim();
          } else {
            detailMessage = text.slice(0, 300);
          }
        } catch {
          detailMessage = text.slice(0, 300);
        }
      }
    } catch {}

    throw new Error(
      detailMessage
        ? `请求失败，状态码 ${res.status}：${detailMessage}`
        : `请求失败，状态码 ${res.status}`
    );
  }

  return res;
}

export async function deleteResource(group: string, version: string, resource: string, name: string, namespace?: string): Promise<void> {
  const url = buildResourceItemEndpoint(group, version, resource, name, namespace);
  await fetchJsonDeduped<unknown>(url, { method: "DELETE" });
}
