import { Skeleton } from "@/components/ui/skeleton";

function SectionShell({
  title,
  height,
  className = "",
}: {
  title: string;
  height: string;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border bg-card/90 shadow-sm ${className}`}>
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-card-foreground/80">{title}</p>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Cargando
          </span>
        </div>
      </div>
      <div className="p-4">
        <Skeleton className={height} />
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="h-9 w-72 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2.1fr)_minmax(0,0.9fr)]">
        <SectionShell title="Filtros" height="h-[520px] rounded-xl" />
        <SectionShell title="Mapa" height="h-[520px] rounded-xl" />
        <SectionShell title="Resumen general" height="h-[520px] rounded-xl" />
      </div>

      <section className="rounded-2xl border bg-card/90 shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-card-foreground/80">Mapa de KPIs</p>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Cargando
            </span>
          </div>
        </div>
        <div className="p-4">
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </section>

      <section className="rounded-2xl border bg-card/90 shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-card-foreground/80">Acquisition summary</p>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Cargando
            </span>
          </div>
        </div>
        <div className="p-4">
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </section>

      <section className="rounded-2xl border bg-card/90 shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-card-foreground/80">Tabla principal</p>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Cargando
            </span>
          </div>
        </div>
        <div className="p-4">
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </section>

      <div className="space-y-4">
        <section className="rounded-2xl border bg-card/90 shadow-sm">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-card-foreground/80">Visitas web</p>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Cargando
              </span>
            </div>
          </div>
          <div className="p-4">
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </section>

        <section className="rounded-2xl border bg-card/90 shadow-sm">
          <div className="border-b px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-card-foreground/80">Conversaciones</p>
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Cargando
              </span>
            </div>
          </div>
          <div className="p-4">
            <Skeleton className="h-40 rounded-xl" />
          </div>
        </section>
      </div>
    </div>
  );
}
