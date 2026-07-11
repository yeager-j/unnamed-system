import { inArray } from "drizzle-orm"
import { cache } from "react"

import type { Session, StoredEntityLocator } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db/client"
import { loadCampaignByShortId } from "@/lib/db/queries/load-campaign"
import { loadEncounterForSnapshot } from "@/lib/db/queries/load-encounter-v2"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { entity } from "@/lib/db/schema/entity"

/**
 * The DM console's spatially-complete view of an encounter on v2: the row
 * summary (no raw blob — the dissolved {@link Session} is the client's state),
 * the Map-Instance state + version token, and {@link ParticipantMeta} per
 * roster id. Everything is JSON-serializable (the loader's locator `Map` is
 * projected away) so the page can hand it straight to the client console.
 */
export interface EncounterForDM {
  encounter: Pick<
    EncounterRow,
    "id" | "shortId" | "campaignId" | "name" | "notes" | "status" | "version"
  >
  session: Session
  instance: { state: MapInstanceState; version: number }
  participantMeta: Record<ParticipantId, ParticipantMeta>
}

/**
 * Resolves the encounter **and its Map Instance** for the current viewer, or
 * `null` if it is missing, the URL's campaign does not own it, or the viewer is
 * not that campaign's DM. The DM console and its sub-routes are DM-only, and we
 * return the *same* nothing for "not found", "wrong campaign", "not your
 * campaign", and a data-integrity failure (an unparseable blob, a dangling
 * durable reference, a missing Instance) so the route 404s either way without
 * leaking that an encounter exists. shortIds are globally unique, so the
 * `campaignShortId` **pairing check** (`campaign.id === row.campaignId`) is what
 * stops `/campaigns/A/encounter/X` from loading campaign B's encounter X. The
 * signed-out player watch view is the sibling `watch/` route (UNN-322).
 *
 * Per-request memoized (React `cache`) so a page, its `generateMetadata`, and
 * any sub-route resolve it once — shared by the console and its `setup/` browse
 * sub-route (UNN-346).
 */
export const getEncounterForDM = cache(
  async (
    campaignShortId: string,
    shortId: string
  ): Promise<EncounterForDM | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    const loaded = await loadEncounterForSnapshot(shortId)
    if (!loaded.ok) return null
    const { row, loaded: loadedSession, durableVersions } = loaded.value

    const campaign = await loadCampaignByShortId(campaignShortId)
    if (
      !campaign ||
      campaign.id !== row.campaignId ||
      campaign.dmUserId !== viewerId
    )
      return null

    const instance = await loadMapInstanceById(row.mapInstanceId)
    if (!instance) return null

    const participantMeta = await buildParticipantMeta(
      loadedSession.locators,
      durableVersions
    )

    return {
      encounter: {
        id: row.id,
        shortId: row.shortId,
        campaignId: row.campaignId,
        name: row.name,
        notes: row.notes,
        status: row.status,
        version: row.version,
      },
      session: loadedSession.session,
      instance: { state: instance.state, version: instance.version },
      participantMeta,
    }
  }
)

/**
 * Projects the loader's out-of-band locator map into the serializable
 * {@link ParticipantMeta} record, batch-resolving each durable participant's
 * public `entity` `shortId` (the realtime channel key) in one indexed read.
 */
async function buildParticipantMeta(
  locators: Map<ParticipantId, StoredEntityLocator>,
  durableVersions: Map<string, number>
): Promise<Record<ParticipantId, ParticipantMeta>> {
  const durableIds = [
    ...new Set(
      [...locators.values()].flatMap((locator) =>
        locator.storage === "durable" ? [locator.entityId] : []
      )
    ),
  ]

  const shortIdRows = durableIds.length
    ? await db
        .select({ id: entity.id, shortId: entity.shortId })
        .from(entity)
        .where(inArray(entity.id, durableIds))
    : []
  const shortIdById = new Map(shortIdRows.map((row) => [row.id, row.shortId]))

  const meta: Record<ParticipantId, ParticipantMeta> = {}
  for (const [participantId, locator] of locators) {
    meta[participantId] =
      locator.storage === "durable"
        ? {
            storage: "durable",
            characterId: locator.entityId,
            vitalsVersion: durableVersions.get(locator.entityId) ?? 0,
            characterShortId: shortIdById.get(locator.entityId) ?? "",
          }
        : { storage: "inline" }
  }
  return meta
}
