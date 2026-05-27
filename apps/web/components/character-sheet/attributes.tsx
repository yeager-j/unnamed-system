import { ATTRIBUTE_KEYS } from "@/lib/game/archetypes"
import type { HydratedCharacter } from "@/lib/game/character"
import { ATTRIBUTE_LABELS } from "@/lib/ui/labels"

/**
 * The read-only Attributes block (PRD §6.1 / §7.1): Strength, Magic, Agility,
 * Luck, each showing the engine-resolved score (pre-clamped to ±7 off the
 * hydrated character — this never re-does the math). A negative renders with a
 * true minus sign (`−3`, not `-3`) and non-negatives carry an explicit `+` so
 * the modifier's sign is unambiguous. Attributes matter in every encounter
 * context (combat, social, exploration), so they live in the always-visible
 * {@link SheetHeader} rather than a tab/section, styled to match its Hit Die /
 * Skill Dice rows. A single stacked column on narrow screens; a 2×2 grid
 * tucked under the identity block on wide ones, where it backfills the height
 * the tall Vitals column would otherwise leave empty. No controls; the public
 * sheet never mutates state.
 */
export function Attributes({ character }: { character: HydratedCharacter }) {
  return (
    <dl className="grid grid-cols-1 gap-1.5 md:grid-cols-2 md:gap-x-6">
      {ATTRIBUTE_KEYS.map((key) => (
        <div key={key} className="flex items-baseline justify-between gap-2">
          <dt className="font-medium">{ATTRIBUTE_LABELS[key]}</dt>
          <dd className="text-muted-foreground tabular-nums">
            {formatModifier(character.attributes[key])}
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
