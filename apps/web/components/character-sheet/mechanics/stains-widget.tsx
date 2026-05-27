import { STAIN_ELEMENT_LABELS, type StainsState } from "@/lib/game/mechanics"

/**
 * Mage — Stains rendering. Four equal-width tiles; each shows its current
 * element (Fire / Ice / Elec / Wind / Light) or an empty placeholder. Color
 * coding picks up the elemental affinity vocabulary so the eye can scan a
 * row at a glance.
 */
export function StainsWidget({ state }: { state: StainsState }) {
  return (
    <ol aria-label="Stain slots" className="grid grid-cols-4 gap-2">
      {state.tokens.map((token, index) => (
        <li
          key={index}
          className={
            token
              ? `flex h-16 items-center justify-center rounded-md border-2 font-medium ${STAIN_TILE_CLASSES[token]}`
              : "flex h-16 items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground"
          }
        >
          {token ? STAIN_ELEMENT_LABELS[token] : "—"}
        </li>
      ))}
    </ol>
  )
}

const STAIN_TILE_CLASSES = {
  fire: "border-orange-400 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  ice: "border-sky-400 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  elec: "border-yellow-400 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  wind: "border-emerald-400 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  light: "border-amber-300 bg-amber-200/40 text-amber-800 dark:text-amber-200",
} as const satisfies Record<NonNullable<StainsState["tokens"][number]>, string>
