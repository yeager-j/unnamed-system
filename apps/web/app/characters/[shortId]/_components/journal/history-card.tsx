"use client"

import { Prose } from "@/components/shared/prose"
import { SectionLabel } from "@/components/shared/section-label"
import {
  SectionEditLink,
  useAnimusEditHref,
} from "@/components/shared/sheet-cards/animus-edit"
import { SheetCard } from "@/components/shared/sheet-cards/sheet-card"
import { useLoadedCharacter } from "@/domain/entity/use-entity-write"

/**
 * The History card (rulebook 1.4): the two setting-defined slots — Ancestry
 * and Background — over the long-form Backstory. Read-only Markdown; the owner
 * edits Backstory in the Animus writer via the heading link (UNN-221).
 * Ancestry / Background are setting-defined, not writer fields, so they stay
 * plain.
 */
export function HistoryCard() {
  const { entity } = useLoadedCharacter()
  const narrative = entity.components.narrative
  const backstoryHref = useAnimusEditHref()({
    kind: "backstory",
    id: "backstory",
    label: "Backstory",
  })

  return (
    <SheetCard title="History">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <ShortField label="Ancestry" value={narrative?.ancestry ?? null} />
        <ShortField label="Background" value={narrative?.background ?? null} />
        <div className="lg:col-span-2">
          <SectionLabel className="mb-1.5">
            {backstoryHref ? (
              <SectionEditLink href={backstoryHref} ariaLabel="Edit Backstory">
                Backstory
              </SectionEditLink>
            ) : (
              "Backstory"
            )}
          </SectionLabel>
          {narrative?.backstory ? (
            <Prose>{narrative.backstory}</Prose>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>
    </SheetCard>
  )
}

function ShortField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <SectionLabel className="mb-1.5">{label}</SectionLabel>
      <p className="text-sm text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </p>
    </div>
  )
}
