"use client"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"
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
import { CombatStateDisplay } from "@/components/combat/conditions/state-display"
import { ViewerRoleProvider } from "@/components/shell/viewer-role"
import { CharacterProvider } from "@/hooks/use-character"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot-v2"

/**
 * The watch view's **left column**: the signed-in viewer's own character
 * sheet(s) for this encounter, built from the *same* sheet components the public
 * `/c/{shortId}` page renders (`SheetHeader`, `Affinities`, `MechanicWidget`,
 * `Skills`) wrapped in owner mode — so the player manages their live vitals and
 * archetype mechanic in place. The combatant's session overlay (ailments + battle
 * conditions) is shown **read-only** via {@link CombatStateDisplay}: a player can
 * see what's affecting them, but combat conditions are the DM's to set. On v2
 * (UNN-535) the overlay reads straight off the redacted combatant's components —
 * the viewer owns this combatant, so redaction kept everything.
 *
 * A viewer can own more than one combatant in an encounter (multiple characters
 * placed in the campaign), so the column tabs between them; a single owned
 * character drops the tab bar.
 */
export function CombatSheetColumn({
  snapshot,
  ownedSheets,
}: {
  snapshot: SpatialEncounterSnapshot
  ownedSheets: OwnedEncounterSheet[]
}) {
  if (ownedSheets.length === 1) {
    return <OwnedSheet snapshot={snapshot} sheet={ownedSheets[0]!} />
  }

  return (
    <Tabs defaultValue={ownedSheets[0]!.participantId} className="gap-4">
      <TabsList className="w-full">
        {ownedSheets.map((sheet) => (
          <TabsTrigger
            key={sheet.participantId}
            value={sheet.participantId}
            className="flex-1 truncate"
          >
            {sheet.character.name}
          </TabsTrigger>
        ))}
      </TabsList>
      {ownedSheets.map((sheet) => (
        <TabsContent key={sheet.participantId} value={sheet.participantId}>
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
  snapshot: SpatialEncounterSnapshot
  sheet: OwnedEncounterSheet
}) {
  const combatant = snapshot.combatants.find(
    (candidate) => candidate.id === sheet.participantId
  )
  const overlay = combatant?.components

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
          {overlay?.battleConditions ? (
            <section aria-label="Combat State">
              <CombatStateDisplay
                ailments={overlay.ailments ?? []}
                battleConditions={overlay.battleConditions}
                conditionDurations={overlay.conditionDurations ?? {}}
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
