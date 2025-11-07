import type { EmbudoStage, EmbudoCard } from "@/lib/embudo/data";
import { EmbudoBoardClient } from "@/components/embudo/board-client";

type EmbudoBoardProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
};

export function EmbudoBoard({ etapas, sinConversacion }: EmbudoBoardProps) {
  return <EmbudoBoardClient etapas={etapas} sinConversacion={sinConversacion} />;
}
