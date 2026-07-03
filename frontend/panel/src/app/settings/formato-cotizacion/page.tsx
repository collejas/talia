import { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { QuoteTemplateSettingsForm } from "@/components/settings/quote-template-form"
import { fetchQuoteTemplateSettings } from "./actions"
import { QUOTE_TEMPLATE_DEFAULTS } from "./template-schema"

export const metadata: Metadata = {
  title: "Formato de cotización · Settings",
}

export default async function QuoteTemplateSettingsPage() {
  const template = await fetchQuoteTemplateSettings()

  return (
    <AppViewLayout title="Settings">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Formato de cotización</h1>
          <p className="max-w-3xl text-muted-foreground">
            Define el HTML y CSS que usa Tal-IA al generar el PDF de las cotizaciones. Puedes usar
            placeholders como <code>{"{{cliente.nombre}}"}</code>, <code>{"{{organizacion.nombre}}"}</code> y
            <code>{"{{organizacion.eslogan_empresa}}"}</code> para inyectar datos dinámicos.
          </p>
        </div>
        <QuoteTemplateSettingsForm
          initialTemplate={template}
          defaultTemplate={QUOTE_TEMPLATE_DEFAULTS}
        />
      </div>
    </AppViewLayout>
  )
}
