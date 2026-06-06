import { AppViewLayout } from "@/components/layouts/app-view-layout"
import ContactosPageClient from "./contactos-page.client"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <AppViewLayout title="Contactos">
      <ContactosPageClient />
    </AppViewLayout>
  )
}
