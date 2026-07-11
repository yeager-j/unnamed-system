"use client"

import type { AffinityStripCell } from "@/domain/character/view/affinity-strip"

import { AffinityStrip } from "./affinity-strip"
import { SkillCastSection } from "./skill-cast-section"

/**
 * The Combat tab (S2a): the affinity strip over the Skill-card grid. The strip
 * pins to the top of the scrolling content column; the cards and their **Use
 * Skill** cast live in the shared {@link SkillCastSection}, which the watch's
 * own-sheet column renders too (UNN-566).
 *
 * Attack previews resolve partyless here (CH8) — party-scaled terms read 0. In
 * an encounter they don't: the watch column's provider carries the combatant's
 * party composition.
 */
export function CombatTab({ cells }: { cells: AffinityStripCell[] }) {
  return (
    <div className="flex flex-col">
      <div className="z-10 border-b bg-background px-5 py-3 lg:sticky lg:top-0">
        <AffinityStrip cells={cells} />
      </div>
      <div className="px-5 py-4">
        <SkillCastSection />
      </div>
    </div>
  )
}
