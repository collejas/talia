import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { PropertyMap } from "@/components/mapa-de-propiedades/property-map";

export const dynamic = "force-dynamic";

export default function Propiedades3DPage() {
  return (
    <AppViewLayout title="CRM · Propiedades 3D">
      <PropertyMap />
    </AppViewLayout>
  );
}
