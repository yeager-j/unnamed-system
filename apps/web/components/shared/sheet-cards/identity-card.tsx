"use client"

import type { Narrative } from "@workspace/game-v2/narrative"
import { Skeleton } from "@workspace/ui/components/skeleton"

import { Prose } from "@/components/shared/prose"
import { SectionLabel } from "@/components/shared/section-label"
import {
  SectionEditLink,
  useAnimusEditHref,
} from "@/components/shared/sheet-cards/animus-edit"
import { useViewerRole } from "@/components/shell/viewer-role"
import { CharacterRoot } from "@/domain/character/client"
import {
  IDENTITY_TRAIT_MESSAGES,
  type IdentityTraitField,
} from "@/domain/character/identity-trait-messages"

import { SheetCard } from "./sheet-card"

type EditHrefFor = (field: IdentityTraitField) => string | null

/**
 * The Identity card (design frame `10b`; rulebook 1.5): the five Identity
 * Traits as read-only Markdown — Personality full-width, then Hopes / Dreams
 * and Fears / Secrets paired. **Secrets is owner-only**: the value is
 * redacted server-side (`lib/character/redact.ts` — the rulebook shares
 * Secrets with the DM in private), and a non-owner sees the block as
 * deliberately-covered Skeleton bars rather than an absent section, so the
 * redaction reads as intentional.
 *
 * `editable` opts the card into the owner's click-to-edit affordance (UNN-221):
 * each trait heading becomes a link into the Animus writer. The sheet's Explore
 * tab passes it; other hosts (the dungeon delve column) leave it off and the
 * card stays purely read-only. Editing is never inline — the writer is the only
 * edit surface.
 */
export function IdentityCard({ editable = false }: { editable?: boolean }) {
  const { entity } = CharacterRoot.useRoot().value
  const narrative = entity.components.narrative
  const editHref = useAnimusEditHref(editable)

  const hrefFor: EditHrefFor = (field) =>
    editHref({
      kind: "identity",
      id: field,
      label: IDENTITY_TRAIT_MESSAGES[field].label,
    })

  return (
    <SheetCard title="Identity">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <TraitBlock
          field="personality"
          narrative={narrative}
          hrefFor={hrefFor}
          className="lg:col-span-2"
        />
        <TraitBlock field="hopes" narrative={narrative} hrefFor={hrefFor} />
        <TraitBlock field="dreams" narrative={narrative} hrefFor={hrefFor} />
        <TraitBlock field="fears" narrative={narrative} hrefFor={hrefFor} />
        <SecretsBlock narrative={narrative} hrefFor={hrefFor} />
      </div>
    </SheetCard>
  )
}

function SecretsBlock({
  narrative,
  hrefFor,
}: {
  narrative: Narrative | undefined
  hrefFor: EditHrefFor
}) {
  const role = useViewerRole()
  if (role === "owner") {
    return (
      <TraitBlock field="secrets" narrative={narrative} hrefFor={hrefFor} />
    )
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
  hrefFor,
  className,
}: {
  field: IdentityTraitField
  narrative: Narrative | undefined
  hrefFor: EditHrefFor
  className?: string
}) {
  const value = narrative?.[field]
  const label = IDENTITY_TRAIT_MESSAGES[field].label
  const href = hrefFor(field)

  return (
    <div className={className}>
      <SectionLabel className="mb-1.5">
        {href ? (
          <SectionEditLink href={href} ariaLabel={`Edit ${label}`}>
            {label}
          </SectionEditLink>
        ) : (
          label
        )}
      </SectionLabel>
      {value ? (
        <Prose>{value}</Prose>
      ) : (
        <p className="text-sm text-muted-foreground">—</p>
      )}
    </div>
  )
}
