import type { EmbudoStage } from "@/lib/embudo/data";
import { EmbudoStageColumn } from "@/components/embudo/stage-column";

export function EmbudoBoard({ etapas }: { etapas: EmbudoStage[] }) {
  if (!etapas.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Aún no hay etapas configuradas en tu embudo.
      </div>
    );
  }

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
      {etapas.map((stage) => (
        <div key={stage.id} className="w-[320px] shrink-0">
          <EmbudoStageColumn stage={stage} />
        </div>
      ))}
    </div>
  );
}
