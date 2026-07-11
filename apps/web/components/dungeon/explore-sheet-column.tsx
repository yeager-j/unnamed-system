"use client"

import { IdentityCard } from "@/components/character-sheet/explore/identity-card"
import { TalentsCard } from "@/components/character-sheet/explore/talents-card"
import { VirtuesCard } from "@/components/character-sheet/explore/virtues-card"
import {
  OwnedSheetTabs,
  type OwnedSheet,
} from "@/components/combat/watch/owned-sheet-tabs"
import { OwnerSheetHeader } from "@/components/combat/watch/owner-sheet-header"
import type { LoadedCharacter } from "@/domain/character/load"

/**
 * The dungeon watch's **own-sheet column** during exploration (UNN-566): the
 * signed-in viewer's delve character(s), shown as the vitals masthead plus the
 * Explore surface's cards (Virtues, Talents, Identity) — so a player spends a
 * Spark, ranks up a Virtue, or checks a Talent while the DM runs the delve.
 *
 * The {@link import("@/components/character-sheet/explore/explore-tab").ExploreTab}
 * root is deliberately **not** reused: its side-by-side card grid keys off the
 * *viewport* breakpoint, so in a narrow rail it lays two tracks that overflow.
 * The column stacks the same cards instead.
 *
 * No encounter means no resolve context: these sheets resolve partyless and
 * zone-blind, exactly as `/c/{shortId}` does. The combat column
 * ({@link import("@/components/combat/watch/combat-sheet-column").CombatSheetColumn})
 * is the fight-phase peer; the watch page forks between them.
 */
export function DungeonExploreSheetColumn({
  characters,
}: {
  characters: LoadedCharacter[]
}) {
  const sheets: OwnedSheet[] = characters.map((character) => ({
    key: character.profile.id,
    character,
  }))

  return (
    <OwnedSheetTabs
      sheets={sheets}
      renderSheet={() => (
        <div className="flex flex-col gap-5">
          <OwnerSheetHeader />
          <VirtuesCard />
          <TalentsCard />
          <IdentityCard />
        </div>
      )}
    />
  )
}
