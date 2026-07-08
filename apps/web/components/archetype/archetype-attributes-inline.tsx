import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import { ATTRIBUTE_KEYS } from "@workspace/game-v2/kernel/vocab"

import { DetailSection } from "@/components/shared/detail-section"
import { ATTRIBUTE_LABELS } from "@/lib/ui/labels"

import { formatModifier } from "./format"

/**
 * Compact horizontal dl-style Attributes list used inside the per-row
 * summary card. Surfaces the same four scores as
 * {@link ArchetypeAttributesGrid} but optimised for at-a-glance scanning in a
 * dense list, not for the spotlight detail block.
 */
export function ArchetypeAttributesInline({
  archetype,
}: {
  archetype: Archetype
}) {
  return (
    <DetailSection inline title="Attributes">
      <dl className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {ATTRIBUTE_KEYS.map((key) => (
          <div key={key} className="flex items-baseline gap-1">
            <dt className="text-muted-foreground">{ATTRIBUTE_LABELS[key]}</dt>
            <dd className="font-medium tabular-nums">
              {formatModifier(archetype.attributes[key])}
            </dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  )
}
