import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

export const metadata: Metadata = {
  title: "Mensajes automatizados · Prospección",
}

export default function MensajesPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Mensajes">
      <p className="text-sm text-muted-foreground">Aquí aparecerán los workflows de mensajería próximos.</p>
    </ProspeccionViewLayout>
  )
}
