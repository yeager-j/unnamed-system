"use server"

import {
  createReduceSession,
  isRosterFullyPlaced,
  saveSession,
} from "@workspace/game-v2/encounter"
import { err, ok, type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadEncounterEnvelopeById } from "@/lib/db/queries/load-encounter"
import {
  loadEncounterForWriteLocked,
  loadLiveEncounterIdForCampaign,
} from "@/lib/db/queries/load-encounter-session"
import {
  saveEncounterSession,
  setEncounterStatus,
} from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { loadMapInstanceForWriteLocked } from "@/lib/db/writes/map-instance"
import { publishEncounterPing } from "@/lib/realtime/publish"

import { revalidateEncounter } from "../encounter/revalidate"
import {
  StartCombatSchema,
  type StartCombatError,
  type StartCombatInput,
} from "./start-combat.schema"

/**
 * `startCombat` as a named command (UNN-657): the draft → live lifecycle
 * transition. No client `expectedVersion` — the transaction locks the
 * Instance then the encounter row (the canonical dungeon → mapInstance →
 * encounter order, dungeon absent here), re-reads state under those locks,
 * and validates every precondition where it commits:
 *
 * - single-live-per-campaign, re-checked in-transaction (previously an
 *   advisory pre-read);
 * - every participant placed once zones exist (`isRosterFullyPlaced` on the
 *   locked Instance);
 * - lifecycle: already-`live` is the command's own outcome — a redelivered
 *   or raced start returns `ok` with the current version, no re-reduce
 *   (desired-state idempotency; `advantage`/`firstSide` are not rewritten);
 *   `ended` refuses.
 */
export async function startCombatAction(
  input: StartCombatInput
): Promise<Result<{ version: number }, StartCombatError>> {
  const parsed = StartCombatSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, advantage, firstSide } = parsed.data

  const envelope = await loadEncounterEnvelopeById(encounterId)
  if (envelope === null) return err("encounter-not-found")
  await requireCampaignDM(envelope.campaignId)

  const result = await guardMany<
    { version: number; started: boolean },
    StartCombatError
  >(async (tx: WriteExecutor) => {
    const instance = await loadMapInstanceForWriteLocked(
      tx,
      envelope.mapInstanceId
    )
    if (!instance.ok) return instance

    const loaded = await loadEncounterForWriteLocked(tx, encounterId)
    if (!loaded.ok) return loaded
    const { row, loaded: loadedSession } = loaded.value

    if (row.status === "live")
      return ok({ version: row.version, started: false })
    if (row.status === "ended") return err("encounter-ended")

    const liveId = await loadLiveEncounterIdForCampaign(envelope.campaignId, tx)
    if (liveId !== null && liveId !== row.id) {
      return err("campaign-already-has-live-encounter")
    }
    if (!isRosterFullyPlaced(loadedSession.session, instance.value.state)) {
      return err("encounter-has-unplaced-combatants")
    }

    const next = createReduceSession(newId)(loadedSession.session, {
      kind: "startCombat",
      advantage,
      firstSide,
    })
    const stored = saveSession(next, loadedSession.locators)
    if (!stored.ok) return err("locator-missing")

    const saved = await saveEncounterSession(
      row.id,
      stored.value,
      row.version,
      tx
    )
    if (!saved.ok) return saved
    const live = await setEncounterStatus(
      row.id,
      "live",
      saved.value.version,
      tx
    )
    if (!live.ok) return live
    return ok({ version: live.value.version, started: true })
  })
  if (!result.ok) return result

  if (result.value.started) {
    publishEncounterPing(envelope.shortId, {
      version: result.value.version,
      status: "live",
    })
    revalidateEncounter(envelope)
  }
  return ok({ version: result.value.version })
}

/** Server-side id mint threaded to the session reducer. */
const newId = () => crypto.randomUUID()
