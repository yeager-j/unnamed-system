"use server"

import { err, ok, type Result } from "@workspace/result"

import { combatDurableMutations } from "@/domain/combat/replica/mutations"
import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import { ENTITY_WRITERS } from "@/domain/entity/commit/writers"
import {
  authorizeCampaignDMForEncounter,
  authorizeEntityWriteForClass,
} from "@/lib/auth/campaign-access"
import { loadEncounterEnvelopeById } from "@/lib/db/queries/load-encounter"
import { loadEncounterDurableRoster } from "@/lib/db/queries/load-encounter-session"
import type { LoadedPlayerCharacter } from "@/lib/db/queries/load-player-character"
import {
  publishCharacterPing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import { revalidateEncounter } from "../../encounter/revalidate"
import { revalidateEntity } from "../../entity/revalidate"
import {
  createCombatDurablePushProcessor,
  type CombatDurablePushContext,
} from "./durable-processor"
import {
  createCombatSessionPushProcessor,
  type CombatSessionPushContext,
} from "./session-processor"
import {
  CombatDurablePushSchema,
  CombatSessionPushSchema,
  type CombatDurablePushInput,
  type CombatPushError,
  type CombatSessionPushInput,
  type CombatSessionRemote,
} from "./wire.schema"

/**
 * The combat replica push doors (UNN-646), siblings of
 * `entity/replica/push.ts` — same protocol posture: parse the transport
 * shape, compute the authorization verdict outside the transaction as a
 * TYPED verdict (an auth refusal is recorded against the watermark, never a
 * `forbidden()` throw), hand the envelope to the processor, and fire
 * ping/revalidation once per real commit off the context back-channel —
 * never for a deduplicated replay.
 */

/**
 * One delivery against a durable participant's entity row. The verdict runs
 * two checks, in this order:
 *
 * 1. The classic durable arm's gate: class→posture over the entity's own
 *    campaign placement (vitals ⇒ owner-or-campaign-DM), so the console and
 *    the sheet can never disagree about who may write a PC row. Auth runs
 *    FIRST so the roster arm's error codes cannot probe encounter membership.
 * 2. The **roster precondition** (Codex P2, PR #391): the entity must still
 *    be a durable participant of the wire's encounter, or the delivery is a
 *    RECORDED `participant-not-found` rejection — the classic router's
 *    fail-closed locator scope, preserved. A stale frame damaging a PC that
 *    another tab already removed refuses instead of committing to the
 *    character row. Advisory-read strength, exactly like the classic
 *    router's unlocked `loadEncounterForWrite`; the replica's rebase handles
 *    the residual race like any preconditioned intent.
 *
 * On commit: the character ping (every watcher of the PC catches up) plus
 * `revalidateEncounter` (UNN-567 — the RSC payload rides this push response,
 * so the console's optimistic frame never flash-reverts) plus
 * `revalidateEntity`. For revalidation the encounter claim is additionally
 * campaign-verified; a mismatch skips it without ever rejecting a committed
 * write.
 */
export async function pushCombatDurableMutationAction(
  input: CombatDurablePushInput
): Promise<Result<void, CombatPushError>> {
  const parsed = CombatDurablePushSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, entityId, envelope } = parsed.data

  const context: CombatDurablePushContext = {
    entityId,
    authorization: await authorizeDurableEnvelope(
      encounterId,
      entityId,
      envelope.invocation
    ),
  }
  const processor = createCombatDurablePushProcessor(entityId)
  const result = await processor(envelope, context)

  if (context.committed) {
    const { shortId, durableClass, version } = context.committed
    publishCharacterPing(shortId, "entity", { [durableClass]: version })
    revalidateEntity({ shortId })
    await revalidateEncounterIfPlaced(encounterId, context.authorization)
  }

  return result.ok ? ok(undefined) : err(result.error)
}

/**
 * One delivery against the encounter session blob. The gate is the session
 * home's sole sanctioned writer: the campaign DM.
 *
 * `Remote = { version }` — the client folds it into the console's surviving
 * event-queue token so the two protocols sharing the encounter row keep each
 * other fresh.
 */
export async function pushCombatSessionMutationAction(
  input: CombatSessionPushInput
): Promise<Result<CombatSessionRemote, CombatPushError>> {
  const parsed = CombatSessionPushSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, envelope } = parsed.data

  const authorized = await authorizeCampaignDMForEncounter(encounterId)
  const context: CombatSessionPushContext = {
    encounterId,
    authorization: authorized,
  }
  const processor = createCombatSessionPushProcessor(encounterId)
  const result = await processor(envelope, context)

  if (context.committed && authorized.ok) {
    const { version, status } = context.committed
    publishEncounterPing(authorized.value.shortId, { version, status })
    revalidateEncounter(authorized.value)
  }

  return result.ok ? ok(result.value) : err(result.error)
}

/**
 * The durable door's verdict: the class → posture gate over the decoded
 * write's own `durableClass` (the classic arm's policy), then the roster
 * precondition — the entity must still be a durable participant of the
 * claimed encounter. A failed decode leaves the verdict moot (the
 * processor's decode fails first and records `invalid`); `forbidden` is the
 * fail-closed default for that unreachable arm.
 */
async function authorizeDurableEnvelope(
  encounterId: string,
  entityId: string,
  invocation: { readonly name: string; readonly args: unknown }
): Promise<Result<LoadedPlayerCharacter, CombatReplicaRejection>> {
  const decoded = combatDurableMutations.decode(invocation)
  if (!decoded.ok) return err("forbidden")

  const write = decoded.value.args
  const { durableClass } = ENTITY_WRITERS[write.component]
  const authorized = await authorizeEntityWriteForClass(entityId, durableClass)
  if (!authorized.ok) return authorized

  const roster = await loadEncounterDurableRoster(encounterId)
  if (!roster.ok) return roster
  if (!roster.value.has(entityId)) return err("participant-not-found")

  return authorized
}

/**
 * The commit already happened against the entity row; whether this console's
 * encounter route re-renders is presentation. Revalidate only when the
 * claimed encounter belongs to the campaign the PC is placed into — a
 * mismatched claim silently skips (never rejects).
 */
async function revalidateEncounterIfPlaced(
  encounterId: string,
  authorization: Result<LoadedPlayerCharacter, CombatReplicaRejection>
): Promise<void> {
  if (!authorization.ok) return
  const placedCampaignId = authorization.value.campaignId
  if (!placedCampaignId) return
  const encounter = await loadEncounterEnvelopeById(encounterId)
  if (!encounter || encounter.campaignId !== placedCampaignId) return
  revalidateEncounter(encounter)
}
