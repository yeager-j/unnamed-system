import { ATTRIBUTE_LABELS } from "@/lib/ui/labels"
import { ATTRIBUTE_KEYS, type AttributeScores } from "@/lib/ui/vocab"

/**
 * The read-only Attributes label/value list (PRD §6.1 / §7.1): Strength, Magic,
 * Agility, Luck with their signed modifiers. Pure render off a resolved
 * {@link AttributeScores} — no character context, no re-derivation — so the
 * character sheet (its own attributes), the combat drawer (a PC's derived
 * scores or an enemy's stat-block scores), and any other surface share one
 * implementation. A negative renders with a true Unicode minus.
 */
export function AttributeGrid({ attributes }: { attributes: AttributeScores }) {
  return (
    <dl className="grid grid-cols-1 gap-1.5 md:grid-cols-2 md:gap-x-6">
      {ATTRIBUTE_KEYS.map((key) => (
        <div key={key} className="flex items-baseline justify-between gap-2">
          <dt className="font-medium">{ATTRIBUTE_LABELS[key]}</dt>
          <dd className="text-muted-foreground tabular-nums">
            {formatModifier(attributes[key])}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Signed modifier with a true Unicode minus for negatives: `+4`, `0`, `−3`. */
function formatModifier(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return "0"
}
