import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { PropertyMapClient } from "@/components/mapa-de-propiedades/property-map-client";

export const dynamic = "force-dynamic";

export default function Propiedades3DPage() {
  return (
    <AppViewLayout title="Propiedades 3D">
      <PropertyMapClient />
    </AppViewLayout>
  );
}
