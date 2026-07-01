"use server"

import { saveSession, sweepOverlay } from "@workspace/game-v2/encounter"
import { pruneCombat } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadEncounterCampaignId } from "@/lib/db/queries/load-encounter"
import { loadEncounterForWrite } from "@/lib/db/queries/load-encounter-v2"
import { loadMapInstanceV2ById } from "@/lib/db/queries/map-instance-v2"
import { setEncounterStatus } from "@/lib/db/writes/encounter"
import { saveStoredEncounterSession } from "@/lib/db/writes/encounter-v2"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import {
  publishEncounterInstancePing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import { revalidateEncounter } from "../encounter/revalidate"
import {
  EndCombatSchema,
  type EndCombatError,
  type EndCombatInput,
} from "./end-combat.schema"

/**
 * The v2 **composed combat-end** (UNN-520; ADR §2.8/§2.10, CD16): one
 * {@link guardMany} transaction over both aggregates —
 *
 * 1. the session blob saves **swept** ({@link sweepOverlay} clears every
 *    participant's combat-scoped overlay; durable components survive),
 * 2. the Instance saves **pruned** ({@link pruneCombat} drops the ephemeral
 *    combatants' tokens, frees every survivor's engagement, clears the Zone
 *    Enchantment; durable/PC tokens persist where the fight ended), and
 * 3. the encounter's status flips to `ended`,
 *
 * atomic over both version tokens, modeled on v1's `endDungeonCombatAction`.
 * The prune keys generalize v1's "non-`pc` combatants" onto the **lifecycle
 * axis**: the pruned ids are exactly the participants whose locator is
 * `inline` — the ephemeral ones — read off the authoritative out-of-band map.
 *
 * The mechanics `resetOn: "encounter"` sweep (`sweepEncounterEnd`) is
 * deliberately **not** wired here — it writes character rows, is a
 * player-visible behavior change v1 never shipped, and is ticketed separately.
 */
export async function endCombatAction(
  input: EndCombatInput
): Promise<Result<{ version: number }, EndCombatError>> {
  const parsed = EndCombatSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, expectedInstanceVersion } = parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  const loaded = await loadEncounterForWrite(encounterId)
  if (!loaded.ok) return loaded
  const { row, loaded: loadedSession } = loaded.value
  if (row.status !== "live") return err("encounter-not-live")

  const instance = await loadMapInstanceV2ById(row.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  const swept = sweepOverlay(loadedSession.session)
  const stored = saveSession(swept, loadedSession.locators)
  if (!stored.ok) return err("locator-missing")

  const ephemeralIds = loadedSession.session.participants
    .filter(
      (participant) =>
        loadedSession.locators.get(participant.id)?.storage === "inline"
    )
    .map((participant) => participant.id)
  const pruned = pruneCombat(instance.state, ephemeralIds)

  const result = await guardMany<
    { encounterVersion: number; instanceVersion: number },
    EndCombatError
  >(async (tx: WriteExecutor) => {
    const saved = await saveStoredEncounterSession(
      row.id,
      stored.value,
      expectedVersion,
      tx
    )
    if (!saved.ok) return saved

    const ended = await setEncounterStatus(
      row.id,
      "ended",
      saved.value.version,
      tx
    )
    if (!ended.ok) return ended

    const inst = await saveMapInstanceState(
      tx,
      row.mapInstanceId,
      pruned,
      expectedInstanceVersion
    )
    if (!inst.ok) return inst

    return ok({
      encounterVersion: ended.value.version,
      instanceVersion: inst.value.version,
    })
  })
  if (!result.ok) return result

  publishEncounterPing(row.shortId, {
    version: result.value.encounterVersion,
    status: "ended",
  })
  publishEncounterInstancePing(row.shortId, result.value.instanceVersion)
  revalidateEncounter(row)

  return ok({ version: result.value.encounterVersion })
}
