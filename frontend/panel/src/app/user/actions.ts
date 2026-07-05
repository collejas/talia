"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

export type UserProfileActionState = {
  status: "idle" | "success" | "error"
  message?: string
}

function success(message: string): UserProfileActionState {
  return { status: "success", message }
}

function failure(error: unknown, fallback: string): UserProfileActionState {
  const message =
    error instanceof Error
      ? error.message || fallback
      : typeof error === "string"
        ? error
        : fallback
  console.error("[user/profile]", error)
  return { status: "error", message }
}

function getText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function getCheckbox(formData: FormData, key: string): boolean {
  return formData.getAll(key).some((value) => {
    if (typeof value !== "string") return false
    const normalized = value.trim().toLowerCase()
    return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes"
  })
}

export async function updateUserProfileAction(
  _prevState: UserProfileActionState,
  formData: FormData,
): Promise<UserProfileActionState> {
  try {
    const section = getText(formData, "section")
    if (!section) {
      throw new Error("Falta la sección del formulario.")
    }

    const payload: Record<string, unknown> = {}
    if (section === "personal") {
      const nombreCompleto = getText(formData, "nombre_completo")
      const telefonoE164 = getText(formData, "telefono_e164")
      const timezone = getText(formData, "timezone")

      if (nombreCompleto) payload.nombre_completo = nombreCompleto
      if (telefonoE164) payload.telefono_e164 = telefonoE164
      if (timezone) payload.timezone = timezone
    } else if (section === "mail") {
      payload.mail_habilitado = getCheckbox(formData, "mail_habilitado")
      payload.mail_use_ssl = getCheckbox(formData, "mail_use_ssl")
      payload.mail_use_tls = getCheckbox(formData, "mail_use_tls")

      const username = getText(formData, "mail_username")
      const password = getText(formData, "mail_password")
      const incomingServer = getText(formData, "mail_incoming_server")
      const incomingPort = getText(formData, "mail_incoming_port_imap")
      const outgoingServer = getText(formData, "mail_outgoing_server")
      const outgoingPort = getText(formData, "mail_outgoing_port_smtp")
      const fromName = getText(formData, "mail_from_name")
      const replyTo = getText(formData, "mail_reply_to")

      if (username) payload.mail_username = username
      if (password) payload.mail_password = password
      if (incomingServer) payload.mail_incoming_server = incomingServer
      if (incomingPort) payload.mail_incoming_port_imap = Number(incomingPort)
      if (outgoingServer) payload.mail_outgoing_server = outgoingServer
      if (outgoingPort) payload.mail_outgoing_port_smtp = Number(outgoingPort)
      if (fromName) payload.mail_from_name = fromName
      if (replyTo) payload.mail_reply_to = replyTo
    } else {
      throw new Error("Sección inválida.")
    }

    const response = await callCrmApi<{ ok: boolean }>("/tenant/me/profile", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })

    if (!response.ok) {
      throw new Error(response.error)
    }

    revalidatePath("/user")
    return success(section === "mail" ? "Conexión de correo actualizada." : "Datos personales actualizados.")
  } catch (error) {
    return failure(error, "No se pudo guardar la información.")
  }
}
