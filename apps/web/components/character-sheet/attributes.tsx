import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { HydratedCharacter } from "@/lib/db/load-character"
import { ATTRIBUTE_KEYS, type AttributeKey } from "@/lib/game/archetypes/schema"

/**
 * The read-only Attributes block (PRD §6.1 / §7.1): Strength, Magic, Agility,
 * Luck, each showing the engine-resolved score. Values arrive pre-clamped to
 * ±7 off the hydrated character — this component never re-does the math. A
 * negative renders with a true minus sign (`−3`, not `-3`) and non-negatives
 * carry an explicit `+` so the modifier's sign is unambiguous. Rendered as a
 * compact label/value row grid (the {@link Vitals} idiom) so the sheet's many
 * sections stay scannable without endless scrolling. No controls; the public
 * sheet never mutates state.
 */
export function Attributes({ character }: { character: HydratedCharacter }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attributes</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
          {ATTRIBUTE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2"
            >
              <dt className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</dt>
              <dd className="font-medium tabular-nums">
                {formatModifier(character.attributes[key])}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  strength: "Strength",
  magic: "Magic",
  agility: "Agility",
  luck: "Luck",
}

/** Signed modifier with a true Unicode minus for negatives: `+4`, `0`, `−3`. */
function formatModifier(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return "0"
}
