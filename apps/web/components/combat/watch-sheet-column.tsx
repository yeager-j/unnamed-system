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

import { PlayerCombatStateControl } from "./player-combat-state-control"

/**
 * The watch view's **left column**: the signed-in viewer's own character
 * sheet(s) for this encounter, built from the *same* sheet components the public
 * `/c/{shortId}` page renders (`SheetHeader`, `Affinities`, `MechanicWidget`,
 * `Skills`) wrapped in owner mode — so the player manages their live vitals and
 * archetype mechanic in place. The session-overlay conditions are the one swap:
 * {@link PlayerCombatStateControl} replaces the sheet's character-row
 * `CombatState` (the conditions a PC carries in combat live on the encounter, not
 * the character row).
 *
 * A viewer can own more than one combatant in an encounter (multiple characters
 * placed in the campaign), so the column tabs between them; a single owned
 * character drops the tab bar.
 */
export function WatchSheetColumn({
  shortId,
  snapshot,
  ownedSheets,
}: {
  shortId: string
  snapshot: EncounterSnapshot
  ownedSheets: OwnedEncounterSheet[]
}) {
  if (ownedSheets.length === 1) {
    return (
      <OwnedSheet
        shortId={shortId}
        snapshot={snapshot}
        sheet={ownedSheets[0]!}
      />
    )
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
          <OwnedSheet shortId={shortId} snapshot={snapshot} sheet={sheet} />
        </TabsContent>
      ))}
    </Tabs>
  )
}

function OwnedSheet({
  shortId,
  snapshot,
  sheet,
}: {
  shortId: string
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
            <PlayerCombatStateControl
              shortId={shortId}
              snapshotVersion={snapshot.version}
              combatant={combatant}
            />
          ) : null}
          <section aria-label="Skills">
            <Skills />
          </section>
        </div>
      </CharacterProvider>
    </ViewerRoleProvider>
  )
}
