import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"
import { VIRTUE_KEYS, type VirtueKey } from "@/lib/game/character"
import { SPARK_LOG_CAPACITY, sparkLogBreakdown } from "@/lib/game/spark"

/**
 * The read-only Virtues block (PRD §6.1 / §7.5): Expression, Empathy, Wisdom,
 * Focus with their current Rank (0–7), then the shared Spark progress —
 * "Sparks: 4 / 7" with the per-Virtue breakdown of the current log inlined
 * after it. The breakdown is suppressed entirely on an empty log (no stack of
 * zeros). Compact label/value rows (the {@link Vitals} idiom). No "+1 Spark" or
 * "Rank up" controls; the public sheet never mutates state.
 */
export function Virtues({ character }: { character: HydratedCharacter }) {
  const ranks: Record<VirtueKey, number> = {
    expression: character.virtueExpression,
    empathy: character.virtueEmpathy,
    wisdom: character.virtueWisdom,
    focus: character.virtueFocus,
  }
  const breakdown = sparkLogBreakdown(character.sparkLog)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Virtues</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
          {VIRTUE_KEYS.map((key) => (
            <div
              key={key}
              className="flex items-baseline justify-between gap-2"
            >
              <dt className="text-muted-foreground">{VIRTUE_LABELS[key]}</dt>
              <dd className="font-medium tabular-nums">{ranks[key]}</dd>
            </div>
          ))}
        </dl>

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-border pt-3">
          <span className="font-medium">
            Sparks:{" "}
            <span className="tabular-nums">
              {character.sparkLog.length} / {SPARK_LOG_CAPACITY}
            </span>
          </span>
          {breakdown.length > 0 ? (
            <span className="text-muted-foreground">
              (
              {breakdown
                .map(
                  ({ virtue, count }) => `${VIRTUE_LABELS[virtue]} ×${count}`
                )
                .join(", ")}
              )
            </span>
          ) : null}
        </p>
      </CardContent>
    </Card>
  )
}

const VIRTUE_LABELS: Record<VirtueKey, string> = {
  expression: "Expression",
  empathy: "Empathy",
  wisdom: "Wisdom",
  focus: "Focus",
}
