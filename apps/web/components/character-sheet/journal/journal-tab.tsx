"use client"

import { BeatsCard } from "./beats-card"
import { HistoryCard } from "./history-card"
import { NotesCard } from "./notes-card"

/**
 * The Journal tab (S2b — UNN-558): the character's story surface — Knives and
 * Chains (rulebook 1.4), History (Ancestry / Background / Backstory), and the
 * free-form Notes. Entirely read-only: editing arrives with its own
 * affordance in a later ticket.
 */
export function JournalTab() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <BeatsCard list="knives" />
        <BeatsCard list="chains" />
      </div>
      <HistoryCard />
      <NotesCard />
    </div>
  )
}
