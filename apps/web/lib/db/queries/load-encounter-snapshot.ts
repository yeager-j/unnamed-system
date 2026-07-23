import { cache } from "react"

import {
  derivePartyCompositionBySide,
  participantResolveContext,
  spatialReadsFor,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import {
  projectSpatialEncounterSnapshot,
  type SpatialEncounterSnapshot,
} from "@workspace/game-v2/visibility"
import { defineCanon, type AxisId, type Canon } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import {
  entityRowVersions,
  toCharacterMount,
  toCharacterProfile,
  type CharacterMount,
} from "@/domain/character/load"
import { resolveEntity, resolveSession } from "@/domain/game-engine-v2"
import { dungeonExitAnchors } from "@/domain/map/view/exit-anchors"
import { deriveViewer } from "@/lib/auth/derive-viewer"
import { encounterAxis, entityAxisFor, mapInstanceAxis } from "@/lib/db/axes"
import { db } from "@/lib/db/client"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import {
  loadEncounterForSnapshot,
  type LoadedEncounterForSnapshot,
} from "@/lib/db/queries/load-encounter-session"
import { loadEntityRowsByIds } from "@/lib/db/queries/load-entity"
import { loadPlayerCharacterRowsByIds } from "@/lib/db/queries/load-player-character"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { VERSION_CLASSES } from "@/lib/db/version-classes"

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
 * 5. The canon records the encounter, Map Instance, and all four axes for every
 *    durable participant from the same repeatable-read observation.
 *
 * `campaign-not-found` / `map-instance-not-found` are data-integrity arms (both
 * FKs are NOT NULL): surfaced, never papered over.
 */
export interface EncounterSnapshotResult {
  canon: Canon<SpatialEncounterSnapshot>
}

type GetEncounterSnapshotError =
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
  shortId: string,
  campaignShortId?: string
): Promise<Result<EncounterSnapshotResult, GetEncounterSnapshotError>> {
  return projectSnapshotCore(shortId, false, campaignShortId)
}

/**
 * The redacted watcher snapshot for a fight running **on a delve** (UNN-536) —
 * the fogged twin of {@link getEncounterSnapshot}. A delve is fog-of-war: the
 * projector clamps zones/connections/combatants to what the DM has revealed, so
 * players see the combat battlefield exactly as far as they've explored.
 */
export async function getDungeonCombatSnapshot(
  shortId: string,
  campaignShortId?: string
): Promise<Result<EncounterSnapshotResult, GetEncounterSnapshotError>> {
  return projectSnapshotCore(shortId, true, campaignShortId)
}

/**
 * The encounter's row + dissolved session + its campaign and Map Instance —
 * everything both reads on this module need. `cache()`-memoized because a watch
 * page runs **two** of them per request (the snapshot and the viewer's owned
 * sheets), and they must agree on the same session anyway.
 */
const loadSnapshotInputs = cache(
  async (
    shortId: string
  ): Promise<Result<SnapshotInputs, GetEncounterSnapshotError>> =>
    db.transaction(
      async (tx) => {
        const loaded = await loadEncounterForSnapshot(shortId, tx)
        if (!loaded.ok) return loaded

        const [campaign, instance] = await Promise.all([
          loadCampaignRowById(loaded.value.row.campaignId, tx),
          loadMapInstanceById(loaded.value.row.mapInstanceId, tx),
        ])
        if (!campaign) return err("campaign-not-found")
        if (!instance) return err("map-instance-not-found")

        return ok({ ...loaded.value, campaign, instance })
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    )
)

interface SnapshotInputs extends LoadedEncounterForSnapshot {
  campaign: CampaignRow
  instance: MapInstanceRow
}

/** The shared load → pairing-check → derive-viewer → resolve → project →
 *  version-fold core, with the one `fog` clamp decided by each entry point. The
 *  encounter's shortId is globally unique, so the optional `campaignShortId`
 *  pairing check (`campaign.shortId === campaignShortId`) is what stops the watch
 *  URL of one campaign from resolving another campaign's encounter; a mismatch
 *  collapses to the `encounter-not-found` 404. Pairing is enforced only when a
 *  campaign frames the read (the nested watch page passes it). */
async function projectSnapshotCore(
  shortId: string,
  fog: boolean,
  campaignShortId?: string
): Promise<Result<EncounterSnapshotResult, GetEncounterSnapshotError>> {
  const inputs = await loadSnapshotInputs(shortId)
  if (!inputs.ok) return inputs
  if (campaignShortId && inputs.value.campaign.shortId !== campaignShortId) {
    return err("encounter-not-found")
  }
  const {
    row,
    loaded: session,
    durableRevisions,
    durableOwners,
    campaign,
    instance,
  } = inputs.value

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
    fog,
    fog ? dungeonExitAnchors(instance.state) : {}
  )

  const revisions = {
    [encounterAxis(row.id)]: row.version,
    [mapInstanceAxis(instance.id)]: instance.version,
  } as Record<AxisId, number>
  for (const [entityId, entityRevisions] of durableRevisions) {
    for (const versionClass of VERSION_CLASSES) {
      revisions[entityAxisFor[versionClass](entityId)] =
        entityRevisions[versionClass]
    }
  }

  return ok({ canon: defineCanon({ value: snapshot, revisions }) })
}

/**
 * A durable combatant the watch viewer owns: the roster id it occupies (the key
 * the snapshot's overlay reads correlate on), its provider mount (profile +
 * versioned canon), and the encounter context its derived values are re-folded
 * with — the watch column's `EntityWriteProvider` re-derives `resolved` from
 * the predicted entity through it, so a click's predicted numbers match the
 * server's.
 */
export interface OwnedEncounterSheet {
  participantId: ParticipantId
  character: CharacterMount
  resolveContext: ResolveContext
}

/**
 * The sheets for the encounter's durable combatants the **signed-in viewer
 * owns** — what fills the watch view's own-sheet column (UNN-566). Empty for a
 * spectator, a signed-out viewer, or a campaign member with no character placed
 * here; the column then doesn't render and the battlefield takes the full width.
 *
 * Ownership reads off the already-surfaced `durableOwners` map, so only the
 * viewer's own characters are assembled — another player's entity is never
 * loaded, let alone shipped. The redacted snapshot remains the only PC data a
 * non-owner receives.
 *
 * Each sheet resolves through `participantResolveContext` — the same builder the
 * DM drawer's loader calls — so a player's Skill card and the DM's cannot show
 * different numbers for the same combatant.
 *
 * The watch's observe-only root refreshes the RSC carrier whenever any observed
 * encounter, instance, or entity axis advances, so these props and the redacted
 * battlefield arrive in the same route payload without a client comparison key.
 */
export async function loadOwnedEncounterSheets(
  shortId: string,
  viewerId: string
): Promise<OwnedEncounterSheet[]> {
  const inputs = await loadSnapshotInputs(shortId)
  if (!inputs.ok) return []
  const { loaded: session, durableOwners, instance } = inputs.value

  const owned = session.session.participants.flatMap((participant) => {
    const locator = session.locators.get(participant.id)
    if (locator?.storage !== "durable") return []
    if (durableOwners.get(locator.entityId) !== viewerId) return []
    return [{ participant, entityId: locator.entityId }]
  })
  if (owned.length === 0) return []

  const spatialReads = spatialReadsFor(instance.state)
  const compositionBySide = derivePartyCompositionBySide(
    resolveSession(session.session, instance.state)
  )
  const ownedIds = owned.map((o) => o.entityId)
  const rows = await loadEntityRowsByIds(ownedIds)
  const rowById = new Map(rows.map((entityRow) => [entityRow.id, entityRow]))
  const subtypeRows = await loadPlayerCharacterRowsByIds(ownedIds)
  const subtypeById = new Map(subtypeRows.map((pc) => [pc.entityId, pc]))

  return owned.flatMap(({ participant, entityId }) => {
    const entityRow = rowById.get(entityId)
    const subtypeRow = subtypeById.get(entityId)
    if (!entityRow || !subtypeRow) return []

    const resolveContext = participantResolveContext(
      spatialReads,
      compositionBySide,
      participant
    )

    return [
      {
        participantId: participant.id,
        character: toCharacterMount({
          profile: toCharacterProfile({ ...subtypeRow, entity: entityRow }),
          entity: participant.entity,
          resolved: resolveEntity(participant.entity, resolveContext),
          versions: entityRowVersions(entityRow),
        }),
        resolveContext,
      },
    ]
  })
}
