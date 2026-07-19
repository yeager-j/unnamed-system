import { createReduceSession, saveSession } from "@workspace/game-v2/encounter"
import {
  type MutationProcessor,
  type ProcessorEvent,
} from "@workspace/replica/server"
import { err, ok, type Result } from "@workspace/result"

import {
  combatInlineMutations,
  type CombatInlineInvocation,
} from "@/domain/combat/replica/mutations"
import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import { type WriteExecutor } from "@/lib/db/client"
import type { EncounterEnvelope } from "@/lib/db/queries/load-encounter"
import { loadEncounterForWriteLocked } from "@/lib/db/queries/load-encounter-session"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { encounterReplicaClient } from "@/lib/db/schema/encounter-replica-client"
import { saveEncounterSession } from "@/lib/db/writes/encounter"

import { createDrizzleMutationProcessor } from "../../replica/drizzle-processor"
import { mintSessionEvent } from "../commit/mint-session-event"
import type { CombatSessionRemote } from "./wire.schema"

/** Server-side id mint for the session reducer (unused by these event kinds). */
const newId = () => crypto.randomUUID()

/**
 * Per-delivery trusted context. `authorization` is the campaign-DM verdict
 * computed outside the transaction; `committed` is the back-channel for the
 * ping/revalidate the action fires once per real commit.
 */
export interface CombatSessionPushContext {
  readonly encounterId: string
  readonly authorization: Result<EncounterEnvelope, CombatReplicaRejection>
  committed?: CombatSessionCommit
}

export interface CombatSessionCommit {
  readonly shortId: string
  readonly status: EncounterStatus
  readonly version: number
}

export type CombatSessionPushProcessor = MutationProcessor<
  CombatSessionPushContext,
  CombatReplicaRejection,
  CombatSessionRemote
>

/**
 * The inline combat authority (UNN-646): `createMutationProcessor` over one
 * Drizzle transaction per delivery, with the `encounterReplicaClient` ledger
 * and the **encounter row lock** as the concurrency strategy — the locked
 * row's own `version` feeds `saveEncounterSession`, making the classic guard
 * vacuous here while classic event-wire writers on the same row keep their
 * conditioned updates (a replica commit bumps `version`, so a concurrent
 * classic write fails `"stale"` and rides its existing retry; mixed writers
 * per the design's rollout mandate). **Lock order:
 * `encounterReplicaClient` → `encounters`** (see the ledger table's doc for
 * the cascade-delete caveat).
 *
 * The domain body inside the lock is the classic session Store's, verbatim:
 * locator-derived home (a durable-addressed write fails closed
 * `participant-not-inline`), Writer pre-mint validation (CD19), the one
 * sanctioned event mint, reduce, fail-closed serialize, guarded save.
 * `Remote = { version }`: the commit's encounter version is recorded with
 * the outcome and reproduced verbatim on a deduplicated redelivery.
 */
export function createCombatSessionPushProcessor(
  encounterId: string
): CombatSessionPushProcessor {
  return createDrizzleMutationProcessor({
    mutations: combatInlineMutations,
    ledger: {
      table: encounterReplicaClient,
      pinColumn: encounterReplicaClient.encounterId,
      pinValue: encounterId,
    },
    execute: executeCombatSessionMutation,
    onEvent: logProcessorEvent,
  })
}

async function executeCombatSessionMutation(
  tx: WriteExecutor,
  invocation: CombatInlineInvocation,
  context: CombatSessionPushContext
): Promise<Result<CombatSessionRemote, CombatReplicaRejection>> {
  if (!context.authorization.ok) return err(context.authorization.error)

  const loaded = await loadEncounterForWriteLocked(tx, context.encounterId)
  if (!loaded.ok) {
    // A dangling durable reference fails the dissolve; to this door it is the
    // same data-integrity refusal as a malformed blob.
    return err(
      loaded.error === "participant-load-failed"
        ? "invalid-session"
        : loaded.error
    )
  }

  // The liveness precondition, under the row lock that commits on it. The
  // console only ever mounts against a live encounter, so anything arriving
  // here for another status is a stale tab, a cross-tab straggler, or a write
  // that lost the race to End Combat — none of which may mutate a session the
  // end sweep has already settled. Deliberately no draft→live promotion: the
  // classic event door promotes (`apply-event.ts`) because it also serves
  // setup, whereas this door exists only behind the live console.
  if (loaded.value.row.status !== "live") return err("encounter-not-live")

  const { participantId, write } = invocation.args
  const locator = loaded.value.loaded.locators.get(participantId)
  if (locator === undefined) return err("participant-not-found")
  if (locator.storage !== "inline") return err("participant-not-inline")

  const participant = loaded.value.loaded.session.participants.find(
    (entry) => entry.id === participantId
  )
  if (participant === undefined) return err("participant-not-found")

  const validated = applyEntityWrite(participant.entity.components, write)
  if (!validated.ok) return validated

  const event = mintSessionEvent(participantId, write)
  const next = createReduceSession(newId)(loaded.value.loaded.session, event)

  const stored = saveSession(next, loaded.value.loaded.locators)
  if (!stored.ok) return err("locator-missing")

  const saved = await saveEncounterSession(
    loaded.value.row.id,
    stored.value,
    loaded.value.row.version,
    tx
  )
  if (!saved.ok) {
    // Unreachable while this transaction holds the row lock; a throw aborts
    // (ambiguous, redeliverable) rather than recording a refusal for a write
    // whose fate is unknown.
    throw new Error(
      `encounter ${context.encounterId} vanished under its row lock`
    )
  }

  context.committed = {
    shortId: loaded.value.row.shortId,
    status: loaded.value.row.status,
    version: saved.value.version,
  }
  return ok({ version: saved.value.version })
}

function logProcessorEvent(event: ProcessorEvent): void {
  if (event.kind === "recorded" && event.outcome === "accepted") return
  console.warn("[combat-replica:session]", JSON.stringify(event))
}
