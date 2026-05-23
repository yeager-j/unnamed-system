/**
 * Two-column labeled stat grid used by every popover card body. Renders
 * nothing when the row list is empty.
 */
export interface StatRow {
  label: string
  value: React.ReactNode
}

export function StatsGrid({ rows }: { rows: StatRow[] }) {
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="flex flex-wrap items-center gap-1.5">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
