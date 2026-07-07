import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import { formatSignedBonus } from "@workspace/game-v2/skills/formula-text"

import { ATTRIBUTE_SHORT_LABELS } from "@/lib/ui/labels"

const ATTRIBUTE_ORDER = ["strength", "magic", "agility", "luck"] as const

/**
 * The rail's 4-cell attribute row — St / Ma / Ag / Lu with signed modifiers
 * (design handoff). Values are the resolved scores, so an archetype switch or
 * equipment change moves them optimistically.
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
        <div key={key} className="rounded-md border bg-background/60 py-1.5">
          <div className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {ATTRIBUTE_SHORT_LABELS[key]}
          </div>
          <div className="text-sm font-medium tabular-nums">
            {formatSignedBonus(attributes[key])}
          </div>
        </div>
      ))}
    </section>
  )
}
