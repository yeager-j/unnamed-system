import { cache } from "react"

import type { EncounterState } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { defineCanon, type AxisId, type Canon } from "@workspace/headcanon"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import { auth } from "@/lib/auth"
import {
  dungeonAxis,
  encounterAxis,
  entityAxisFor,
  mapInstanceAxis,
} from "@/lib/db/axes"
import { db } from "@/lib/db/client"
import { loadCampaignByShortId } from "@/lib/db/queries/load-campaign"
import { loadCombatConsoleData } from "@/lib/db/queries/load-combat-console-data"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadEncounterForSnapshot } from "@/lib/db/queries/load-encounter-session"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { VERSION_CLASSES } from "@/lib/db/version-classes"

/** One serializable, snapshot-consistent combat projection for the DM console. */
export interface EncounterForDM {
  encounter: Pick<
    EncounterRow,
    "id" | "shortId" | "campaignId" | "name" | "notes" | "status" | "version"
  >
  canon: Canon<EncounterState>
  /** Scalar retained only for the still-legacy Map Instance event queue. */
  instanceVersion: number
  participantMeta: Record<ParticipantId, ParticipantMeta>
  combatantSheetSliceById: Record<ParticipantId, CombatantSheetSlice>
}

/**
 * Loads the directly addressed encounter and every dependency its combat view
 * observes from one read-only REPEATABLE READ snapshot. The encounter axis is
 * the roster's stable container dependency; every durable participant contributes
 * all four entity axes whether or not the console can mutate that participant.
 */
export const getEncounterForDM = cache(
  async (
    campaignShortId: string,
    shortId: string,
    dungeonId?: string
  ): Promise<EncounterForDM | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    return db.transaction(
      async (tx) => {
        const loaded = await loadEncounterForSnapshot(shortId, tx)
        if (!loaded.ok) return null
        const { row, loaded: loadedSession, durableRevisions } = loaded.value

        const campaign = await loadCampaignByShortId(campaignShortId, tx)
        if (
          !campaign ||
          campaign.id !== row.campaignId ||
          campaign.dmUserId !== viewerId
        ) {
          return null
        }

        const instance = await loadMapInstanceById(row.mapInstanceId, tx)
        if (!instance) return null
        const dungeon = dungeonId
          ? await loadDungeonRowById(dungeonId, tx)
          : null
        if (dungeonId && (!dungeon || dungeon.mapInstanceId !== instance.id)) {
          return null
        }

        const participantMeta = buildParticipantMeta(loadedSession.locators)
        const combatantSheetSliceById = await loadCombatConsoleData(
          loadedSession.session,
          instance.state,
          participantMeta,
          tx
        )
        const revisions = {
          [encounterAxis(row.id)]: row.version,
          [mapInstanceAxis(instance.id)]: instance.version,
          ...(dungeon ? { [dungeonAxis(dungeon.id)]: dungeon.version } : {}),
        } as Record<AxisId, number>

        for (const [entityId, entityRevisions] of durableRevisions) {
          for (const versionClass of VERSION_CLASSES) {
            revisions[entityAxisFor[versionClass](entityId)] =
              entityRevisions[versionClass]
          }
        }

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
          canon: defineCanon({
            value: {
              session: loadedSession.session,
              mapInstance: instance.state,
            },
            revisions,
          }),
          instanceVersion: instance.version,
          participantMeta,
          combatantSheetSliceById,
        }
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    )
  }
)

function buildParticipantMeta(
  locators: ReadonlyMap<
    ParticipantId,
    { storage: "inline" } | { storage: "durable"; entityId: string }
  >
): Record<ParticipantId, ParticipantMeta> {
  const meta: Record<ParticipantId, ParticipantMeta> = {}
  for (const [participantId, locator] of locators) {
    meta[participantId] =
      locator.storage === "durable"
        ? { storage: "durable", characterId: locator.entityId }
        : { storage: "inline" }
  }
  return meta
}
