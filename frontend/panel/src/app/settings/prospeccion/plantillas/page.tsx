import { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { ContactTemplatesPanel } from "@/components/settings/contact-templates-panel"
import { fetchContactTemplates } from "./actions"

export const metadata: Metadata = {
  title: "Plantillas de contacto · Settings",
}

export default async function ContactTemplatesSettingsPage() {
  const templates = await fetchContactTemplates()

  return (
    <AppViewLayout title="Settings">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <ContactTemplatesPanel initialTemplates={templates} />
      </div>
    </AppViewLayout>
  )
}
