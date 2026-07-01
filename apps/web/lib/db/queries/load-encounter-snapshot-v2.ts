import {
  projectEncounterSnapshot,
  type EncounterSnapshot,
} from "@workspace/game-v2/visibility"
import { err, ok, type Result } from "@workspace/game/foundation"

import { deriveViewer } from "@/lib/auth/derive-viewer"
import { foldSnapshotVersion } from "@/lib/combat/snapshot-version"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
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
 * 4. {@link projectEncounterSnapshot} redacts per relationship off the one
 *    visibility policy table (dropped components are structurally absent).
 * 5. {@link foldSnapshotVersion} folds `encounter.version` ×
 *    `mapInstance.version` × every durable `vitalsVersion` into the composite
 *    version the client's stale-retry equality-compares.
 *
 * `campaign-not-found` / `map-instance-not-found` are data-integrity arms (both
 * FKs are NOT NULL): surfaced, never papered over.
 */
export interface EncounterSnapshotResult {
  snapshot: EncounterSnapshot
  compositeVersion: string
}

export type GetEncounterSnapshotError =
  | "encounter-not-found"
  | "invalid-session"
  | "participant-load-failed"
  | "campaign-not-found"
  | "map-instance-not-found"

/** The redacted watcher snapshot for one encounter, by watch-URL `shortId`. */
export async function getEncounterSnapshot(
  shortId: string
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

  const snapshot = projectEncounterSnapshot(session.session, view, viewer, {
    status: row.status,
    name: row.name,
    campaignShortId: campaign.shortId,
    version: row.version,
  })

  return ok({
    snapshot,
    compositeVersion: foldSnapshotVersion({
      encounterVersion: row.version,
      instanceVersion: instance.version,
      durableVersions,
    }),
  })
}
