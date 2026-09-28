"use client"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { ProspeccionSearchWorkspace } from "@/components/prospeccion/prospeccion-search-workspace"

import { DenueBusquedaView } from "./denue-busqueda-view"

export default function DenueBusquedaClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · GobMX búsqueda">
      <ProspeccionSearchWorkspace activeSource="denue" />
      <DenueBusquedaView />
    </ProspeccionViewLayout>
  )
}
