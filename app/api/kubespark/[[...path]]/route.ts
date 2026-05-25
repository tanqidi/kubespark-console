import { NextResponse, type NextRequest } from "next/server";

// Default upstream used when KUBESPARK_API_BASE is not provided.
// If you see 502, check the returned JSON for `upstreamUrl` and ensure it is reachable.
const DEFAULT_UPSTREAM = "http://127.0.0.1:8080";
const upstreamBase = process.env.KUBESPARK_API_BASE || DEFAULT_UPSTREAM;

function buildUpstreamUrl(req: NextRequest, pathSegments?: string[]) {
  const base = upstreamBase.endsWith("/") ? upstreamBase : `${upstreamBase}/`;
  const joined = pathSegments && pathSegments.length ? pathSegments.join("/") : "";
  const url = new URL(joined, base);
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value);
  });
  return url.toString();
}

type RouteContext = { params: Promise<{ path?: string[] }> } | { params: { path?: string[] } };

async function proxyUpstream(req: NextRequest, method: string, context: RouteContext) {
  const resolved = "then" in context.params ? await context.params : context.params;
  const upstreamUrl = buildUpstreamUrl(req, resolved.path);

  try {
    // 构建请求头，透传 Authorization 等重要 header
    const headers: Record<string, string> = {
      accept: req.headers.get("accept") || "*/*",
      "content-type": req.headers.get("content-type") || "application/json",
    };

    // 透传 Authorization header（如果存在）
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      headers["authorization"] = authHeader;
    }

    const res = await fetch(upstreamUrl, {
      method,
      headers,
      cache: "no-store",
      // GET/HEAD 不能带 body，其它方法按原样透传
      body: method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer(),
    });

    const responseHeaders = new Headers();
    const contentType = res.headers.get("content-type");
    const cacheControl = res.headers.get("cache-control");
    if (contentType) responseHeaders.set("content-type", contentType);
    if (cacheControl) responseHeaders.set("cache-control", cacheControl);
    if (contentType?.includes("text/plain")) {
      responseHeaders.set("cache-control", cacheControl ? `${cacheControl}, no-transform` : "no-cache, no-transform");
      responseHeaders.set("x-accel-buffering", "no");
    }

    const body = res.body
      ? new ReadableStream({
          async start(controller) {
            const reader = res.body!.getReader();
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                if (value) controller.enqueue(value);
              }
            } finally {
              reader.releaseLock();
              controller.close();
            }
          },
          cancel() {
            void res.body?.cancel();
          },
        })
      : null;

    // Stream upstream response body chunk-by-chunk so follow/log endpoints can flush in real time.
    return new NextResponse(body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`Proxy ${method} /api/kubespark error`, { upstreamUrl, error });
    return NextResponse.json(
      { message: "无法请求后端接口（代理层连接失败）", upstreamUrl, detail: String(error) },
      { status: 502 },
    );
  }
}


export async function GET(req: NextRequest, context: RouteContext) {
  return proxyUpstream(req, "GET", context);
}

export async function POST(req: NextRequest, context: RouteContext) {
  return proxyUpstream(req, "POST", context);
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return proxyUpstream(req, "PUT", context);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return proxyUpstream(req, "DELETE", context);
}
