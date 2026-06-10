"use server"

import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import {
  loadEncounterCampaignId,
  loadEncounterRowById,
  loadLiveEncounterForCampaign,
} from "@/lib/db/queries/load-encounter"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { reduceCombatSession } from "@/lib/game-engine"
import { publishEncounterPing } from "@/lib/realtime/publish"

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
 *
 * The `startCombat` status flip is a *second* guarded write, so the two are not
 * atomic: if the session save commits but the status flip fails, the action
 * returns that error and the encounter is left `draft` with `advantage` set.
 * Recovery is **not** a transparent retry — the client must reload (seeing the
 * bumped version + still-`draft` status) and re-issue with the new
 * `expectedVersion`; re-applying `startCombat` is a reducer no-op (UNN-303), so
 * the re-issue re-persists the same session and lands the status flip. The DM
 * client contract (UNN-335) owns that reload-and-reissue path.
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

  // Single-live-encounter-per-campaign guard (UNN-302): a `startCombat` is
  // rejected if another encounter in this campaign already holds the live slot.
  if (event.kind === "startCombat") {
    const live = await loadLiveEncounterForCampaign(campaignId)
    if (live && live.id !== encounterId) {
      return err("campaign-already-has-live-encounter")
    }
  }

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")

  const next = reduceCombatSession(encounter.session, event)

  const saved = await saveEncounterSession(encounterId, next, expectedVersion)
  if (!saved.ok) return saved

  let version = saved.value.version
  if (event.kind === "startCombat") {
    const live = await setEncounterStatus(encounterId, "live", version)
    if (!live.ok) return live
    version = live.value.version
  }

  publishEncounterPing(encounter.shortId, {
    version,
    status: event.kind === "startCombat" ? "live" : encounter.status,
  })

  revalidateEncounter(encounter)
  return ok({ version })
}
