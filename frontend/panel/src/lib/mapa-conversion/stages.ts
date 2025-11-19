export const MAPA_STAGE_ORDER = [
  { key: "captado", label: "Captado" },
  { key: "precalificado", label: "Precalificado" },
  { key: "demo", label: "Demo agendada" },
  { key: "negociacion", label: "Negociación" },
  { key: "ganado", label: "Ganado" },
  { key: "perdido", label: "Perdido" },
] as const;

export type MapaStageKey = (typeof MAPA_STAGE_ORDER)[number]["key"];

export const MAPA_STAGE_LABELS: Record<MapaStageKey, string> = MAPA_STAGE_ORDER.reduce(
  (acc, { key, label }) => {
    acc[key] = label;
    return acc;
  },
  {} as Record<MapaStageKey, string>,
);

export const MAPA_STAGE_KEYS = MAPA_STAGE_ORDER.map((stage) => stage.key);

export function createEmptyStageTotals(): Record<MapaStageKey, number> {
  return MAPA_STAGE_ORDER.reduce(
    (acc, { key }) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<MapaStageKey, number>,
  );
}
