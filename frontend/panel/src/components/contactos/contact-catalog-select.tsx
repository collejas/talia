"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type ContactCatalogOption = {
  value: string
  label: string
}

type ContactCatalogSelectProps = {
  value: string
  onValueChange: (value: string) => void
  options: ContactCatalogOption[]
  placeholder?: string
  disabled?: boolean
  emptyLabel?: string
}

export function mergeCatalogOptions(
  options: ContactCatalogOption[],
  currentValue: string | null | undefined,
  currentLabelPrefix = "Actual",
): ContactCatalogOption[] {
  const normalized = options.filter((option) => option.value.trim())
  const current = (currentValue ?? "").trim()
  if (!current) {
    return normalized
  }
  if (normalized.some((option) => option.value === current)) {
    return normalized
  }
  return [{ value: current, label: `${currentLabelPrefix}: ${current}` }, ...normalized]
}

export function ContactCatalogSelect({
  value,
  onValueChange,
  options,
  placeholder = "Selecciona una opción",
  disabled = false,
  emptyLabel = "Sin opciones configuradas",
}: ContactCatalogSelectProps) {
  return (
    <Select value={value || ""} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.length ? (
          options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))
        ) : (
          <SelectItem value="__no_options__" disabled>
            {emptyLabel}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
