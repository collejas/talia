'use client'

import { useTheme } from '@/hooks/use-theme'
import { themeOptions } from '@/lib/theme'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Tema</span>
      <Select value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
        <SelectTrigger className="w-[160px] border-border bg-surface-alt text-foreground">
          <SelectValue placeholder="Selecciona tema" />
        </SelectTrigger>
        <SelectContent>
          {themeOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
