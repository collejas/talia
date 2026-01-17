import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { PropiedadForm } from "@/components/settings/propiedades/propiedad-form";
import {
  fetchLineasDeNegocio,
  fetchFamiliasDeProductos,
  fetchModelosProductos,
} from "@/app/settings/productos/actions";
import { callCrmApi } from "@/lib/api/crm";

export const dynamic = "force-dynamic";

type PropiedadTipo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
};

async function fetchPropiedadTipos(): Promise<PropiedadTipo[]> {
  const response = await callCrmApi<PropiedadTipo[]>("/crm/propiedades/tipos");
  if (!response.ok || !Array.isArray(response.data)) {
    return [];
  }
  return response.data.map((tipo) => ({
    ...tipo,
    nombre: typeof tipo.nombre === "string" ? tipo.nombre : "Sin nombre",
    descripcion: typeof tipo.descripcion === "string" ? tipo.descripcion : null,
    color: typeof tipo.color === "string" ? tipo.color : "#95A5A6",
  }));
}

export default async function SettingsPropiedadesPage() {
  const [lineas, familias, modelos, tipos] = await Promise.all([
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
    fetchModelosProductos({ includeInactive: true }),
    fetchPropiedadTipos(),
  ]);

  return (
    <AppViewLayout title="Settings · Propiedades inmobiliarias">
      <div className="px-4 py-0 lg:px-6">
        <section className="space-y-0">
          <PropiedadForm lineas={lineas} familias={familias} modelos={modelos} tipos={tipos} />
        </section>
      </div>
    </AppViewLayout>
  );
}
