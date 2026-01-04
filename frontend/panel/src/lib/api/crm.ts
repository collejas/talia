"use server";

import { Buffer } from "node:buffer";
import { cookies } from "next/headers";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

type CrmFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  searchParams?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  organizacionId?: string;
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
  let userAccessToken: string | null = null;
  try {
    baseUrl = getPanelApiBaseUrl();
    token = await resolvePanelApiToken();
    if (options.withUserToken) {
      userAccessToken = await resolveCurrentAccessToken();
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Configura PANEL_API_URL y el token del panel.",
    };
  }

  const organizacionId = options.organizacionId ?? resolveDefaultOrganizacionId();
  const usuarioId = options.usuarioId ?? (await resolveCurrentUsuarioId());

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
    "X-Organizacion-Id": organizacionId,
    ...(options.headers ?? {}),
  };
  if (usuarioId) {
    headers["X-Usuario-Id"] = usuarioId;
  }
  if (options.withUserToken && userAccessToken) {
    headers["X-User-Token"] = userAccessToken;
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

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      cache: "no-store",
      ...(body ? { body } : {}),
    })
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? `Error al contactar el CRM (${error.message})`
          : "Error desconocido al contactar el CRM.",
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

function decodeJwtUserId(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  try {
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(decoded) as { sub?: string; user_id?: string };
    if (payload.sub && typeof payload.sub === "string") return payload.sub;
    if (payload.user_id && typeof payload.user_id === "string") return payload.user_id;
    return null;
  } catch {
    return null;
  }
}

async function mapResponseError(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "Tu sesión caducó. Vuelve a iniciar sesión.";
  }
  try {
    const text = await response.text();
    if (!text) return `Error ${response.status}`;
    try {
      const json = JSON.parse(text);
      if (typeof json === "string") return json;
      if (json && typeof json === "object") {
        return (
          json.error_description ||
          json.message ||
          json.detail ||
          json.error ||
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
