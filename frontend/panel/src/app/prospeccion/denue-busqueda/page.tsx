import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "GobMX búsqueda · Prospección",
}

export default function DenueBusquedaLegacyPage() {
  redirect("/prospeccion/busqueda?fuente=denue")
}
