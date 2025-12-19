import { getSmtpConfig, sendSmtpEmail } from "@/lib/mail/smtp-client"
import { renderInviteHtml } from "@/lib/mail/invite-template"

type InviteEmailInput = {
  to: string
  nombre?: string | null
  actionLink: string
}

export async function sendInviteEmailViaSmtp(input: InviteEmailInput): Promise<void> {
  const config = getSmtpConfig()
  if (!config) {
    throw new Error("No hay configuración SMTP para enviar la invitación.")
  }
  const html = renderInviteHtml({
    actionLink: input.actionLink,
    nombre: input.nombre,
  })

  await sendSmtpEmail(config, {
    to: input.to,
    subject: "Invitación a Talia",
    html,
  })
}
