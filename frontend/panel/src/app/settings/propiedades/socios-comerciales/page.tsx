import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { ExternalPartnersManager } from "@/components/settings/propiedades/external-partners-manager"

export const dynamic = "force-dynamic"

export default function SociosComercialesPage() {
  return (
    <AppViewLayout title="Socios comerciales externos">
      <div className="px-4 py-6 lg:px-6">
        <ExternalPartnersManager />
      </div>
    </AppViewLayout>
  )
}
