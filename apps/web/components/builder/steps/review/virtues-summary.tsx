import { formatModifier } from "@/components/archetype/format"
import { VIRTUE_KEYS, type VirtueKey } from "@/lib/game/character"
import { VIRTUE_LABELS } from "@/lib/ui/labels"

import { ReviewCard } from "./shared"

/**
 * Review summary for the Step-3 Virtue allocation. Mirrors the live sheet's
 * compact `dl` layout so a player who memorised "Empathy +2, Wisdom +1,
 * Focus +1" sees the same shape they'll see post-finalize. Allocation is
 * effectively irreversible — Sparks rank Virtues up post-creation but the
 * starting allocation is locked.
 */
export function VirtuesSummary({
  shortId,
  ranks,
}: {
  shortId: string
  ranks: Record<VirtueKey, number>
}) {
  return (
    <ReviewCard
      title="Virtues"
      editStepSlug="character-origins"
      shortId={shortId}
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
        {VIRTUE_KEYS.map((key) => (
          <div key={key} className="flex items-baseline justify-between gap-2">
            <dt className="text-sm text-muted-foreground">
              {VIRTUE_LABELS[key]}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatModifier(ranks[key])}
            </dd>
          </div>
        ))}
      </dl>
    </ReviewCard>
  )
}
