"use client"

import { type HydratedCharacter } from "@workspace/game/foundation"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { ExploreSections } from "@/components/character-sheet/explore/explore-sections"
import { Talents } from "@/components/character-sheet/explore/talents"
import { Virtues } from "@/components/character-sheet/explore/virtues"
import { SheetHeader } from "@/components/character-sheet/sheet-header"
import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import { CharacterProvider } from "@/hooks/use-character"

/**
 * The dungeon player view's **left column** during exploration (non-combat):
 * the signed-in viewer's own character sheet(s) shown as the Explore-tab content
 * — `SheetHeader` plus the reference (Virtues, Talents) and story
 * ({@link ExploreSections}) the public `/c/{shortId}` Explore tab renders —
 * wrapped in **owner mode** so the player keeps their identity/progression
 * editable here, mirroring how {@link import("@/components/combat/watch/combat-sheet-column").CombatSheetColumn}
 * composes the combat sheet column. The full {@link
 * import("@/components/character-sheet/explore/explore-tab").ExploreTab} root is
 * deliberately *not* reused: its sticky rail + window-scroll jump-nav don't fit
 * an internally-scrolling side column.
 *
 * A viewer can own more than one character placed in this delve, so the column
 * tabs between them; a single owned character drops the tab bar.
 */
export function DungeonExploreSheetColumn({
  characters,
}: {
  characters: HydratedCharacter[]
}) {
  if (characters.length === 1) {
    return <ExploreSheet character={characters[0]!} />
  }

  return (
    <Tabs defaultValue={characters[0]!.id} className="gap-4">
      <TabsList className="w-full">
        {characters.map((character) => (
          <TabsTrigger
            key={character.id}
            value={character.id}
            className="flex-1 truncate"
          >
            {character.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {characters.map((character) => (
        <TabsContent key={character.id} value={character.id}>
          <ExploreSheet character={character} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function ExploreSheet({ character }: { character: HydratedCharacter }) {
  return (
    <ViewerRoleProvider role="owner">
      <CharacterProvider character={character}>
        <div className="flex flex-col gap-4">
          <SheetHeader />
          <section aria-label="Virtues">
            <Virtues />
          </section>
          <section aria-label="Talents">
            <Talents />
          </section>
          <ExploreSections />
        </div>
      </CharacterProvider>
    </ViewerRoleProvider>
  )
}
