"use client"

import type { ParticipantViewComponents } from "@workspace/game-v2/encounter/participant-view"
import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import { AffinityStrip } from "@/components/character-sheet/combat/affinity-strip"
import { SkillCastSection } from "@/components/character-sheet/combat/skill-cast-section"
import { MechanicWidget } from "@/components/character-sheet/mechanics/mechanic-widget"
import { CombatStateDisplay } from "@/components/combat/conditions/state-display"
import { useLoadedCharacter } from "@/hooks/use-entity-write"
import { buildAffinityStrip } from "@/lib/character/view/affinity-strip"
import type { OwnedEncounterSheet } from "@/lib/db/queries/load-encounter-snapshot-v2"

import { OwnedSheetTabs, type OwnedSheet } from "./owned-sheet-tabs"
import { OwnerSheetHeader } from "./owner-sheet-header"

/** The overlay components of one combatant, as the redacted snapshot carries
 *  them. The viewer's own combatant keeps every one (they're public-to-all),
 *  but the wire type marks each optional — a combatant the snapshot no longer
 *  lists (removed mid-fight) simply drops the section. */
type CombatantOverlay = Partial<ParticipantViewComponents>

/**
 * The encounter watch's **own-sheet column** (UNN-566): the signed-in viewer's
 * combatant(s) here, built from the *same* v2 sheet components `/c/{shortId}`
 * renders — so a player takes damage, spends SP, and drives their Archetype
 * mechanic without leaving the battlefield.
 *
 * Each sheet is resolved server-side with its combatant's party composition and
 * Zone Enchantment effects, and its provider re-folds optimistically through
 * that same context — so the Skill numbers here match the DM's drawer exactly.
 *
 * The session overlay (ailments + battle conditions) shows **read-only**: a
 * player sees what's afflicting them, but conditions are the DM's to set.
 */
export function CombatSheetColumn({
  snapshot,
  ownedSheets,
}: {
  snapshot: SpatialEncounterSnapshot
  ownedSheets: OwnedEncounterSheet[]
}) {
  const sheets: OwnedSheet[] = ownedSheets.map((sheet) => ({
    key: sheet.participantId,
    character: sheet.character,
    resolveContext: sheet.resolveContext,
  }))

  // Resolved against the true (branded) participant id here, so the tab key
  // downstream stays an opaque string.
  const overlayByKey = new Map<string, CombatantOverlay>(
    ownedSheets.map((sheet) => [
      sheet.participantId,
      snapshot.combatants.find(
        (combatant) => combatant.id === sheet.participantId
      )?.components ?? {},
    ])
  )

  return (
    <OwnedSheetTabs
      sheets={sheets}
      renderSheet={(sheet) => (
        <CombatSheetBody overlay={overlayByKey.get(sheet.key) ?? {}} />
      )}
    />
  )
}

function CombatSheetBody({ overlay }: { overlay: CombatantOverlay }) {
  const { resolved } = useLoadedCharacter()

  return (
    <div className="flex flex-col gap-5">
      <OwnerSheetHeader />
      <MechanicWidget />
      {overlay.battleConditions ? (
        <CombatStateDisplay
          ailments={overlay.ailments ?? []}
          battleConditions={overlay.battleConditions}
          conditionDurations={overlay.conditionDurations ?? {}}
        />
      ) : null}
      <AffinityStrip cells={buildAffinityStrip(resolved)} />
      <SkillCastSection />
    </div>
  )
}
