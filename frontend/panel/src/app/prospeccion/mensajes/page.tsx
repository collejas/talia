import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

export const metadata: Metadata = {
  title: "Mensajes automatizados · Prospección",
}

export default function MensajesPage() {
  return <AppViewLayout title="Prospección · Mensajes" />
}
