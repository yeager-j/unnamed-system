import { ATTRIBUTE_KEYS, type Archetype } from "@/lib/game/archetypes/schema"
import { ATTRIBUTE_SHORT_LABELS } from "@/lib/ui/labels"

import { DetailSection } from "../../shared/detail-section"
import { formatModifier } from "../format"

export function ArchetypeAttributes({ archetype }: { archetype: Archetype }) {
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
