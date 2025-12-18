type StatValue = number | string

export function SettingsStatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: StatValue
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight">
        {typeof value === "number" ? value.toLocaleString("es-MX") : value}
      </p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function SettingsErrorCallout({ title, messages }: { title: string; messages: string[] }) {
  if (!messages.length) return null
  return (
    <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {messages.map((message, index) => (
          <li key={`${message}-${index}`}>{message}</li>
        ))}
      </ul>
    </div>
  )
}
