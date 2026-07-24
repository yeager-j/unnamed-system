import { cache } from "react"

import { isTombstoned, templateLabel } from "@workspace/game-v2/generation"
import { defineCanon, type AxisId, type Canon } from "@workspace/headcanon"

import type { DungeonCanonValue } from "@/domain/dungeon/commit/protocol"
import { auth } from "@/lib/auth"
import {
  dungeonAxis,
  entityAxisFor,
  mapInstanceAxis,
  regionAxis,
} from "@/lib/db/axes"
import { db } from "@/lib/db/client"
import {
  loadPlacedCharactersForCampaign,
  type CharacterSummary,
} from "@/lib/db/queries/character-list"
import { loadCampaignByShortId } from "@/lib/db/queries/load-campaign"
import { loadDungeonRowByShortId } from "@/lib/db/queries/load-dungeon"
import { loadLiveEntityRowsByIds } from "@/lib/db/queries/load-entity"
import { loadRegionRowById } from "@/lib/db/queries/load-region"
import { loadTemplateSetRowById } from "@/lib/db/queries/load-template-set"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { VERSION_CLASSES } from "@/lib/db/version-classes"

/** The DM console's spatially-complete view of a dungeon: the dungeon row plus
 *  the {@link MapInstanceRow} it references (the delve's geometry/occupancy/
 *  reveal-state). Mirrors `EncounterForDM`. */
export interface DungeonForDM {
  dungeon: DungeonRow
  instance: MapInstanceRow
  placedCharacters: CharacterSummary[]
  canon: Canon<DungeonCanonValue>
  /** The force-pick menu's template list (UNN-642): the Region's set projected
   *  to `{key, name}`, tombstoned hidden (a deleted room shouldn't be offered),
   *  label-sorted. Empty for an ordinary delve — which grows no stubs anyway.
   *  DM-only surface, so no redaction concern. */
  expandTemplates: Array<{ key: string; name: string }>
}

/**
 * Resolves the dungeon **and its Map Instance** for the current viewer, or `null`
 * if it is missing, the URL's campaign does not own it, or the viewer is not that
 * campaign's DM — a direct parallel of `getEncounterForDM` (`encounter-access.ts`).
 * The DM console (`/campaigns/{c}/dungeon/{d}`) is DM-only, and we return the *same*
 * nothing for "not found", "wrong campaign", and "not your campaign" so the route
 * 404s either way without leaking that a dungeon exists. shortIds are globally
 * unique, so the `campaignShortId` **pairing check** (`campaign.id === dungeon.campaignId`)
 * stops one campaign's URL from loading another's dungeon. A non-member is, by
 * definition, not the DM, so they 404 too. The signed-out player fog view is the
 * sibling `watch/` route (M3).
 *
 * The Instance is loaded alongside so every DM surface reads position/reveal-state
 * from one place; `mapInstanceId` is non-null, so a missing Instance row is a data
 * integrity fault and collapses to the same `null` (the route 404s).
 *
 * Per-request memoized (React `cache`) so a page, its `generateMetadata`, and any
 * sub-route resolve it once.
 */
export const getDungeonForDM = cache(
  async (
    campaignShortId: string,
    shortId: string
  ): Promise<DungeonForDM | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    return db.transaction(
      async (tx) => {
        const dungeon = await loadDungeonRowByShortId(shortId, tx)
        if (!dungeon) return null

        const campaign = await loadCampaignByShortId(campaignShortId, tx)
        if (
          !campaign ||
          campaign.id !== dungeon.campaignId ||
          campaign.dmUserId !== viewerId
        ) {
          return null
        }

        const instance = await loadMapInstanceById(dungeon.mapInstanceId, tx)
        if (!instance) return null

        const region = dungeon.regionId
          ? await loadRegionRowById(dungeon.regionId, tx)
          : null
        if (dungeon.regionId && !region) return null

        const templateSet = region
          ? await loadTemplateSetRowById(region.templateSetId, tx)
          : null
        const expandTemplates = templateSet
          ? Object.entries(templateSet.content.templates)
              .filter(([, template]) => !isTombstoned(template))
              .map(([key, template]) => ({
                key,
                name: templateLabel(key, template),
              }))
              .sort((a, b) => a.name.localeCompare(b.name))
          : []

        const placedCharacters = await loadPlacedCharactersForCampaign(
          dungeon.campaignId,
          tx
        )
        const entityRows = await loadLiveEntityRowsByIds(
          placedCharacters.map((character) => character.id),
          tx
        )
        const revisions = {
          [dungeonAxis(dungeon.id)]: dungeon.version,
          [mapInstanceAxis(instance.id)]: instance.version,
          ...(region ? { [regionAxis(region.id)]: region.version } : {}),
        } as Record<AxisId, number>
        for (const row of entityRows) {
          for (const versionClass of VERSION_CLASSES) {
            revisions[entityAxisFor[versionClass](row.id)] =
              row[`${versionClass}Version`]
          }
        }

        return {
          dungeon,
          instance,
          placedCharacters,
          canon: defineCanon({
            value: { dungeon: dungeon.state, instance: instance.state },
            revisions,
          }),
          expandTemplates,
        }
      },
      { isolationLevel: "repeatable read", accessMode: "read only" }
    )
  }
)
