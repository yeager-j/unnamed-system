"use client"

import { Prose } from "@/components/shared/prose"
import { useLoadedCharacter } from "@/hooks/use-entity-write"

import { SheetCard } from "../sheet-card"

const BEAT_LIST_COPY = {
  knives: {
    title: "Knives",
    untitled: "Untitled Knife",
    empty: "No Knives yet — what could the world threaten?",
  },
  chains: {
    title: "Chains",
    untitled: "Untitled Chain",
    empty: "No Chains yet — what holds you back?",
  },
} as const

/**
 * One card for either Identity-beat list (rulebook 1.4) — Knives (external
 * stakes) and Chains (internal limits) share their shape, so the list key is
 * the parameter. Entries render in array order (display order IS the order,
 * D36) as an accent-edged title + Markdown description.
 */
export function BeatsCard({ list }: { list: "knives" | "chains" }) {
  const { entity } = useLoadedCharacter()
  const copy = BEAT_LIST_COPY[list]
  const beats = entity.components.narrative?.[list] ?? []

  return (
    <SheetCard
      title={copy.title}
      headerSlot={
        beats.length > 0 ? (
          <span className="text-sm font-bold text-muted-foreground tabular-nums">
            {beats.length}
          </span>
        ) : undefined
      }
    >
      {beats.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {beats.map((beat, index) => (
            <li key={index} className="border-l-2 border-primary pl-3">
              <p className="text-sm font-semibold text-foreground">
                {beat.title || copy.untitled}
              </p>
              {beat.description ? (
                <Prose className="mt-1">{beat.description}</Prose>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {copy.empty}
        </p>
      )}
    </SheetCard>
  )
}
