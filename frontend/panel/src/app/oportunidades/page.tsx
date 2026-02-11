import Link from "next/link";

import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { RestartKpiCards } from "@/components/leads/restart-kpi-cards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadCrmOpportunities } from "@/lib/crm/opportunities";
import { loadRestartKpis } from "@/lib/leads/data";
import { OportunidadesTableClient } from "./oportunidades-table.client";

export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const contactIdParam = typeof resolvedParams.contactId === "string" ? resolvedParams.contactId.trim() : "";
  const contactId = contactIdParam.length ? contactIdParam : undefined;

  const [payload, restartKpis] = await Promise.all([
    loadCrmOpportunities({ contactId }),
    loadRestartKpis(),
  ]);

  return (
    <AppViewLayout title="Oportunidades">
      <div className="flex flex-col gap-4">
        <RestartKpiCards kpis={restartKpis.kpis} />
        {restartKpis.errors.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {restartKpis.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        <OpportunitiesFilterBar contactId={contactId} />
        {contactId ? (
          <p className="text-sm text-muted-foreground">
            Mostrando oportunidades ligadas al contacto{" "}
            <span className="font-mono">{contactId.slice(0, 8)}</span>.
          </p>
        ) : null}
        {payload.errors.length > 0 ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {payload.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <OportunidadesTableClient
            rows={payload.rows}
            columnLabels={{
              header: "Oportunidad",
              type: "Contacto/Empresa",
              status: "Etapa",
              target: "Monto",
              limit: "Cierre probable",
              reviewer: "Asignado",
            }}
          />
        )}
      </div>
    </AppViewLayout>
  );
}

function OpportunitiesFilterBar({ contactId }: { contactId?: string }) {
  return (
    <form className="flex flex-wrap items-end gap-2" action="/oportunidades" method="get">
      <div className="flex flex-1 min-w-[240px] flex-col gap-1">
        <label htmlFor="contactId" className="text-sm font-medium text-muted-foreground">
          Filtrar por contacto (UUID)
        </label>
        <Input
          id="contactId"
          name="contactId"
          placeholder="cb8b16c2-30f3-4d35-bae0-95538d2f1687"
          defaultValue={contactId ?? ""}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit">Aplicar filtro</Button>
        {contactId ? (
          <Button asChild type="button" variant="ghost">
            <Link href="/oportunidades">Limpiar</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
