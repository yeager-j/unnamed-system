"use server"

import { forbidden } from "next/navigation"

import {
  err,
  isPlayerOverlayEvent,
  ok,
  type Result,
} from "@workspace/game/foundation"

import { requireOwnerOrCampaignDM } from "@/lib/auth/campaign-access"
import { loadEncounterRowByShortId } from "@/lib/db/queries/load-encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { reduceCombatSession } from "@/lib/game-engine"
import { publishEncounterPing } from "@/lib/realtime/publish"

import {
  ApplyOwnCombatEventSchema,
  type ApplyOwnCombatEventError,
  type ApplyOwnCombatEventInput,
} from "./own-events.schema"
import { revalidateEncounter } from "./revalidate"

/**
 * The **player's** narrow window into the encounter session (the watch view's
 * combat-state control). A player edits only their own combatant's
 * session-overlay conditions (ailments + battle-condition axes/flags); the DM's
 * {@link import("./events").applyCombatEvent} owns everything else and stays
 * `requireCampaignDM`.
 *
 * Two guards make this safe to expose to non-DMs:
 * - **Event-kind allow-list** — {@link isPlayerOverlayEvent} rejects every
 *   turn-loop, zone, engagement, and enemy-vitals event. A player can't draft a
 *   turn, move a token, or touch an enemy through this path.
 * - **Per-combatant ownership** — the event must target a `pc` combatant in this
 *   encounter, and {@link requireOwnerOrCampaignDM} (on that combatant's
 *   character) trips `forbidden()` unless the caller owns it (or is the DM). So a
 *   player can only edit *their own* combatant, never another player's.
 *
 * Otherwise it mirrors `applyCombatEvent`: reduce the same pure
 * {@link reduceCombatSession}, persist guarded on `expectedVersion`, then publish
 * the advisory encounter ping so every watcher (the player's own view, the DM
 * console) refetches live.
 */
export async function applyOwnCombatEvent(
  input: ApplyOwnCombatEventInput
): Promise<Result<{ version: number }, ApplyOwnCombatEventError>> {
  const parsed = ApplyOwnCombatEventSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { shortId, expectedVersion, event } = parsed.data

  if (!isPlayerOverlayEvent(event)) return err("invalid-input")

  const encounter = await loadEncounterRowByShortId(shortId)
  if (encounter === null) return err("encounter-not-found")

  const combatant = encounter.session.combatants.find(
    (c) => c.id === event.combatantId
  )
  if (!combatant || combatant.ref.kind !== "pc") forbidden()
  await requireOwnerOrCampaignDM(combatant.ref.characterId)

  const next = reduceCombatSession(encounter.session, event)

  const saved = await saveEncounterSession(encounter.id, next, expectedVersion)
  if (!saved.ok) return saved

  publishEncounterPing(encounter.shortId, {
    version: saved.value.version,
    status: encounter.status,
  })

  revalidateEncounter(encounter)
  return ok({ version: saved.value.version })
}
