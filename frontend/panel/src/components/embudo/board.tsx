import type { EmbudoStage, EmbudoCard } from "@/lib/embudo/data";
import { EmbudoBoardClient } from "@/components/embudo/board-client";

type EmbudoBoardProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
};

export function EmbudoBoard({ etapas, sinConversacion, visitantesSinChat }: EmbudoBoardProps) {
  return (
    <EmbudoBoardClient
      etapas={etapas}
      sinConversacion={sinConversacion}
      visitantesSinChat={visitantesSinChat}
    />
  );
}
