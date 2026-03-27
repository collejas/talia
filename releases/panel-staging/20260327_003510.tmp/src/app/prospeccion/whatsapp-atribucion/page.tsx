import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import WhatsAppAtribucionPageClient from "./page.client"

export const metadata: Metadata = {
  title: "Atribución WhatsApp · Prospección",
}

export default function WhatsAppAtribucionPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Atribución WhatsApp">
      <WhatsAppAtribucionPageClient />
    </ProspeccionViewLayout>
  )
}
