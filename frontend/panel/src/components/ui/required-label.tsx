import { ReactNode } from "react"

import { Label } from "@/components/ui/label"

export function RequiredLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor}>
      {children} <span className="text-destructive" aria-hidden="true">*</span>
    </Label>
  )
}
