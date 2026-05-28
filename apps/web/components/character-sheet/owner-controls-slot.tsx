/**
 * The reserved spot in the sheet header for the owner-mode actions affordance
 * (PRD §6.1 — "one compact actions affordance: Take damage, Heal, Spend SP,
 * Use Prisma, Rest, Victories ± / Level-up"). UNN-176 shipped the slot empty;
 * UNN-155 filled it with damage / heal / spend / recover / Use Prisma; Rest
 * and Level-up will append more controls without restructuring this layout.
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
      className="flex flex-wrap items-center gap-2"
    >
      {children}
    </div>
  )
}
