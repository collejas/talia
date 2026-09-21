import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import { ListasParaContactarClient } from "./page.client"

export const metadata: Metadata = {
  title: "Listas para contactar · Prospección",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default function ListasParaContactarPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Listas para contactar">
      <ListasParaContactarClient />
    </ProspeccionViewLayout>
  )
}
