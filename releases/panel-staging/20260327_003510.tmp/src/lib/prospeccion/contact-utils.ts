"use client";

import type { ContactoEnvio } from "@/lib/prospeccion/prospectos-client";

export function contactStatusLabel(value: string | undefined) {
  if (!value) return "Pendiente";
  const normalized = value.toLowerCase();
  switch (normalized) {
    case "enviado":
      return "Enviado";
    case "omitido":
      return "Omitido";
    case "error":
      return "Error";
    case "pendiente":
      return "Pendiente";
    default:
      return normalized;
  }
}

export function contactStatusVariant(value: string | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (!value) return "secondary";
  const normalized = value.toLowerCase();
  switch (normalized) {
    case "enviado":
      return "secondary";
    case "omitido":
      return "outline";
    case "error":
      return "destructive";
    default:
      return "default";
  }
}

export function canalLabel(value: string) {
  switch (value) {
    case "correo":
      return "Correo";
    case "whatsapp":
      return "WhatsApp";
    case "llamada":
      return "Llamada";
    default:
      return value;
  }
}

export function contactHistoryDetail(envio: ContactoEnvio): string {
  const detalle = envio.detalle;
  if (!detalle) return "—";
  if (envio.canal === "correo") {
    const email = detalle["email"];
    return typeof email === "string" && email.trim().length ? email : "—";
  }
  const phone = detalle["telefono"] || detalle["phone"];
  if (typeof phone === "string" && phone.trim().length) {
    return phone;
  }
  const reason = detalle["reason"];
  if (typeof reason === "string" && reason.trim().length) {
    return reason;
  }
  return "—";
}
