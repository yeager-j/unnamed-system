export function ExhaustionRow({ exhaustion }: { exhaustion: number }) {
  const exhausted = exhaustion > 0
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">Exhaustion</span>
      <span
        className={
          exhausted
            ? "font-medium tabular-nums"
            : "text-muted-foreground tabular-nums"
        }
      >
        {exhaustion}
      </span>
    </div>
  )
}
