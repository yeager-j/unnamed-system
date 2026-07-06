import { derivePartyCompositionBySide } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { zoneEnchantmentEffects } from "@workspace/game-v2/mechanics"
import {
  projectSpatialEncounterSnapshot,
  type SpatialEncounterSnapshot,
} from "@workspace/game-v2/visibility"
import {
  err,
  ok,
  type HydratedCharacter,
  type Result,
} from "@workspace/game/foundation"

import { deriveViewer } from "@/lib/auth/derive-viewer"
import { foldSnapshotVersion } from "@/lib/combat/snapshot-version"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadHydratedCharacterById } from "@/lib/db/queries/load-character"
import { loadEncounterForSnapshot } from "@/lib/db/queries/load-encounter-v2"
import { loadMapInstanceV2ById } from "@/lib/db/queries/map-instance-v2"
import { resolveSession } from "@/lib/game-engine-v2"

/**
 * The **v2 snapshot read boundary** (UNN-530; combat ADR §2.6/CD12) — the query
 * PR11's console/watch consume, and the read-side twin of the UNN-520
 * write-router. One composition, decided in order:
 *
 * 1. {@link loadEncounterForSnapshot} parses + dissolves the encounter by its
 *    watch-URL `shortId` (durable rows hydrated, versions + owners surfaced).
 * 2. {@link deriveViewer} mints the branded `TrustedViewer` from the
 *    authenticated session — the only door into the projection, so a
 *    client-supplied relationship claim is unrepresentable.
 * 3. {@link resolveSession} resolves every participant once (zone context +
 *    three-home merged views).
 * 4. {@link projectSpatialEncounterSnapshot} redacts per relationship off the
 *    one visibility policy table (dropped components are structurally absent),
 *    then layers the fog-clamped spatial fields — zones, connections/exits,
 *    enchantment, `instanceVersion` — the watch's board renders (UNN-535).
 * 5. {@link foldSnapshotVersion} folds `encounter.version` ×
 *    `mapInstance.version` × every durable `vitalsVersion` into the composite
 *    version the client's stale-retry equality-compares.
 *
 * `campaign-not-found` / `map-instance-not-found` are data-integrity arms (both
 * FKs are NOT NULL): surfaced, never papered over.
 */
export interface EncounterSnapshotResult {
  snapshot: SpatialEncounterSnapshot
  compositeVersion: string
}

export type GetEncounterSnapshotError =
  | "encounter-not-found"
  | "invalid-session"
  | "participant-load-failed"
  | "campaign-not-found"
  | "map-instance-not-found"

/**
 * The redacted watcher snapshot for one encounter, **full map — no fog clamp**
 * (every mapless encounter is a standalone Instance). Fog is the caller's
 * provenance decision, decided **once** here (mapless) vs. in
 * {@link getDungeonCombatSnapshot} (a delve, fogged); it is NOT derivable inside
 * the projector, which combat moves also write.
 */
export async function getEncounterSnapshot(
  shortId: string
): Promise<Result<EncounterSnapshotResult, GetEncounterSnapshotError>> {
  return projectSnapshotCore(shortId, false)
}

/**
 * The redacted watcher snapshot for a fight running **on a delve** (UNN-536) —
 * the fogged twin of {@link getEncounterSnapshot}. A delve is fog-of-war: the
 * projector clamps zones/connections/combatants to what the DM has revealed, so
 * players see the combat battlefield exactly as far as they've explored.
 */
export async function getDungeonCombatSnapshot(
  shortId: string
): Promise<Result<EncounterSnapshotResult, GetEncounterSnapshotError>> {
  return projectSnapshotCore(shortId, true)
}

/** The shared load → derive-viewer → resolve → project → version-fold core, with
 *  the one `fog` clamp decided by each entry point. */
async function projectSnapshotCore(
  shortId: string,
  fog: boolean
): Promise<Result<EncounterSnapshotResult, GetEncounterSnapshotError>> {
  const loaded = await loadEncounterForSnapshot(shortId)
  if (!loaded.ok) return loaded
  const { row, loaded: session, durableVersions, durableOwners } = loaded.value

  const [campaign, instance] = await Promise.all([
    loadCampaignRowById(row.campaignId),
    loadMapInstanceV2ById(row.mapInstanceId),
  ])
  if (!campaign) return err("campaign-not-found")
  if (!instance) return err("map-instance-not-found")

  const viewer = await deriveViewer({ campaign, durableOwners })
  const view = resolveSession(session.session, instance.state)

  const snapshot = projectSpatialEncounterSnapshot(
    session.session,
    view,
    viewer,
    {
      status: row.status,
      name: row.name,
      campaignShortId: campaign.shortId,
      version: row.version,
    },
    instance.state,
    instance.version,
    fog
  )

  return ok({
    snapshot,
    compositeVersion: foldSnapshotVersion({
      encounterVersion: row.version,
      instanceVersion: instance.version,
      durableVersions,
    }),
  })
}

/** A durable combatant the watch viewer owns: the roster id it occupies (the
 *  key overlay events + combatant writes target) + its hydrated sheet. */
export interface OwnedEncounterSheet {
  participantId: ParticipantId
  character: HydratedCharacter
}

/**
 * The hydrated sheets for the encounter's durable combatants the **signed-in
 * viewer owns** — what fills the watch view's left column. Empty for a
 * spectator, a signed-out viewer, or a member with no placed character here. A
 * viewer can own more than one combatant in an encounter (the column tabs
 * between them). The v2 twin of the v1 loader (UNN-535): ownership reads off
 * the already-surfaced `durableOwners` map, so only the viewer's own
 * characters hydrate — another player's full sheet is never loaded, let alone
 * shipped; the redacted snapshot remains the only PC data a non-owner receives.
 *
 * Each sheet hydrates with the encounter's party composition for its own side
 * (the `perPartyLineage` Attack-Roll scalers, UNN-367) and its zone's resolved
 * Enchantment effects — the same scaled values the DM drawer shows.
 *
 * **S0 degraded window (UNN-551):** the watch's owned-sheet column is a v1
 * `HydratedCharacter` render, and a durable combatant is now an `entity` row with
 * no `characters` twin — so `loadHydratedCharacterById` returns null and this
 * yields **empty** (the column simply doesn't render). It does not crash. The v2
 * owned-sheet read model — the resolved read-units the redesigned watch column
 * consumes — lands with the sheet slice (S2), which replaces this loader wholesale.
 */
export async function loadOwnedEncounterSheets(
  shortId: string,
  viewerId: string
): Promise<OwnedEncounterSheet[]> {
  const loaded = await loadEncounterForSnapshot(shortId)
  if (!loaded.ok) return []
  const { row, loaded: session, durableOwners } = loaded.value

  const instance = await loadMapInstanceV2ById(row.mapInstanceId)
  if (!instance) return []

  const owned = session.session.participants.flatMap((participant) => {
    const locator = session.locators.get(participant.id)
    if (locator?.storage !== "durable") return []
    if (durableOwners.get(locator.entityId) !== viewerId) return []
    return [
      {
        participantId: participant.id,
        characterId: locator.entityId,
        side: participant.overlay.allegiance.side,
        zoneId: instance.state.occupancy[participant.id]?.zoneId ?? "",
      },
    ]
  })
  if (owned.length === 0) return []

  const view = resolveSession(session.session, instance.state)
  const compositionBySide = derivePartyCompositionBySide(view)

  const sheets = await Promise.all(
    owned.map(async (pc) => {
      const character = await loadHydratedCharacterById(pc.characterId, {
        partyComposition: compositionBySide[pc.side],
        zoneEffects: zoneEnchantmentEffects(
          instance.state.enchantment,
          pc.zoneId
        ),
      })
      return character ? { participantId: pc.participantId, character } : null
    })
  )

  return sheets.filter((sheet) => sheet !== null)
}
