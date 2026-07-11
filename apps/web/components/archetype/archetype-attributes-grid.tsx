import type { Archetype } from "@workspace/game-v2/archetypes/archetype"
import { ATTRIBUTE_KEYS } from "@workspace/game-v2/kernel/vocab"

import { DetailSection } from "@/components/shared/detail-section"
import { ATTRIBUTE_SHORT_LABELS } from "@/domain/labels"

import { formatModifier } from "./format"

/** The structural slice this widget reads — both engines' catalog Archetypes
 *  satisfy it (UNN-556: the builder passes v2, the sheet passes v1). */
type AttributesSlice = Pick<Archetype, "attributes">

/**
 * The four-cell Attribute mini-grid shared by the Active Archetype card on
 * the Archetypes tab, the per-Archetype drawer, and the Origin Archetype
 * preview in the builder. Pure render off the catalog entry — no character
 * context — so it works equally well in catalog-only surfaces.
 */
export function ArchetypeAttributesGrid({
  archetype,
}: {
  archetype: AttributesSlice
}) {
  return (
    <DetailSection title="Attributes">
      <dl className="grid grid-cols-4 gap-2 text-center">
        {ATTRIBUTE_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-col gap-0.5 rounded-none border border-border p-2"
          >
            <dt className="text-xs text-muted-foreground">
              {ATTRIBUTE_SHORT_LABELS[key]}
            </dt>
            <dd className="text-base font-semibold tabular-nums">
              {formatModifier(archetype.attributes[key])}
            </dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  )
}
