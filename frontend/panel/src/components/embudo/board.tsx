import type { EmbudoStage, EmbudoCard } from "@/lib/embudo/data";
import { EmbudoStageColumn } from "@/components/embudo/stage-column";

type EmbudoBoardProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
};

export function EmbudoBoard({ etapas, sinConversacion }: EmbudoBoardProps) {
  if (!etapas.length && !sinConversacion.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay etapas configuradas en tu embudo.
      </div>
    );
  }

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
      <div className="w-[320px] shrink-0">
        <section className="flex h-full min-h-[420px] flex-col rounded-xl border border-primary/60 bg-primary/5">
          <div className="px-4 py-4">
            <h3 className="text-sm font-semibold text-primary">Sin conversación</h3>
            <p className="text-xs text-muted-foreground">Leads creados manualmente</p>
            <p className="mt-3 text-3xl font-bold text-primary">{sinConversacion.length}</p>
          </div>
          <div className="mt-2 space-y-2 px-4 pb-4 text-xs text-muted-foreground">
            <p>Estos leads no tienen conversación asociada. Puedes asignarlos manualmente a una etapa cuando estén listos.</p>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20"
            >
              Crear lead manual
            </button>
          </div>
        </section>
      </div>
      {etapas.map((stage) => (
        <div key={stage.id} className="w-[320px] shrink-0">
          <EmbudoStageColumn stage={stage} />
        </div>
      ))}
    </div>
  );
}
