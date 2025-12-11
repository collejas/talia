import { Suspense } from "react"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import ContactosPageClient from "./page.client"

export const metadata = {
  title: "Prospección · Contactos",
}

export default function ContactosPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Contactos">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando contactos...</p>}>
        <ContactosPageClient />
      </Suspense>
    </ProspeccionViewLayout>
  )
}
