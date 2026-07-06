import "server-only"

import { notFound } from "next/navigation"
import { cache } from "react"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"

import { loadEntityRowByShortId } from "@/lib/db/queries/load-entity"
import type { EntityRow, EntityStatus } from "@/lib/db/schema/entity"
import type { VersionClass } from "@/lib/db/version-classes"
import { resolveEntity } from "@/lib/game-engine-v2"
import { loadEntityRow } from "@/lib/game-v2/entity-row-to-bag"

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
  status: EntityStatus
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

function toProfile(row: EntityRow): CharacterProfile {
  return {
    id: row.id,
    shortId: row.shortId,
    ownerId: row.ownerId,
    campaignId: row.campaignId,
    status: row.status,
    builderStep: row.builderStep,
    name: row.name,
    portraitUrl: row.portraitUrl,
    pronouns: row.pronouns,
    notes: row.notes,
    versions: {
      identity: row.identityVersion,
      vitals: row.vitalsVersion,
      inventory: row.inventoryVersion,
      progression: row.progressionVersion,
    },
  }
}

/**
 * Loads a character by its public `shortId`, or `null` when no row exists
 * (callers decide between `notFound()` and a redirect). A load-seam failure —
 * a stored component that no longer parses — is a data-integrity bug, not a
 * missing character: it logs the per-component issues and 404s rather than
 * rendering half an entity. `cache()`-memoized so layout + page + provider
 * share one query per request.
 */
export const loadCharacterByShortId = cache(
  async (shortId: string): Promise<LoadedCharacter | null> => {
    const row = await loadEntityRowByShortId(shortId)
    if (!row) return null

    const loaded = loadEntityRow(row)
    if (!loaded.ok) {
      console.error(
        `[loadCharacterByShortId] entity ${row.id} failed the load seam`,
        loaded.error
      )
      notFound()
    }

    return {
      profile: toProfile(row),
      entity: loaded.value,
      resolved: resolveEntity(loaded.value),
    }
  }
)
