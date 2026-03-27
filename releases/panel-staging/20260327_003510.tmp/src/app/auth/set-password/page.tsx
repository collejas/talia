import { Metadata } from "next"

import { SetPasswordForm } from "@/components/auth/set-password-form"

type SearchParamRecord = Record<string, string | string[] | undefined>

export const metadata: Metadata = {
  title: "Establece tu contraseña · Talia",
}

const getFirstValue = (value?: string | string[]) => {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamRecord>
}) {
  const resolvedParams = searchParams ? await searchParams : undefined
  const params = resolvedParams ?? {}
  const accessToken = getFirstValue(params.access_token) || getFirstValue(params.token)
  const type = getFirstValue(params.type)

  return (
    <div className="min-h-screen bg-muted flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-lg">
        <div className="mb-6 text-center">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">Acceso seguro</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Establece tu contraseña
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Completa el proceso para empezar a usar Talia.
          </p>
        </div>
        <SetPasswordForm accessToken={accessToken} type={type} />
      </div>
    </div>
  )
}
