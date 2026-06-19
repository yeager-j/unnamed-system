"use client"

import { type EncounterSnapshot } from "@workspace/game/engine"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { Affinities } from "@/components/character-sheet/affinities"
import { MechanicWidget } from "@/components/character-sheet/mechanics/mechanic-widget"
import { SheetHeader } from "@/components/character-sheet/sheet-header"
import { Skills } from "@/components/character-sheet/skills"
import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import { CharacterProvider } from "@/hooks/use-character"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot"

import { CombatStateDisplay } from "./combat-state-display"

/**
 * The watch view's **left column**: the signed-in viewer's own character
 * sheet(s) for this encounter, built from the *same* sheet components the public
 * `/c/{shortId}` page renders (`SheetHeader`, `Affinities`, `MechanicWidget`,
 * `Skills`) wrapped in owner mode — so the player manages their live vitals and
 * archetype mechanic in place. The combatant's session overlay (ailments + battle
 * conditions) is shown **read-only** via {@link CombatStateDisplay}: a player can
 * see what's affecting them, but combat conditions are the DM's to set.
 *
 * A viewer can own more than one combatant in an encounter (multiple characters
 * placed in the campaign), so the column tabs between them; a single owned
 * character drops the tab bar.
 */
export function WatchSheetColumn({
  snapshot,
  ownedSheets,
}: {
  snapshot: EncounterSnapshot
  ownedSheets: OwnedEncounterSheet[]
}) {
  if (ownedSheets.length === 1) {
    return <OwnedSheet snapshot={snapshot} sheet={ownedSheets[0]!} />
  }

  return (
    <Tabs defaultValue={ownedSheets[0]!.combatantId} className="gap-4">
      <TabsList className="w-full">
        {ownedSheets.map((sheet) => (
          <TabsTrigger
            key={sheet.combatantId}
            value={sheet.combatantId}
            className="flex-1 truncate"
          >
            {sheet.character.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {ownedSheets.map((sheet) => (
        <TabsContent key={sheet.combatantId} value={sheet.combatantId}>
          <OwnedSheet snapshot={snapshot} sheet={sheet} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function OwnedSheet({
  snapshot,
  sheet,
}: {
  snapshot: EncounterSnapshot
  sheet: OwnedEncounterSheet
}) {
  const combatant = snapshot.combatants.find((c) => c.id === sheet.combatantId)

  return (
    <ViewerRoleProvider role="owner">
      <CharacterProvider character={sheet.character}>
        <div className="flex flex-col gap-4">
          <SheetHeader />
          <section aria-label="Affinities">
            <Affinities />
          </section>
          {sheet.character.activeMechanic ? (
            <section aria-label="Archetype Mechanic">
              <MechanicWidget />
            </section>
          ) : null}
          {combatant ? (
            <section aria-label="Combat State">
              <CombatStateDisplay
                ailments={combatant.ailments}
                battleConditions={combatant.battleConditions}
                conditionDurations={combatant.conditionDurations}
              />
            </section>
          ) : null}
          <section aria-label="Skills">
            <Skills />
          </section>
        </div>
      </CharacterProvider>
    </ViewerRoleProvider>
  )
}
