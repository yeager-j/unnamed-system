"use client"

import type { Narrative } from "@workspace/game-v2/narrative"

import {
  IDENTITY_TRAIT_MESSAGES,
  type IdentityTraitField,
} from "@/components/builder/movements/animus/identity-trait-messages"
import { Prose } from "@/components/shared/prose"
import { OwnerOnly } from "@/components/shell/viewer-role"
import { useLoadedCharacter } from "@/hooks/use-entity-write"

import { SectionLabel } from "../section-label"
import { SheetCard } from "../sheet-card"

/**
 * The Identity card (design frame `10b`; rulebook 1.5): the five Identity
 * Traits as read-only Markdown — Personality full-width, then Hopes / Dreams
 * and Fears / Secrets paired. **Secrets renders for the owner only** (the
 * rulebook shares them with the DM in private; this is the narrative
 * component's app-level read boundary). Editing arrives with its own
 * affordance in a later ticket.
 */
export function IdentityCard() {
  const { entity } = useLoadedCharacter()
  const narrative = entity.components.narrative

  return (
    <SheetCard title="Identity">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <TraitBlock
          field="personality"
          narrative={narrative}
          className="lg:col-span-2"
        />
        <TraitBlock field="hopes" narrative={narrative} />
        <TraitBlock field="dreams" narrative={narrative} />
        <TraitBlock field="fears" narrative={narrative} />
        <OwnerOnly>
          <TraitBlock field="secrets" narrative={narrative} />
        </OwnerOnly>
      </div>
    </SheetCard>
  )
}

function TraitBlock({
  field,
  narrative,
  className,
}: {
  field: IdentityTraitField
  narrative: Narrative | undefined
  className?: string
}) {
  const value = narrative?.[field]

  return (
    <div className={className}>
      <SectionLabel className="mb-1.5">
        {IDENTITY_TRAIT_MESSAGES[field].label}
      </SectionLabel>
      {value ? (
        <Prose>{value}</Prose>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  )
}
