import tls from "tls"

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  fromEmail: string
  fromName: string
}

type SendEmailOptions = {
  to: string
  subject: string
  html: string
}

const HOST_KEYS = ["SMTP_HOST", "TALIA_MAIL_OUTGOING_SERVER"] as const
const PORT_KEYS = ["SMTP_PORT", "TALIA_MAIL_OUTGOING_PORT_SMTP"] as const
const USER_KEYS = ["SMTP_USER", "TALIA_MAIL_USERNAME"] as const
const PASS_KEYS = ["SMTP_PASS", "TALIA_MAIL_CONTRASENA"] as const
const FROM_EMAIL_KEYS = ["SMTP_FROM_EMAIL", "TALIA_MAIL_USERNAME"] as const
const FROM_NAME_KEYS = ["SMTP_FROM_NAME", "TALIA_MAIL_FROM_NAME"] as const
const SSL_KEYS = ["SMTP_USE_SSL", "TALIA_MAIL_USE_SSL"] as const

function readEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === "string" && value.trim().length) {
      return value.trim()
    }
  }
  return null
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = readEnv(HOST_KEYS)
  const portValue = readEnv(PORT_KEYS)
  const username = readEnv(USER_KEYS)
  const password = readEnv(PASS_KEYS)
  const fromEmail = readEnv(FROM_EMAIL_KEYS)
  const fromName = readEnv(FROM_NAME_KEYS) ?? "Talia"

  if (!host || !portValue || !username || !password || !fromEmail) {
    return null
  }

  const secureValue = readEnv(SSL_KEYS)
  const secure =
    secureValue != null ? /^true$/i.test(secureValue) : Number(portValue) === 465

  return {
    host,
    port: Number(portValue) || 465,
    secure,
    username,
    password,
    fromEmail,
    fromName,
  }
}

export async function sendSmtpEmail(config: SmtpConfig, message: SendEmailOptions): Promise<void> {
  const socket = await createSmtpSocket(config)

  try {
    await expectResponse(socket, 220)
    await sendCommand(socket, `EHLO talia.mx`, [250])
    await sendCommand(socket, `AUTH LOGIN`, [334])
    await sendCommand(socket, Buffer.from(config.username).toString("base64"), [334])
    await sendCommand(socket, Buffer.from(config.password).toString("base64"), [235])
    await sendCommand(socket, `MAIL FROM:<${config.fromEmail}>`, [250])
    await sendCommand(socket, `RCPT TO:<${message.to}>`, [250, 251])
    await sendCommand(socket, "DATA", [354])

    const emailHeaders = [
      `Subject: ${message.subject}`,
      `To: ${message.to}`,
      `From: ${formatSender(config)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
    ]
    const safeHtml = wrapSmtpBody(message.html)
    const body = `${emailHeaders.join("\r\n")}\r\n\r\n${safeHtml}\r\n.\r\n`
    await sendCommand(socket, body, [250], { raw: true })

    await sendCommand(socket, "QUIT", [221]).catch(() => undefined)
  } finally {
    socket.end()
  }
}

function formatSender(config: SmtpConfig): string {
  if (!config.fromName || config.fromName === config.fromEmail) {
    return config.fromEmail
  }
  return `${config.fromName} <${config.fromEmail}>`
}

type CommandOptions = {
  raw?: boolean
}

async function sendCommand(
  socket: tls.TLSSocket,
  command: string,
  expected: number[],
  options: CommandOptions = {},
): Promise<string> {
  socket.write(options.raw ? command : `${command}\r\n`)
  return expectResponse(socket, expected)
}

function expectResponse(socket: tls.TLSSocket, expected: number | number[]): Promise<string> {
  const codes = Array.isArray(expected) ? expected : [expected]
  return new Promise((resolve, reject) => {
    let buffer = ""
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8")
      if (!buffer.match(/\r?\n$/)) {
        return
      }
      cleanup()
      const code = parseInt(buffer.slice(0, 3), 10)
      if (!codes.some((value) => value === code)) {
        reject(new Error(buffer.trim()))
        return
      }
      resolve(buffer)
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const cleanup = () => {
      socket.off("data", onData)
      socket.off("error", onError)
    }
    socket.on("data", onData)
    socket.on("error", onError)
  })
}

function createSmtpSocket(config: SmtpConfig): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      {
        host: config.host,
        port: config.port,
        rejectUnauthorized: false,
      },
      () => resolve(socket),
    )
    socket.on("error", reject)
  })
}

function wrapSmtpBody(value: string, limit = 998): string {
  const normalized = value.replace(/\r?\n/g, "\r\n")
  const lines = normalized.split("\r\n")
  const folded: string[] = []
  for (const line of lines) {
    if (line.length <= limit) {
      folded.push(line)
      continue
    }
    for (let i = 0; i < line.length; i += limit) {
      folded.push(line.slice(i, i + limit))
    }
  }
  return folded.join("\r\n")
}
