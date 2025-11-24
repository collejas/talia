"use server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import type { PortalEstadoResponse } from "@/types/clientes";

export async function loadPortalEstado(token: string): Promise<PortalEstadoResponse> {
  const baseUrl = getPanelApiBaseUrl();
  const response = await fetch(`${baseUrl}/crm/portal/clientes/${token}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    let message = "No se pudo cargar la información del portal.";
    try {
      const payload = JSON.parse(text);
      if (payload && typeof payload.detail === "string") {
        message = payload.detail;
      } else if (payload && typeof payload.error === "string") {
        message = payload.error;
      }
    } catch {
      if (text && !text.startsWith("<")) {
        message = text;
      }
    }
    throw new Error(message);
  }

  const payload = (await response.json()) as PortalEstadoResponse;
  const portal = payload.portal;
  if (portal.revocado) {
    throw new Error("Este enlace fue revocado por el equipo de Tal-IA.");
  }
  if (portal.expira_en) {
    const expiration = Date.parse(portal.expira_en);
    if (!Number.isNaN(expiration) && expiration < Date.now()) {
      throw new Error("El enlace del portal ha expirado. Solicita uno nuevo a tu ejecutivo.");
    }
  }
  return payload;
}
