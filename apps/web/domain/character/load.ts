import "server-only"

import { notFound } from "next/navigation"
import { cache } from "react"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import { defineCanon, type Canon } from "@workspace/headcanon"

import type { CharacterCanonValue } from "@/domain/character/commit/protocol"
import { resolveEntity } from "@/domain/game-engine-v2"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { entityAxisFor } from "@/lib/db/axes"
import {
  loadLivePlayerCharactersByIds,
  loadPlayerCharacterByShortId,
  type LoadedPlayerCharacter,
} from "@/lib/db/queries/load-player-character"
import type { VersionClass } from "@/lib/db/version-classes"

import type { CharacterProfile } from "./types"

/**
 * The character read side's **one load boundary** (ADR §2.6; UNN-556): a
 * character route fetches the row once, assembles it into a runtime entity,
 * runs `resolveEntity` **once**, and hands its surfaces the loaded triple.
 * The builder is the first consumer; the S2 sheet shell reuses it.
 */

/** The app-owned fields (typed off the table) a character surface renders and
 *  writes around — content-named, never storage-tiered (the F1 rule). */
export type { CharacterProfile } from "./types"

/**
 * What a character route's server side holds: the app profile, the authored
 * runtime {@link Entity} (where surfaces read authored choices —
 * `path.choice`, `archetypes.origin`, `narrative.*`), the
 * {@link ResolvedEntity} read-units derivation produced, and the four axis
 * revisions observed in the same row read.
 *
 * `versions` is **read evidence for the canon, never a write token** (the P2d
 * cutover, UNN-676): it exists solely so {@link toCharacterCanon} can stamp
 * the revision vector after route-level redaction has run. No client code
 * reads it — the mounted provider receives the resulting canon.
 */
export interface LoadedCharacter {
  profile: CharacterProfile
  entity: Entity
  resolved: ResolvedEntity
  versions: Record<VersionClass, number>
}

/** The four axis revisions as one `entity`-row observation carries them —
 *  shared by every loader that assembles a {@link LoadedCharacter}, so the
 *  column-to-class mapping is decided once. */
export function entityRowVersions(row: {
  identityVersion: number
  vitalsVersion: number
  inventoryVersion: number
  progressionVersion: number
}): Record<VersionClass, number> {
  return {
    identity: row.identityVersion,
    vitals: row.vitalsVersion,
    inventory: row.inventoryVersion,
    progression: row.progressionVersion,
  }
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
    versions: entityRowVersions(pc.entity),
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
 * Projects a loaded character into a Headcanon {@link Canon} observing the four
 * entity axes (UNN-673, AC #3). The canon value is the complete character
 * aggregate consumed by the shared root: its profile, authored {@link Entity},
 * and {@link ResolvedEntity}.
 *
 * The profile and four revisions come from one joined row observation (a single
 * SELECT in {@link loadCharacterByShortId}), so they share one snapshot — the
 * "one authoritative observation" invariant holds without a
 * snapshot-isolated multi-query loader. `defineCanon` brands the raw version
 * integers and throws if a stored column is not a valid revision.
 *
 * Call this **after** `redactLoadedCharacterForViewer` — the canon value is the
 * client's optimistic base, so a pre-redaction canon would hand a public viewer
 * the secrets the route boundary just stripped.
 */
export function toCharacterCanon(
  loaded: LoadedCharacter
): Canon<CharacterCanonValue> {
  const { versions } = loaded
  const { id } = loaded.profile
  return defineCanon({
    value: {
      profile: loaded.profile,
      entity: loaded.entity,
      resolved: loaded.resolved,
    },
    revisions: {
      [entityAxisFor.identity(id)]: versions.identity,
      [entityAxisFor.vitals(id)]: versions.vitals,
      [entityAxisFor.inventory(id)]: versions.inventory,
      [entityAxisFor.progression(id)]: versions.progression,
    },
  })
}

/**
 * Exactly what a mounted `CharacterProvider` needs across the RSC boundary:
 * one versioned character canon, without a duplicate profile or entity payload.
 */
export interface CharacterMount {
  canon: Canon<CharacterCanonValue>
}

/** Projects one (already redacted, where applicable) loaded character into its
 *  provider-mount shape. */
export function toCharacterMount(loaded: LoadedCharacter): CharacterMount {
  return { canon: toCharacterCanon(loaded) }
}

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
