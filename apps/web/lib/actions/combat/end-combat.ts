"use server"

import { saveSession, sweepOverlay } from "@workspace/game-v2/encounter"
import { pruneCombat } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import {
  loadEncounterAndInstanceVersions,
  loadEncounterEnvelopeById,
} from "@/lib/db/queries/load-encounter"
import { loadEncounterForWriteLocked } from "@/lib/db/queries/load-encounter-session"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import {
  loadMapInstanceForWriteLocked,
  saveLockedMapInstanceState,
} from "@/lib/db/writes/map-instance"
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
 * The v2 **composed combat-end** (UNN-520; de-versioned by UNN-657): one
 * {@link guardMany} transaction over both aggregates —
 *
 * 1. the session blob saves **swept** ({@link sweepOverlay} clears every
 *    participant's combat-scoped overlay; durable components survive),
 * 2. the Instance saves **pruned** ({@link pruneCombat} drops the ephemeral
 *    combatants' tokens, frees every survivor's engagement, clears the Zone
 *    Enchantment; durable/PC tokens persist where the fight ended), and
 * 3. the encounter's status flips to `ended`,
 *
 * atomic behind the canonical Instance → encounter lock order, with the
 * sweep/prune computed from the **locked** read. No client `expectedVersion`.
 *
 * Ambiguous-delivery strategy — `ended` is terminal desired state: a
 * redelivered end returns `ok` with the current versions, never re-sweeps.
 * Because a committed end freezes the Instance, the retry surfaces either at
 * the terminal pre-read or as a frozen Instance lock; both recover by reading
 * the current versions and reporting success.
 *
 * The mechanics `resetOn: "encounter"` sweep (`sweepEncounterEnd`) is
 * deliberately **not** wired here — it writes character rows, is a
 * player-visible behavior change v1 never shipped, and is ticketed separately.
 */
export async function endCombatAction(
  input: EndCombatInput
): Promise<
  Result<{ version: number; instanceVersion: number }, EndCombatError>
> {
  const parsed = EndCombatSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId } = parsed.data

  const envelope = await loadEncounterEnvelopeById(encounterId)
  if (envelope === null) return err("encounter-not-found")
  await requireCampaignDM(envelope.campaignId)

  // Terminal desired state: an already-ended encounter is this command's own
  // outcome (a retried delivery, or another tab won). Report current versions.
  if (envelope.status === "ended") return currentVersions(envelope.id)

  const result = await guardMany<
    { encounterVersion: number; instanceVersion: number } | "already-ended",
    EndCombatError
  >(async (tx: WriteExecutor) => {
    const instance = await loadMapInstanceForWriteLocked(
      tx,
      envelope.mapInstanceId
    )
    // A frozen Instance under a live encounter cannot happen — the freeze and
    // the `ended` flip commit together — so this lock failure IS the raced
    // duplicate end. Recover as the no-op outside the transaction.
    if (!instance.ok) {
      return instance.error === "map-instance-frozen"
        ? ok("already-ended" as const)
        : instance
    }

    const loaded = await loadEncounterForWriteLocked(tx, encounterId)
    if (!loaded.ok) return loaded
    const { row, loaded: loadedSession } = loaded.value
    if (row.status === "ended") return ok("already-ended" as const)
    if (row.status !== "live") return err("encounter-not-live")

    const swept = sweepOverlay(loadedSession.session)
    const stored = saveSession(swept, loadedSession.locators)
    if (!stored.ok) return err("locator-missing")

    const ephemeralIds = loadedSession.session.participants
      .filter(
        (participant) =>
          loadedSession.locators.get(participant.id)?.storage === "inline"
      )
      .map((participant) => participant.id)
    const pruned = pruneCombat(instance.value.state, ephemeralIds)

    const saved = await saveEncounterSession(
      row.id,
      stored.value,
      row.version,
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
    const inst = await saveLockedMapInstanceState(tx, instance.value, pruned, {
      freeze: true,
    })
    if (!inst.ok) return inst

    return ok({
      encounterVersion: ended.value.version,
      instanceVersion: inst.value.version,
    })
  })
  if (!result.ok) return result
  if (result.value === "already-ended") return currentVersions(envelope.id)

  publishEncounterPing(envelope.shortId, {
    version: result.value.encounterVersion,
    status: "ended",
  })
  publishEncounterInstancePing(envelope.shortId, result.value.instanceVersion)
  revalidateEncounter(envelope)

  return ok({
    version: result.value.encounterVersion,
    instanceVersion: result.value.instanceVersion,
  })
}

/** The idempotent no-op's answer. */
async function currentVersions(
  encounterId: string
): Promise<
  Result<{ version: number; instanceVersion: number }, EndCombatError>
> {
  const row = await loadEncounterAndInstanceVersions(encounterId)
  return row === null ? err("encounter-not-found") : ok(row)
}
