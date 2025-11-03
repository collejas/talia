'use client'

import { useState } from 'react'
import { Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTheme } from '@/hooks/use-theme'
import { themeOptions } from '@/lib/theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {open ? (
        <div className="rounded-xl border border-border bg-surface p-3 shadow-panel">
          <Select
            value={theme}
            onValueChange={(value) => {
              setTheme(value as typeof theme)
              setOpen(false)
            }}
          >
            <SelectTrigger className="w-[180px] border-border bg-surface-alt text-foreground">
              <SelectValue placeholder="Selecciona tema" />
            </SelectTrigger>
            <SelectContent side="top">
              {themeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-full border-border/60 bg-surface text-foreground shadow-panel-soft hover:bg-surface-alt"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Cambiar tema"
      >
        <Palette className="h-5 w-5" />
      </Button>
    </div>
  )
}
