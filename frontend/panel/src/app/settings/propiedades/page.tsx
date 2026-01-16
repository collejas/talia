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
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Settings
          </p>
          <h1 className="text-2xl font-semibold">Propiedades</h1>
          <p className="text-sm text-muted-foreground">
            Captura la información básica, ubicación y plantillas jerárquicas antes de publicar un
            desarrollo en el mapa y en los reportes demográficos.
          </p>
        </header>
        <section className="space-y-4">
          <PropiedadForm lineas={lineas} familias={familias} modelos={modelos} tipos={tipos} />
        </section>
      </div>
    </AppViewLayout>
  );
}
