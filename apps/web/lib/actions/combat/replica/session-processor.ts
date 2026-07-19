import { serializeSessionShell } from "@workspace/game-v2/encounter"
import {
  type MutationProcessor,
  type ProcessorEvent,
} from "@workspace/replica/server"
import { err, ok, type Result } from "@workspace/result"

import {
  encounterMutations,
  type EncounterInvocation,
  type EncounterReplicaState,
} from "@/domain/combat/replica/mutations"
import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import { type WriteExecutor } from "@/lib/db/client"
import type { EncounterEnvelope } from "@/lib/db/queries/load-encounter"
import { loadEncounterShellForWriteLocked } from "@/lib/db/queries/load-encounter-session"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { encounterReplicaClient } from "@/lib/db/schema/encounter-replica-client"
import { saveEncounterSession } from "@/lib/db/writes/encounter"

import { createDrizzleMutationProcessor } from "../../replica/drizzle-processor"
import type { CombatSessionRemote } from "./wire.schema"

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
 * The encounter replica authority (UNN-646, storage-native root UNN-655):
 * `createMutationProcessor` over one Drizzle transaction per delivery, with
 * the `encounterReplicaClient` ledger and the **encounter row lock** as the
 * concurrency strategy — the locked row's own `version` feeds
 * `saveEncounterSession`, making the classic guard vacuous here while classic
 * event-wire writers on the same row keep their conditioned updates (a
 * replica commit bumps `version`, so a concurrent classic write fails
 * `"stale"` and rides its existing retry; mixed writers per the design's
 * rollout mandate). **Lock order: `encounterReplicaClient` → `encounters`**
 * (see the ledger table's doc for the cascade-delete caveat).
 *
 * Inside the lock the authority applies the **registered mutation** to the
 * storage-native root built from the locked row — the same apply the client
 * predicts and rebases with, so liveness, locator-derived home, and Writer
 * refusals are one decided-once code path (UNN-655; the previous body's
 * event mint + session reduce retired with the `CombatInlineState` root).
 * The shell's serialize is total, so a committed apply always persists.
 * `Remote = { version }`: the commit's encounter version is recorded with
 * the outcome and reproduced verbatim on a deduplicated redelivery.
 */
export function createCombatSessionPushProcessor(
  encounterId: string
): CombatSessionPushProcessor {
  return createDrizzleMutationProcessor({
    mutations: encounterMutations,
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
  invocation: EncounterInvocation,
  context: CombatSessionPushContext
): Promise<Result<CombatSessionRemote, CombatReplicaRejection>> {
  if (!context.authorization.ok) return err(context.authorization.error)

  const locked = await loadEncounterShellForWriteLocked(tx, context.encounterId)
  if (!locked.ok) return err(locked.error)

  const root: EncounterReplicaState = {
    status: locked.value.row.status,
    session: locked.value.shell,
  }

  // The registered apply decides liveness (`encounter-not-live` — the console
  // only mounts against a live encounter, so anything else here is a stale
  // tab or a write that lost the race to End Combat; deliberately no
  // draft→live promotion, which stays with the classic event door because it
  // also serves setup), the locator-derived home (`participant-not-inline`
  // fails a durable-addressed write closed), and Writer validation — under
  // the row lock that commits on them.
  const definition = encounterMutations.get(invocation.name)
  if (!definition) return err("invalid-write")
  const applied = definition.apply(root, invocation.args, { phase: "rebase" })
  if (!applied.ok) return applied

  const saved = await saveEncounterSession(
    locked.value.row.id,
    serializeSessionShell(applied.value.session),
    locked.value.row.version,
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
    shortId: locked.value.row.shortId,
    status: locked.value.row.status,
    version: saved.value.version,
  }
  return ok({ version: saved.value.version })
}

function logProcessorEvent(event: ProcessorEvent): void {
  if (event.kind === "recorded" && event.outcome === "accepted") return
  console.warn("[combat-replica:session]", JSON.stringify(event))
}
