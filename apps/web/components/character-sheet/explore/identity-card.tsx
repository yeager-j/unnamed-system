"use client"

import type { Narrative } from "@workspace/game-v2/narrative"
import { Skeleton } from "@workspace/ui/components/skeleton"

import {
  IDENTITY_TRAIT_MESSAGES,
  type IdentityTraitField,
} from "@/components/builder/movements/animus/identity-trait-messages"
import { Prose } from "@/components/shared/prose"
import { useViewerRole } from "@/components/shell/viewer-role"
import { useLoadedCharacter } from "@/hooks/use-entity-write"

import { SectionLabel } from "../section-label"
import { SheetCard } from "../sheet-card"

/**
 * The Identity card (design frame `10b`; rulebook 1.5): the five Identity
 * Traits as read-only Markdown — Personality full-width, then Hopes / Dreams
 * and Fears / Secrets paired. **Secrets is owner-only**: the value is
 * redacted server-side (`lib/character/redact.ts` — the rulebook shares
 * Secrets with the DM in private), and a non-owner sees the block as
 * deliberately-covered Skeleton bars rather than an absent section, so the
 * redaction reads as intentional. Editing arrives with its own affordance in
 * a later ticket.
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
        <SecretsBlock narrative={narrative} />
      </div>
    </SheetCard>
  )
}

function SecretsBlock({ narrative }: { narrative: Narrative | undefined }) {
  const role = useViewerRole()
  if (role === "owner") {
    return <TraitBlock field="secrets" narrative={narrative} />
  }

  return (
    <div>
      <SectionLabel className="mb-1.5">
        {IDENTITY_TRAIT_MESSAGES.secrets.label}
      </SectionLabel>
      <div
        role="img"
        aria-label="Secrets are hidden — shared with the DM in private"
        className="flex flex-col gap-1.5 pt-1"
      >
        {/* Static (animate-none): a pulsing skeleton reads as "loading",
            a still one as "covered". */}
        <Skeleton className="h-3.5 w-full animate-none" />
        <Skeleton className="h-3.5 w-3/5 animate-none" />
      </div>
    </div>
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
