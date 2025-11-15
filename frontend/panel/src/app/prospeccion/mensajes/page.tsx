import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Mensajes automatizados · Prospección",
}

export default function MensajesPage() {
  return (
    <AppViewLayout title="Prospección · Mensajes" contentClassName="px-4 lg:px-6">
      <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Pronto podrás configurar las secuencias y respuestas automatizadas desde aquí.
      </div>
    </AppViewLayout>
  )
}
