"use server";

import { resolveServerAccessToken } from "@/lib/auth/server-session";

export async function resolvePanelApiToken(): Promise<string> {
  const token = await resolveServerAccessToken({ minTtlSeconds: 300 });

  if (token && token.trim().length) {
    return token;
  }

  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_API_KEY;

  if (!serviceRole) {
    throw new Error("No se encontró token para contactar el backend del panel.");
  }
  return serviceRole;
}
