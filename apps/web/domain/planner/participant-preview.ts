import { z } from "zod/v4"

import {
  allegianceSchema,
  type StoredSession,
} from "@workspace/game-v2/encounter"
import { identitySchema } from "@workspace/game-v2/kernel/identity.schema"

import { stripChipTokens } from "./chip"
import type { ParticipantRef } from "./participant"

/** How much prose a card shows before trailing off. */
const SUMMARY_LIMIT = 140

/**
 * The **chip hover-preview payload** (UNN-622, atomic-editor design §6.1): what
 * a pill's hover card shows. Fetched lazily per target — never folded into the
 * page's resolver payload, which every beat body and timeline line already
 * carries for refs nobody may hover.
 *
 * `name`/`tombstoned` are the **fallback** identity, not the display identity:
 * a caller that already resolved the ref (`ResolvedParticipant` on the display
 * path, the `ParticipantLinkWorld` snapshot in the editor) renders its own live
 * label, so a cached payload can never surface a stale name after a rename. The
 * payload's identity surfaces only where the caller has none — an editor chip
 * whose ref has left the live world, which the `deletedAt`-blind preview read
 * resolves as tombstoned.
 *
 * `sublabel` is the linker's traits line ("The Moon · Warlock", an article's
 * type, "Level 4 · Warrior", an encounter's status); `summary` is the opening
 * of the subject's prose. Articles have prose to open with (their body); NPCs
 * have no summary field yet, so theirs stays null until the ticket that adds
 * one fills it in here.
 *
 * `detail` is the embed card's second line (UNN-624) — "5 participants" for an
 * encounter, "Turn 3" for a dungeon; null for the kinds whose cards don't have
 * one. `shortId` is the URL slug for kinds whose durable ref id is not the URL
 * id (characters, encounters, dungeons) — the card's click-through composes
 * its href from it; null where the ref id already routes.
 *
 * `enemies` is the encounter card's roster line — the enemy-side combatant
 * names, one chip each (duplicates kept: two goblins are two chips, like the
 * turn-order strip). Null for every other kind. As stale as the rest of the
 * cached payload, which a preview tolerates.
 */
export interface ParticipantPreview {
  ref: ParticipantRef
  name: string
  tombstoned: boolean
  portraitUrl: string | null
  sublabel: string | null
  summary: string | null
  detail: string | null
  shortId: string | null
  enemies: string[] | null
}

const enemyOverlaySchema = z.object({ allegiance: allegianceSchema })
const inlineIdentitySchema = z.object({ identity: identitySchema })

function isEnemy(participant: StoredSession["participants"][number]): boolean {
  const overlay = enemyOverlaySchema.safeParse(participant.overlay)
  return overlay.success && overlay.data.allegiance.side === "enemies"
}

/**
 * The entity ids of a stored session's **durable** enemy-side participants —
 * the refs whose names live on the entity row, not in the blob. The preview
 * loader resolves these in one batch and feeds the result back to
 * {@link encounterEnemyLabels}.
 */
export function encounterDurableEnemyIds(session: StoredSession): string[] {
  return session.participants
    .filter(isEnemy)
    .flatMap((participant) =>
      participant.locator.storage === "durable"
        ? [participant.locator.entityId]
        : []
    )
}

/**
 * The enemy-side combatant labels of a stored session, in roster order (UNN-624
 * embed card). Inline participants carry their name in the blob
 * (`components.identity.name` — catalog enemies materialize to inline at mint);
 * durable ones read from `durableNames`. Malformed overlays are skipped and
 * missing names fall back rather than break — a preview is an enhancement.
 */
export function encounterEnemyLabels(
  session: StoredSession,
  durableNames: ReadonlyMap<string, string>
): string[] {
  return session.participants.filter(isEnemy).map((participant) => {
    if (participant.locator.storage === "durable") {
      return durableNames.get(participant.locator.entityId) ?? "Unknown enemy"
    }
    const components = inlineIdentitySchema.safeParse(
      participant.locator.entity.components
    )
    const name = components.success ? components.data.identity.name.trim() : ""
    return name === "" ? "Unnamed enemy" : name
  })
}

/**
 * The opening of a chip-bearing markdown body, as a card-sized plain-text
 * summary: chip tokens collapse to their labels (a raw `[[npc:id|Maren]]` in a
 * preview would be worse than nothing), whitespace collapses to single spaces,
 * and an over-long body trails off at the last whole word inside the limit.
 * `null` for a body with nothing in it.
 */
export function previewSummary(markdown: string): string | null {
  const text = stripChipTokens(markdown).replace(/\s+/g, " ").trim()
  if (text === "") return null
  if (text.length <= SUMMARY_LIMIT) return text

  const clipped = text.slice(0, SUMMARY_LIMIT)
  const lastSpace = clipped.lastIndexOf(" ")
  return `${(lastSpace === -1 ? clipped : clipped.slice(0, lastSpace)).trimEnd()}…`
}
