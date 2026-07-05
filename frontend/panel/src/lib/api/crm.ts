"use server";

import { cookies } from "next/headers";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { ACCESS_TOKEN_COOKIE, TENANT_CONTEXT_COOKIE } from "@/lib/auth/cookies";
import { decodeJwtOrganizacionId, decodeJwtPayload, decodeJwtUserId } from "@/lib/auth/jwt";
import { parseTenantContextCookie } from "@/lib/auth/tenant-context";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { resolveServerAccessToken } from "@/lib/auth/server-session";

type CrmFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  searchParams?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  organizacionId?: string | null;
  usuarioId?: string | null;
  withUserToken?: boolean;
};

export type CrmResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

const CRM_ORG_ENV_KEYS = [
  "PANEL_ORGANIZACION_ID",
  "TALIA_ORGANIZACION_ID",
  "NEXT_PUBLIC_ORGANIZACION_ID",
] as const;

const CRM_USER_ENV_KEYS = [
  "PANEL_USUARIO_ID",
  "TALIA_USUARIO_ID",
  "NEXT_PUBLIC_USUARIO_ID",
] as const;

export async function callCrmApi<T = unknown>(
  path: string,
  options: CrmFetchOptions = {},
): Promise<CrmResult<T>> {
  let baseUrl: string;
  let token: string;
  let userAccessToken = await resolveCurrentAccessToken();
  const selectedOrganizacionId = await resolveSelectedOrganizacionId(userAccessToken);
  try {
    baseUrl = getPanelApiBaseUrl();
    token = await resolvePanelApiToken();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Configura PANEL_API_URL y el token del panel.",
    };
  }

  const usuarioId = options.usuarioId ?? (await resolveCurrentUsuarioId());
  let resolvedOrganizacionId: string | null | undefined;
  if (options.organizacionId !== undefined) {
    resolvedOrganizacionId = options.organizacionId;
  } else {
    resolvedOrganizacionId = selectedOrganizacionId ?? resolveDefaultOrganizacionId();
  }

  const sanitizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${sanitizedPath}`);
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(options.headers ?? {}),
  };
  if (resolvedOrganizacionId) {
    headers["X-Organizacion-Id"] = resolvedOrganizacionId;
  }
  if (usuarioId) {
    headers["X-Usuario-Id"] = usuarioId;
  }
  if (!userAccessToken) {
    const panelPayload = decodeJwtPayload(token);
    const panelRole = typeof panelPayload?.role === "string" ? panelPayload.role : null;
    if (panelRole && panelRole !== "service_role") {
      userAccessToken = token;
    }
  }
  const shouldSendUserToken = options.withUserToken ?? true;
  if (shouldSendUserToken && userAccessToken) {
    headers["X-User-Token"] = userAccessToken;
    if (!headers["X-Usuario-Id"]) {
      const tokenUserId = decodeJwtUserId(userAccessToken);
      if (tokenUserId) {
        headers["X-Usuario-Id"] = tokenUserId;
      }
    }
  }

  let body: BodyInit | undefined;
  const findHeaderKey = (name: string): string | undefined => {
    const target = name.toLowerCase();
    return Object.keys(headers).find((key) => key.toLowerCase() === target);
  };

  const hasHeader = (name: string): boolean => findHeaderKey(name) !== undefined;

  const removeHeader = (name: string) => {
    const key = findHeaderKey(name);
    if (key) {
      delete headers[key];
    }
  };

  if (options.body != null && method !== "GET") {
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    const isBlob = typeof Blob !== "undefined" && options.body instanceof Blob;
    const isArrayBuffer = options.body instanceof ArrayBuffer;
    const isUrlParams = options.body instanceof URLSearchParams;

    if (typeof options.body === "string") {
      if (!hasHeader("Content-Type")) {
        headers["Content-Type"] = "text/plain;charset=UTF-8";
      }
      body = options.body;
    } else if (isFormData || isBlob || isArrayBuffer || isUrlParams) {
      if (isFormData) {
        removeHeader("Content-Type");
      }
      body = options.body as BodyInit;
    } else {
      if (!hasHeader("Content-Type")) {
        headers["Content-Type"] = "application/json";
      }
      body = JSON.stringify(options.body) as BodyInit;
    }
  }

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const maxAttempts = 3
  const runFetchWithNetworkRetry = async (): Promise<{ response?: Response; lastError?: unknown }> => {
    let response: Response | undefined
    let lastError: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        response = await fetch(url.toString(), {
          method,
          headers,
          cache: "no-store",
          ...(body ? { body } : {}),
        })
        lastError = undefined
        break
      } catch (error) {
        lastError = error
        const rawError = error as unknown as { cause?: unknown }
        const cause = rawError?.cause as { code?: string } | undefined
        const retryableCodes = new Set(["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH"])
        const isRetryable = cause?.code && retryableCodes.has(cause.code)
        if (attempt < maxAttempts && isRetryable) {
          await sleep(250 * attempt)
          continue
        }
        break
      }
    }
    return { response, lastError }
  }

  let { response, lastError } = await runFetchWithNetworkRetry()

  if (response && (response.status === 401 || response.status === 403) && shouldSendUserToken) {
    const refreshedToken = await resolveServerAccessToken({ forceRefresh: true, minTtlSeconds: 0 })
    if (refreshedToken && refreshedToken !== userAccessToken) {
      userAccessToken = refreshedToken
      headers["Authorization"] = `Bearer ${refreshedToken}`
      headers["X-User-Token"] = refreshedToken
      const refreshedUserId = decodeJwtUserId(refreshedToken)
      if (refreshedUserId) {
        headers["X-Usuario-Id"] = refreshedUserId
      }
      const retried = await runFetchWithNetworkRetry()
      response = retried.response
      lastError = retried.lastError
    }
  }

  if (!response) {
    const errorMessage =
      lastError instanceof Error
        ? `Error al contactar el CRM (${lastError.message})`
        : "Error desconocido al contactar el CRM."
    const rawError = lastError as unknown as {
      name?: string
      message?: string
      stack?: string
      cause?: unknown
    }
    console.error("[crm] fetch_failed", {
      url: url.toString(),
      method,
      hasOrganizacionId: Boolean(resolvedOrganizacionId),
      hasUsuarioId: Boolean(usuarioId),
      withUserToken: Boolean(options.withUserToken),
      error:
        rawError?.message ??
        (lastError instanceof Error ? lastError.message : String(lastError)),
      errorName: rawError?.name,
      errorCause:
        typeof rawError?.cause === "object" && rawError.cause
          ? (rawError.cause as { code?: string; errno?: number; address?: string; port?: number })
          : rawError?.cause,
    })
    return {
      ok: false,
      error:
        `${errorMessage} (url=${url.toString()})`,
    }
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await mapResponseError(response),
    };
  }

  if (response.status === 204 || method === "DELETE") {
    return { ok: true, data: ([] as unknown) as T };
  }

  const text = await response.text();
  if (!text.length) {
    return { ok: true, data: ([] as unknown) as T };
  }

  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch (error) {
    return {
      ok: false,
      error: `Respuesta inválida del CRM (${(error as Error).message})`,
    };
  }
}

function resolveDefaultOrganizacionId(): string {
  for (const key of CRM_ORG_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim().length) {
      return value.trim();
    }
  }
  throw new Error(
    "Configura PANEL_ORGANIZACION_ID (o NEXT_PUBLIC_ORGANIZACION_ID) para contactar el CRM.",
  );
}

async function resolveCurrentUsuarioId(): Promise<string | null> {
  for (const key of CRM_USER_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim().length) {
      return value.trim();
    }
  }
  try {
    const store = await cookies();
    const token =
      store.get(ACCESS_TOKEN_COOKIE)?.value ||
      store.get("sb-access-token")?.value ||
      store.get("access_token")?.value;
    return decodeJwtUserId(token);
  } catch {
    return null;
  }
}

async function resolveCurrentAccessToken(): Promise<string | null> {
  const refreshedToken = await resolveServerAccessToken({ minTtlSeconds: 300 })
  if (refreshedToken) {
    return refreshedToken
  }
  try {
    const store = await cookies();
    const token =
      store.get(ACCESS_TOKEN_COOKIE)?.value ||
      store.get("sb-access-token")?.value ||
      store.get("access_token")?.value;
    return token ?? null;
  } catch {
    return null;
  }
}

async function resolveSelectedOrganizacionId(userAccessToken: string | null): Promise<string | null> {
  try {
    const store = await cookies();
    const tenantContext = parseTenantContextCookie(store.get(TENANT_CONTEXT_COOKIE)?.value ?? null);
    if (!tenantContext || !userAccessToken) {
      return decodeJwtOrganizacionId(userAccessToken);
    }

    const currentUserId = decodeJwtUserId(userAccessToken);
    if (!currentUserId || tenantContext.user_id !== currentUserId) {
      return decodeJwtOrganizacionId(userAccessToken);
    }

    return tenantContext.tenant_id || decodeJwtOrganizacionId(userAccessToken);
  } catch {
    return decodeJwtOrganizacionId(userAccessToken);
  }
}

async function mapResponseError(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    const isUnauthorized = response.status === 401
    const defaultMessage = isUnauthorized
      ? "Tu sesión caducó. Vuelve a iniciar sesión."
      : "No tienes permisos para esta acción."
    try {
      const text = await response.text();
      if (text) {
        // FastAPI suele responder {"detail": "..."}; a veces es string plano.
        try {
          const json = JSON.parse(text);
          const detail =
            typeof json === "string"
              ? json
              : typeof json?.detail === "string"
                ? json.detail
                : typeof json?.message === "string"
                  ? json.message
                  : "";
          if (detail === "platform_admin_required") {
            return "No tienes permisos de platform admin para ver Tenants. Agrega tu user_id a public.platform_admins.";
          }
          if (detail === "authorization_invalid" || detail.startsWith("auth_user_invalid")) {
            return "Tu sesión caducó. Vuelve a iniciar sesión.";
          }
          if (
            detail === "forbidden" ||
            detail === "owner_required" ||
            detail === "owner_scope_violation"
          ) {
            return "No tienes permisos para esta acción."
          }
          if (response.status === 403 && detail.length) {
            return `No tienes permisos (${detail}).`
          }
        } catch {
          if (text.includes("platform_admin_required")) {
            return "No tienes permisos de platform admin para ver Tenants. Agrega tu user_id a public.platform_admins.";
          }
          if (text.includes("forbidden")) {
            return "No tienes permisos para esta acción."
          }
        }
      }
    } catch {
      // ignore
    }
    return defaultMessage
  }
  try {
    const text = await response.text();
    if (!text) return `Error ${response.status}`;
    try {
      const json = JSON.parse(text);
      if (typeof json === "string") return json;
      if (json && typeof json === "object") {
        const detailObject = typeof json.detail === "object" && json.detail ? (json.detail as Record<string, unknown>) : null;
        const detailMessage =
          detailObject && typeof detailObject.message === "string" && detailObject.message.trim()
            ? detailObject.message.trim()
            : null;
        if (detailMessage) {
          return detailMessage;
        }
        const formatErrorValue = (value: unknown): string | null => {
          if (typeof value === "string") return value;
          if (typeof value === "number" || typeof value === "boolean") return value.toString();
          if (value === null || value === undefined) return null;
          try {
            return JSON.stringify(value);
          } catch {
            return String(value);
          }
        };

        return (
          formatErrorValue(json.error_description) ||
          formatErrorValue(json.message) ||
          formatErrorValue(json.detail) ||
          formatErrorValue(json.error) ||
          `Error ${response.status}`
        );
      }
      return text;
    } catch {
      return text;
    }
  } catch {
    return `Error ${response.status}`;
  }
}
