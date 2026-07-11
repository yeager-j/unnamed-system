import "server-only"

import { notFound } from "next/navigation"
import { cache } from "react"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { resolveEntity } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import {
  loadLivePlayerCharactersByIds,
  loadPlayerCharacterByShortId,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"
import type { PlayerCharacterStatus } from "@/lib/db/schema/player-character"
import type { VersionClass } from "@/lib/db/version-classes"

/**
 * The character read side's **one load boundary** (ADR §2.6; UNN-556): a
 * character route fetches the row once, assembles it into a runtime entity,
 * runs `resolveEntity` **once**, and hands its surfaces the loaded triple.
 * The builder is the first consumer; the S2 sheet shell reuses it.
 */

/** The app-owned fields (typed off the table) a character surface renders and
 *  writes around — content-named, never storage-tiered (the F1 rule). */
export interface CharacterProfile {
  id: string
  shortId: string
  ownerId: string
  campaignId: string | null
  status: PlayerCharacterStatus
  builderStep: number
  name: string
  portraitUrl: string | null
  pronouns: string | null
  notes: string | null
  /** The four per-write-class tokens (CH4) — seeds the provider's refs. */
  versions: Record<VersionClass, number>
}

/**
 * What a character route's provider holds: the app profile, the authored
 * runtime {@link Entity} (the optimistic re-fold's base, and where surfaces
 * read authored choices — `path.choice`, `archetypes.origin`, `narrative.*`),
 * and the {@link ResolvedEntity} read-units derivation produced.
 */
export interface LoadedCharacter {
  profile: CharacterProfile
  entity: Entity
  resolved: ResolvedEntity
}

/** The app-owned columns, projected off a loaded player character (R3 — UNN-573):
 *  its own lifecycle facts plus its `entity` substrate. Exported for the loaders
 *  that already hold a dissolved runtime entity (the watch's owned combatants) and
 *  need only the profile half of the triple. */
export function toCharacterProfile(
  pc: LoadedPlayerCharacter
): CharacterProfile {
  return {
    id: pc.entity.id,
    shortId: pc.entity.shortId,
    ownerId: pc.userId,
    campaignId: pc.campaignId,
    status: pc.status,
    builderStep: pc.builderStep,
    name: pc.entity.name,
    portraitUrl: pc.entity.portraitUrl,
    pronouns: pc.entity.pronouns,
    notes: pc.entity.notes,
    versions: {
      identity: pc.entity.identityVersion,
      vitals: pc.entity.vitalsVersion,
      inventory: pc.entity.inventoryVersion,
      progression: pc.entity.progressionVersion,
    },
  }
}

/**
 * Assembles one loaded player character into the read triple, or `null` when the
 * substrate fails the load seam — a stored component that no longer parses is a
 * data-integrity bug, logged with its per-component issues. Resolves partyless
 * and zone-blind: an off-encounter resolve is pure over the entity.
 */
function entityRowToLoadedCharacter(
  pc: LoadedPlayerCharacter
): LoadedCharacter | null {
  const loaded = loadEntityRow(pc.entity)
  if (!loaded.ok) {
    console.error(
      `[character/load] entity ${pc.entity.id} failed the load seam`,
      { issues: loaded.error }
    )
    return null
  }

  return {
    profile: toCharacterProfile(pc),
    entity: loaded.value,
    resolved: resolveEntity(loaded.value),
  }
}

/**
 * Loads a character by its public `shortId`, or `null` when no row exists
 * (callers decide between `notFound()` and a redirect). A load-seam failure is
 * a data-integrity bug, not a missing character: it 404s rather than rendering
 * half an entity. `cache()`-memoized so layout + page + provider share one
 * query per request.
 */
export const loadCharacterByShortId = cache(
  async (shortId: string): Promise<LoadedCharacter | null> => {
    const pc = await loadPlayerCharacterByShortId(shortId)
    if (!pc) return null

    const loaded = entityRowToLoadedCharacter(pc)
    if (!loaded) notFound()
    return loaded
  }
)

/**
 * A batch of characters by entity id, resolved partyless — what the dungeon
 * watch's own-sheet column mounts for the delve tokens the viewer owns
 * (UNN-566). Returned in the caller's id order so the column's tabs stay
 * stable across polls. A row that fails the load seam is **omitted**: one
 * corrupt character must not take down a whole watch page, and the caller's
 * surface is a column that simply lists one fewer sheet.
 *
 * **Live-only (R1 — UNN-571):** the ids are dungeon Instance occupancy, not a
 * pinned encounter locator, so this reads through {@link loadLivePlayerCharactersByIds}
 * — a soft-deleted token drops off the own-sheet column instead of rendering as
 * history.
 */
export async function loadCharactersByIds(
  entityIds: readonly string[]
): Promise<LoadedCharacter[]> {
  const pcs = await loadLivePlayerCharactersByIds(entityIds)
  const pcById = new Map(pcs.map((pc) => [pc.entity.id, pc]))

  return entityIds.flatMap((entityId) => {
    const pc = pcById.get(entityId)
    if (!pc) return []
    const loaded = entityRowToLoadedCharacter(pc)
    return loaded ? [loaded] : []
  })
}
