"use server";

type RpcOptions = {
  body?: Record<string, unknown> | null;
};

type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function resolveSupabaseUrl(): string {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL_PUBLIC;
  if (!url) {
    throw new Error("Configura SUPABASE_URL para consultar las visitas.");
  }
  return url.replace(/\/+$/, "");
}

function resolveServiceRole(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_API_KEY;
  if (!key) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE para consultar las visitas.");
  }
  return key;
}

export async function callSupabaseRpc<T = unknown>(
  functionName: string,
  options: RpcOptions = {},
): Promise<RpcResult<T>> {
  let baseUrl: string;
  let serviceRole: string;
  try {
    baseUrl = resolveSupabaseUrl();
    serviceRole = resolveServiceRole();
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
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
    cache: "no-store",
    body: options.body ? JSON.stringify(options.body) : null,
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: await readErrorMessage(response),
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

async function readErrorMessage(response: Response): Promise<string> {
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
