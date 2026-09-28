"use client"

import dynamic from "next/dynamic"
import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { ProspeccionSearchWorkspace, type ProspeccionSearchSource } from "@/components/prospeccion/prospeccion-search-workspace"

const GoogleBusquedaView = dynamic(
  () => import("../google-busqueda/google-busqueda-view").then((mod) => mod.GoogleBusquedaView),
  { ssr: false, loading: () => <div className="min-h-[520px] rounded-2xl border bg-card/60" /> },
)

const DenueBusquedaView = dynamic(
  () => import("../denue-busqueda/denue-busqueda-view").then((mod) => mod.DenueBusquedaView),
  { ssr: false, loading: () => <div className="min-h-[520px] rounded-2xl border bg-card/60" /> },
)

function BusquedaClientContent() {
  const searchParams = useSearchParams()
  const activeSource: ProspeccionSearchSource = searchParams.get("fuente") === "google" ? "google" : "denue"

  return (
    <ProspeccionViewLayout title="Prospección · Buscar empresas">
      <ProspeccionSearchWorkspace activeSource={activeSource} />
      {activeSource === "denue" ? <DenueBusquedaView /> : <GoogleBusquedaView />}
    </ProspeccionViewLayout>
  )
}

export default function BusquedaClientPage() {
  return (
    <Suspense fallback={<div className="min-h-[640px] rounded-2xl border bg-card/60" />}>
      <BusquedaClientContent />
    </Suspense>
  )
}
