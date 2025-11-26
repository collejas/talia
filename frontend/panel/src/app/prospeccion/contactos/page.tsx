import { Suspense } from "react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

import ContactosPageClient from "./page.client"

export const metadata = {
  title: "Prospección · Contactos",
}

export default function ContactosPage() {
  return (
    <AppViewLayout title="Prospección · Contactos">
      <div className="px-4 pb-10 pt-4 md:px-6 lg:px-8">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando contactos...</p>}>
          <ContactosPageClient />
        </Suspense>
      </div>
    </AppViewLayout>
  )
}
