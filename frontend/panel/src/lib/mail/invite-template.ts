type InviteTemplateParams = {
  actionLink: string
  nombre?: string | null
}

export function renderInviteHtml(params: InviteTemplateParams): string {
  const greeting = params.nombre?.trim()
    ? `Hola ${escapeHtml(params.nombre.trim())}!`
    : "¡Bienvenido a Talia!"
  const link = params.actionLink

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Invitación a Talia</title>
    <style>
      body, table, td { font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; }
      .btn {
        display: inline-block;
        padding: 12px 24px;
        background-color: #0C4A6E;
        color: #ffffff !important;
        text-decoration: none;
        border-radius: 6px;
        font-weight: 600;
      }
      .muted { color: #6b7280; font-size: 14px; }
      .card {
        max-width: 560px;
        margin: 0 auto;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 32px;
        background: #ffffff;
      }
    </style>
  </head>
  <body style="margin:0;padding:24px;background:#f3f4f6;">
    <div class="card">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr>
          <td style="text-align:center;padding-bottom:24px;">
            <img src="https://talia.mx/logo.png" alt="Talia" width="120" style="border:none;display:block;margin:0 auto;" />
          </td>
        </tr>
        <tr>
          <td>
            <h1 style="font-size:22px;margin-bottom:16px;color:#0f172a;">
              ${greeting}
            </h1>
            <p style="font-size:16px;line-height:1.5;color:#1f2937;margin-bottom:24px;">
              Has sido invitado(a) a unirte a la plataforma Talia para colaborar con tu equipo.
              Haz clic en el siguiente botón para aceptar la invitación y establecer tu contraseña.
            </p>
            <p style="text-align:center;margin-bottom:32px;">
              <a class="btn" href="${escapeAttribute(link)}" target="_blank">
                Aceptar invitación
              </a>
            </p>
            <p class="muted">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
              <span style="word-break:break-all;">${escapeHtml(link)}</span>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding-top:24px;border-top:1px solid #e5e7eb;">
            <p class="muted" style="text-align:center;margin-bottom:4px;">
              ¿No reconoces esta invitación?
            </p>
            <p class="muted" style="text-align:center;">
              Contacta a nuestro equipo en
              <a href="mailto:soporte@talia.mx" style="color:#0C4A6E;">soporte@talia.mx</a>.
            </p>
          </td>
        </tr>
      </table>
    </div>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&#39;"
      default:
        return char
    }
  })
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;")
}
