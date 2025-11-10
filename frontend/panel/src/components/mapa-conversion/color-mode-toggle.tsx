"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

const OPTIONS: Array<{ value: "sequential" | "channel"; label: string }> = [
  { value: "sequential", label: "Escala por volumen" },
  { value: "channel", label: "Canal predominante" },
];

type ColorModeToggleProps = {
  mode: "sequential" | "channel";
};

export function ColorModeToggle({ mode }: ColorModeToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: "sequential" | "channel") {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "sequential") {
      params.delete("color");
    } else {
      params.set("color", value);
    }
    const query = params.toString();
    router.replace(query.length ? `/mapa-de-conversion?${query}` : "/mapa-de-conversion");
  }

  return (
    <div className="mb-3 flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <span className="font-medium">Modo de color</span>
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={mode === option.value ? "default" : "outline"}
            onClick={() => handleChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

