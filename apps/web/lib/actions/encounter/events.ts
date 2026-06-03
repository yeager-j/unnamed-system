"use server"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadEncounterCampaignId,
  loadEncounterRowById,
} from "@/lib/db/queries/load-encounter"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { reduceCombatSession } from "@/lib/game/encounter"
import { err, ok, type Result } from "@/lib/result"

import {
  ApplyCombatEventSchema,
  type ApplyCombatEventError,
  type ApplyCombatEventInput,
} from "./events.schema"
import { revalidateEncounter } from "./revalidate"

/**
 * The impure shell that drives the pure tracker engine (ADR Decision 4): it
 * applies one {@link import("@/lib/game/encounter").CombatEvent} to an
 * encounter's persisted {@link import("@/lib/game/encounter").CombatSession} and
 * saves the result, version-guarded. The DM client mirrors the *same* event
 * through the *same* `reduceCombatSession` via `useOptimistic` (UNN-335), so the
 * wire payload is always the event — never a client-computed session.
 *
 * Flow: parse the wire payload → authorize the caller against the owning
 * campaign **before** the session is loaded (`requireCampaignDM` trips
 * `forbidden()` for a non-DM) → reduce → persist guarded on `expectedVersion`.
 * `startCombat` additionally flips the DB `status` `draft → live` after the
 * session is persisted, guarded on the just-bumped version. The reducer never
 * writes a character row; PC vitals move through their own pools actions
 * (UNN-309 / UNN-320).
 */
export async function applyCombatEvent(
  input: ApplyCombatEventInput
): Promise<Result<{ version: number }, ApplyCombatEventError>> {
  const parsed = ApplyCombatEventSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, event } = parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")

  const next = reduceCombatSession(encounter.session, event)

  const saved = await saveEncounterSession(encounterId, next, expectedVersion)
  if (!saved.ok) return saved

  if (event.kind === "startCombat") {
    const live = await setEncounterStatus(
      encounterId,
      "live",
      saved.value.version
    )
    if (!live.ok) return live
    revalidateEncounter(encounter)
    return ok({ version: live.value.version })
  }

  revalidateEncounter(encounter)
  return ok({ version: saved.value.version })
}
