"use client"

import { IdentityCard } from "./identity-card"
import { TalentsCard } from "./talents-card"
import { VirtuesCard } from "./virtues-card"

/**
 * The Explore tab (S2b — UNN-558): the character's out-of-combat capability
 * surface — Virtues + the Spark loop, Talents, and the Identity Traits. Prose
 * is read-only (editing arrives with its own affordance in a later ticket);
 * the owner's writes here are the click-writes: Add Spark / Rank Up and
 * Add / Remove Talent.
 */
export function ExploreTab() {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <VirtuesCard />
        <TalentsCard />
      </div>
      <IdentityCard />
    </div>
  )
}
