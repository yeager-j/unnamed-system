"use client"

import Link from "next/link"

import { Prose } from "@/components/shared/prose"
import {
  SectionEditLink,
  useAnimusEditHref,
  useAnimusWriterHref,
} from "@/components/shared/sheet-cards/animus-edit"
import { SheetCard } from "@/components/shared/sheet-cards/sheet-card"
import { CharacterRoot } from "@/domain/character/client"

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
 *
 * Read-only: the owner edits in the Animus writer (UNN-221) by clicking a beat
 * title (deep-links to that entry) or, when the list is empty, the empty-state
 * prompt (opens the writer to add the first entry).
 */
export function BeatsCard({ list }: { list: "knives" | "chains" }) {
  const { entity } = CharacterRoot.useRoot().value
  const copy = BEAT_LIST_COPY[list]
  const beats = entity.components.narrative?.[list] ?? []
  const beatKind = list === "knives" ? "knife" : "chain"
  const editHref = useAnimusEditHref()
  const writerHref = useAnimusWriterHref()

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
          {beats.map((beat, index) => {
            const title = beat.title || copy.untitled
            const href = editHref({
              kind: beatKind,
              id: String(index),
              label: beat.title,
            })
            return (
              <li key={index} className="border-l-2 border-primary pl-3">
                <p className="text-sm font-semibold text-foreground">
                  {href ? (
                    <SectionEditLink href={href} ariaLabel={`Edit ${title}`}>
                      {title}
                    </SectionEditLink>
                  ) : (
                    title
                  )}
                </p>
                {beat.description ? (
                  <Prose className="mt-1">{beat.description}</Prose>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : writerHref ? (
        <Link
          href={writerHref}
          className="block rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground transition-colors outline-none hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.empty}
        </Link>
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {copy.empty}
        </p>
      )}
    </SheetCard>
  )
}
