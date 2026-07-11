"use client"

import { Prose } from "@/components/shared/prose"
import { SectionLabel } from "@/components/shared/section-label"
import { useLoadedCharacter } from "@/hooks/use-entity-write"

import { SheetCard } from "../sheet-card"

/**
 * The History card (rulebook 1.4): the two setting-defined slots — Ancestry
 * and Background — over the long-form Backstory. Read-only Markdown.
 */
export function HistoryCard() {
  const { entity } = useLoadedCharacter()
  const narrative = entity.components.narrative

  return (
    <SheetCard title="History">
      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
        <ShortField label="Ancestry" value={narrative?.ancestry ?? null} />
        <ShortField label="Background" value={narrative?.background ?? null} />
        <div className="lg:col-span-2">
          <SectionLabel className="mb-1.5">Backstory</SectionLabel>
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
