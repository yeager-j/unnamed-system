import type { AttackRange } from "@workspace/game-v2/combat/attack.schema"

import { KNOWN_RANGE_LABELS } from "@/lib/ui/labels"

/** A resolved Skill's Range as a display string — a `known` range maps through
 *  {@link KNOWN_RANGE_LABELS}, a freeform range prints verbatim. */
export function rangeLabel(range: AttackRange): string {
  return range.kind === "known" ? KNOWN_RANGE_LABELS[range.value] : range.value
}
