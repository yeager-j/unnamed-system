/**
 * The reserved spot in the sheet header for the owner-mode actions affordance
 * (PRD §6.1 — "one compact actions affordance: Take damage, Heal, Spend SP,
 * Use Prisma, Rest, Victories ± / Level-up"). UNN-176 ships the slot empty;
 * subsequent owner-mode tickets pass their controls in as `children` without
 * having to restructure the header.
 *
 * The slot is rendered by the page route only when the viewer is the owner —
 * gating happens at the page level via `getViewerRole`, not here — so this
 * component itself is unconditional and can be re-used in any owner-only
 * branch.
 */
export function OwnerControlsSlot({
  children,
}: {
  children?: React.ReactNode
}) {
  return (
    <div
      data-testid="owner-controls-slot"
      aria-label="Owner controls"
      className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-1.5"
    >
      {children ?? (
        <span className="text-xs text-muted-foreground">Owner controls</span>
      )}
    </div>
  )
}
