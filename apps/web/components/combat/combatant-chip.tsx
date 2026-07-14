import { cn } from "@workspace/ui/lib/utils"

import type { CombatantView } from "@/domain/combat/view/console-view"

/**
 * The small combatant name chip the combat surfaces share (extracted from the
 * turn-order strip in UNN-624 so the encounter embed card renders the same
 * chip): side-colored dot + name in a bordered pill. Variants (struck, boxed,
 * glowing draft candidate) compose via `className`; span-based so it stays
 * phrasing content wherever prose embeds it.
 */
export function CombatantChip({
  side,
  label,
  muted = false,
  className,
  ...rest
}: {
  side: CombatantView["side"]
  label: string
  muted?: boolean
  className?: string
} & Omit<React.ComponentProps<"span">, "children">) {
  return (
    <span
      data-side={side}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs",
        className
      )}
      {...rest}
    >
      <SideDot side={side} muted={muted} />
      {label}
    </span>
  )
}

/** A small side-colored square mirroring the design's combatant glyphs: players
 *  read as primary, enemies as destructive. */
export function SideDot({
  side,
  muted = false,
}: {
  side: CombatantView["side"]
  muted?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-[2px]",
        side === "players" ? "bg-primary" : "bg-destructive",
        muted && "opacity-50"
      )}
    />
  )
}
