import { cn } from "@workspace/ui/lib/utils"

/**
 * The tabbed content column's card chrome (S2b — design frames `10b`/`10c`):
 * a bordered panel with a display-serif title and an optional right-aligned
 * header slot (a count, a tracked stat, an action button). Explore and
 * Journal compose every section from this one shell so the two tabs read as
 * one surface.
 */
export function SheetCard({
  title,
  headerSlot,
  children,
  className,
}: {
  title: string
  /** Right-aligned header content — a count, `SPARKS · n/7`, an Add button. */
  headerSlot?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card/50 p-5",
        className
      )}
    >
      <header className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl leading-none">{title}</h2>
        {headerSlot}
      </header>
      {children}
    </section>
  )
}
