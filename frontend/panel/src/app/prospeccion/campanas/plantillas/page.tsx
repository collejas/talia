import type { Metadata } from "next"
import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
import { CampaignTemplatesCenter } from "./campaign-templates-center"

export const metadata: Metadata = { title: "Plantillas de campaña · Prospección" }

export default async function PlantillasCampanaPage({ searchParams }: { searchParams: Promise<{ campana_id?: string }> }) {
  const params = await searchParams
  return (
    <ProspeccionViewLayout title="Prospección · Plantillas de campaña">
      <CampaignTemplatesCenter campaignId={params.campana_id} />
    </ProspeccionViewLayout>
  )
}
