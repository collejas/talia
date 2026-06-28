import { Metadata } from "next"

import { EmailConfirmForm } from "@/components/auth/email-confirm-form"

type SearchParamRecord = Record<string, string | string[] | undefined>

export const metadata: Metadata = {
  title: "Confirma tu correo · Talia",
}

const getFirstValue = (value?: string | string[]) => {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamRecord>
}) {
  const resolvedParams = searchParams ? await searchParams : undefined
  const params = resolvedParams ?? {}
  const token = getFirstValue(params.token) || getFirstValue(params.access_token)

  return (
    <div className="min-h-screen bg-muted flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-lg">
        <div className="mb-6 text-center">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Acceso seguro</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Confirma tu correo</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verificamos tu correo para continuar con la invitación de acceso.
          </p>
        </div>
        <EmailConfirmForm token={token} />
      </div>
    </div>
  )
}
