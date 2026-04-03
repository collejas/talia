import type { Metadata } from "next"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"

import LandingAbPageClient from "./page.client"

export const metadata: Metadata = {
  title: "Landing A/B/C · Prospección",
}

export default function LandingAbPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Landing A/B/C">
      <LandingAbPageClient />
    </ProspeccionViewLayout>
  )
}
