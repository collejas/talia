export const MAPA_STAGE_ORDER = [
  { key: "captado", label: "Captado" },
  { key: "precalificado", label: "Precalificado" },
  { key: "demo", label: "Cita agendada" },
  { key: "negociacion", label: "Negociación" },
  { key: "ganado", label: "Cerrado (ganado)" },
  { key: "perdido", label: "Cerrado (perdido)" },
] as const;

export const MAPA_STAGE_LABELS: Record<string, string> = MAPA_STAGE_ORDER.reduce<Record<string, string>>(
  (acc, { key, label }) => {
    acc[key] = label;
    return acc;
  },
  {},
);

export const MAPA_STAGE_KEYS = MAPA_STAGE_ORDER.map((stage) => stage.key);

export function orderStageKeys(stageKeys: string[]): string[] {
  const set = new Set(stageKeys.filter(Boolean));
  if (!set.size) {
    return [...MAPA_STAGE_KEYS];
  }
  const ordered: string[] = [];
  for (const { key } of MAPA_STAGE_ORDER) {
    if (set.has(key)) {
      ordered.push(key);
      set.delete(key);
    }
  }
  if (set.size) {
    ordered.push(...Array.from(set.values()));
  }
  return ordered;
}

export function createEmptyStageTotals(stageKeys: string[] = MAPA_STAGE_KEYS): Record<string, number> {
  return stageKeys.reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}
