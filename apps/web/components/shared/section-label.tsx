import { cn } from "@workspace/ui/lib/utils"

/**
 * The sheet's section label vocabulary (design frame `10a`): a small
 * tracked-uppercase muted heading — `AFFINITIES`, `SKILLS · 6`, `CONTROLS` —
 * optionally with a right-aligned annotation slot.
 */
export function SectionLabel({
  children,
  annotation,
  className,
}: {
  children: React.ReactNode
  annotation?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2 text-[11px] font-extrabold tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
    >
      <span>{children}</span>
      {annotation !== undefined ? (
        <span className="normal-case">{annotation}</span>
      ) : null}
    </div>
  )
}
