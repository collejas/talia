"use client"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import { GoogleBusquedaView } from "./google-busqueda-view"

export default function GoogleBusquedaClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Google busqueda">
      <GoogleBusquedaView />
    </ProspeccionViewLayout>
  )
}
