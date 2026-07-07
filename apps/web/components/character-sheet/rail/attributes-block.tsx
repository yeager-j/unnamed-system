import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"

import { ATTRIBUTE_SHORT_LABELS } from "@/lib/ui/labels"

const ATTRIBUTE_ORDER = ["strength", "magic", "agility", "luck"] as const

/**
 * The rail's 4-cell attribute row — St / Ma / Ag / Lu with signed modifiers
 * (design handoff: `+2`, `−1`, a bare `0`). Values are the resolved scores, so
 * an archetype switch or equipment change moves them optimistically.
 */
export function AttributesBlock({
  attributes,
}: {
  attributes: AttributeScores
}) {
  return (
    <section
      aria-label="Attributes"
      className="grid grid-cols-4 gap-1.5 text-center"
    >
      {ATTRIBUTE_ORDER.map((key) => (
        <div
          key={key}
          className="flex flex-col gap-0.5 rounded-md border bg-background/60 py-2"
        >
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {ATTRIBUTE_SHORT_LABELS[key]}
          </div>
          <div className="text-lg leading-none font-semibold tabular-nums">
            {signedModifier(attributes[key])}
          </div>
        </div>
      ))}
    </section>
  )
}

function signedModifier(value: number): string {
  if (value === 0) return "0"
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`
}
