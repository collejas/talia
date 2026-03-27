"use client";

import type { EmbudoStage, EmbudoCard } from "@/lib/embudo/data";
import type { EmbudoBoardClientProps } from "@/components/embudo/board-client";
import { EmbudoBoardClient } from "@/components/embudo/board-client";
import { useEffect, useState } from "react";

type EmbudoBoardProps = {
  etapas: EmbudoStage[];
  sinConversacion: EmbudoCard[];
  visitantesSinChat: number;
  scoringKpis: EmbudoBoardClientProps["scoringKpis"];
  errors: EmbudoBoardClientProps["errors"];
};

export function EmbudoBoard({
  etapas,
  sinConversacion,
  visitantesSinChat,
  scoringKpis,
  errors,
}: EmbudoBoardProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!mounted) {
    return (
      <div className="rounded-lg border border-dashed border-muted-foreground/40 px-4 py-10 text-center text-sm text-muted-foreground">
        Preparando embudo…
      </div>
    );
  }

  return (
    <EmbudoBoardClient
      etapas={etapas}
      sinConversacion={sinConversacion}
      visitantesSinChat={visitantesSinChat}
      scoringKpis={scoringKpis}
      errors={errors}
    />
  );
}
