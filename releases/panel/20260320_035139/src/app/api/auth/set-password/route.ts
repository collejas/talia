"use server"

import { NextResponse } from "next/server"

import { getSupabaseConfig } from "@/lib/auth/supabase"

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      access_token?: string
      password?: string
    }
    const accessToken = payload.access_token?.trim()
    const password = payload.password?.trim()
    if (!accessToken) {
      return NextResponse.json(
        { error: "El enlace no es válido o ya expiró. Solicita uno nuevo." },
        { status: 400 },
      )
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 },
      )
    }

    const config = getSupabaseConfig()
    if (!config) {
      return NextResponse.json(
        { error: "Supabase no está configurado en el entorno." },
        { status: 500 },
      )
    }

    const response = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await getErrorMessage(response)
      return NextResponse.json(
        { error: errorText || "No pudimos actualizar la contraseña." },
        { status: response.status || 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[auth/set-password] error", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Ocurrió un error al procesar la solicitud.",
      },
      { status: 500 },
    )
  }
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { error_description?: string; error?: string }
    return json.error_description || json.error || `Supabase respondió ${response.status}`
  } catch {
    return `Supabase respondió ${response.status}`
  }
}
