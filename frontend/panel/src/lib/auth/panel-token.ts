"use server";

import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";

export async function resolvePanelApiToken(): Promise<string> {
  const store = await cookies();
  const token =
    store.get(ACCESS_TOKEN_COOKIE)?.value ||
    store.get("talia.access_token")?.value ||
    store.get("sb-access-token")?.value ||
    store.get("access_token")?.value;

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
