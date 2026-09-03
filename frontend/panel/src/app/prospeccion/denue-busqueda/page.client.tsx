"use client"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import { DenueBusquedaView } from "./denue-busqueda-view"

export default function DenueBusquedaClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · GobMX búsqueda">
      <DenueBusquedaView />
    </ProspeccionViewLayout>
  )
}
