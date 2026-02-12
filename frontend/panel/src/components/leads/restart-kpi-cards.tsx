"use client";

import type { RestartKpis } from "@/lib/leads/data";

export function RestartKpiCards({ kpis }: { kpis: RestartKpis }) {
  const cards = [
    {
      label: "Tasa de reconversión",
      value: `${kpis.reconversionRate.toFixed(1)}%`,
      helper: "Ciclos que llegaron a demo o ganados.",
    },
    {
      label: "Días promedio entre ciclos",
      value: `${kpis.avgDaysBetweenCycles.toFixed(1)} días`,
      helper: "Tiempo que tarda un contacto en regresar.",
    },
    {
      label: "Monto promedio por ciclo",
      value: new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN",
        maximumFractionDigits: 0,
      }).format(kpis.avgAmountPerCycle || 0),
      helper: "Valor generado cada vez que el contacto vuelve.",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3 *:bg-gradient-to-t *:from-primary/5 *:to-card *:shadow-xs">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border p-4 @container/card">
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl mt-1">
            {card.value}
          </p>
          <p className="text-sm text-muted-foreground mt-1">{card.helper}</p>
        </div>
      ))}
    </div>
  );
}
