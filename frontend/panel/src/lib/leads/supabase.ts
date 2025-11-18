"use server";

import { cookies } from "next/headers";

type RpcOptions = {
  body?: Record<string, unknown> | null;
};

type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type RestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string | undefined>;
  body?: unknown;
};

function resolveSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL_PUBLIC;
  if (!url) {
    throw new Error("Configura SUPABASE_URL para consultar los leads.");
  }
  return url.replace(/\/+$/, "");
}

function resolveAnonKey(): string | undefined {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLIC_ANON_KEY ||
    process.env.SUPABASE_KEY
  );
}

async function readAccessTokenFromCookies(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    return (
      cookieStore.get("talia.access_token")?.value ||
      cookieStore.get("sb-access-token")?.value ||
      cookieStore.get("access_token")?.value
    );
  } catch {
    return undefined;
  }
}

async function resolveAuthHeaders(): Promise<{ apikey: string; token: string }> {
  const anonKey = resolveAnonKey();
  if (!anonKey) {
    throw new Error("Supabase no está configurado (falta la anon key).");
  }

  const accessToken = await readAccessTokenFromCookies();
  if (!accessToken) {
    throw new Error("Sesión no disponible. Inicia sesión nuevamente.");
  }

  return { apikey: anonKey, token: accessToken };
}

export async function callSupabaseRpc<T = unknown>(
  functionName: string,
  options: RpcOptions = {},
): Promise<RpcResult<T>> {
  let baseUrl: string;
  let auth: { apikey: string; token: string };

  try {
    baseUrl = resolveSupabaseUrl();
    auth = await resolveAuthHeaders();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Supabase no está configurado.",
    };
  }

  const response = await fetch(`${baseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: auth.apikey,
      Authorization: `Bearer ${auth.token}`,
      Prefer: "return=representation",
    },
    cache: "no-store",
    body: options.body ? JSON.stringify(options.body) : null,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await mapResponseError(response),
    };
  }

  try {
    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: `Respuesta inválida de Supabase (${(error as Error).message})`,
    };
  }
}

export async function callSupabaseRest<T = unknown>(
  path: string,
  options: RestOptions = {},
): Promise<RpcResult<T>> {
  let baseUrl: string;
  let auth: { apikey: string; token: string };

  try {
    baseUrl = resolveSupabaseUrl();
    auth = await resolveAuthHeaders();
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Supabase no está configurado.",
    };
  }

  const sanitizedPath = path.replace(/^\/+/, "");
  const url = new URL(`${baseUrl}/rest/v1/${sanitizedPath}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = {
    Accept: "application/json",
    apikey: auth.apikey,
    Authorization: `Bearer ${auth.token}`,
    ...(options.headers ?? {}),
  };

  let body: BodyInit | undefined;
  if (options.body != null && method !== "GET" && method !== "HEAD") {
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    body =
      typeof options.body === "string" || options.body instanceof FormData
        ? (options.body as BodyInit)
        : JSON.stringify(options.body);
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    cache: "no-store",
    ...(body ? { body } : {}),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await mapResponseError(response),
    };
  }

  if (response.status === 204 || method === "HEAD") {
    return { ok: true, data: ([] as unknown) as T };
  }

  const text = await response.text();
  if (!text.length) {
    return { ok: true, data: ([] as unknown) as T };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: `Respuesta inválida de Supabase (${(error as Error).message})`,
    };
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
          json.error ||
          `Error ${response.status}`
        ) as string;
      }
      return text;
    } catch {
      return text;
    }
  } catch {
    return `Error ${response.status}`;
  }
}
