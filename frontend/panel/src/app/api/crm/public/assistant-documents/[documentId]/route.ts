import { getPanelApiBaseUrl } from "@/lib/api/panel"

function buildTargetUrl(request: Request, documentId: string): URL {
  let backendBase: string
  try {
    backendBase = getPanelApiBaseUrl()
  } catch {
    backendBase = process.env.PANEL_API_FALLBACK_URL?.trim() || "http://127.0.0.1:8004"
  }
  const target = new URL(`${backendBase}/crm/public/assistant-documents/${encodeURIComponent(documentId)}`)
  const source = new URL(request.url)
  source.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value)
  })
  return target
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params
  let targetUrl: URL
  try {
    targetUrl = buildTargetUrl(request, documentId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: request.headers.get("accept") || "application/pdf",
        "User-Agent": request.headers.get("user-agent") || "talia-panel-proxy",
        ...(request.headers.get("x-forwarded-for")
          ? { "X-Forwarded-For": request.headers.get("x-forwarded-for") as string }
          : {}),
        ...(request.headers.get("x-real-ip")
          ? { "X-Real-IP": request.headers.get("x-real-ip") as string }
          : {}),
        ...(request.headers.get("x-forwarded-proto")
          ? { "X-Forwarded-Proto": request.headers.get("x-forwarded-proto") as string }
          : {}),
        ...(request.headers.get("referer")
          ? { Referer: request.headers.get("referer") as string }
          : {}),
      },
      cache: "no-store",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    })
  }

  const headers = new Headers()
  const contentType = backendResponse.headers.get("content-type")
  if (contentType) {
    headers.set("content-type", contentType)
  }
  const contentDisposition = backendResponse.headers.get("content-disposition")
  if (contentDisposition) {
    headers.set("content-disposition", contentDisposition)
  }
  const cacheControl = backendResponse.headers.get("cache-control")
  if (cacheControl) {
    headers.set("cache-control", cacheControl)
  }

  const body = await backendResponse.arrayBuffer()
  return new Response(body, {
    status: backendResponse.status,
    headers,
  })
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params
  let targetUrl: URL
  try {
    targetUrl = buildTargetUrl(request, documentId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(targetUrl, {
      method: "HEAD",
      headers: {
        Accept: request.headers.get("accept") || "application/pdf",
        "User-Agent": request.headers.get("user-agent") || "talia-panel-proxy",
        ...(request.headers.get("x-forwarded-for")
          ? { "X-Forwarded-For": request.headers.get("x-forwarded-for") as string }
          : {}),
        ...(request.headers.get("x-real-ip")
          ? { "X-Real-IP": request.headers.get("x-real-ip") as string }
          : {}),
        ...(request.headers.get("x-forwarded-proto")
          ? { "X-Forwarded-Proto": request.headers.get("x-forwarded-proto") as string }
          : {}),
        ...(request.headers.get("referer")
          ? { Referer: request.headers.get("referer") as string }
          : {}),
      },
      cache: "no-store",
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json" },
    })
  }

  const headers = new Headers()
  const contentType = backendResponse.headers.get("content-type")
  if (contentType) {
    headers.set("content-type", contentType)
  }
  const contentDisposition = backendResponse.headers.get("content-disposition")
  if (contentDisposition) {
    headers.set("content-disposition", contentDisposition)
  }
  const cacheControl = backendResponse.headers.get("cache-control")
  if (cacheControl) {
    headers.set("cache-control", cacheControl)
  }
  return new Response(null, {
    status: backendResponse.status,
    headers,
  })
}
