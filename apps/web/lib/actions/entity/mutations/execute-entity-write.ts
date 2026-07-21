import { type MutationHandlerContext } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import type { EntityWriteArgs } from "@/domain/entity/commit/protocol"

import { commitEntityWrite } from "../entity-row-store"
import type {
  EntityMutationActor,
  EntityMutationRejection,
  EntityMutationTx,
} from "./types"

/**
 * The `entity.write` authority handler (UNN-673/UNN-674) — the registry adapter
 * that binds the executor-neutral {@link commitEntityWrite} Store to the Headcanon
 * transaction. It supplies the attempt's savepoint transaction as the executor and
 * forwards the trusted actor and stamp accumulator; the Store owns loads,
 * contextual authorization, the Writer, the server-authoritative guarded write,
 * and the axis stamp. There is no separate in-transaction commit variant — this is
 * the same one implementation every standalone caller uses (AC #1).
 *
 * The Store discards the committed facts here (the executor builds the accepted
 * vector from the stamp and owns cache/realtime finalization); a lost race throws
 * `throwMutationContention()` from inside the Store so the authority retries.
 */
export async function executeEntityWrite({
  tx,
  args,
  actor,
  stamp,
}: MutationHandlerContext<
  EntityMutationTx,
  EntityWriteArgs,
  EntityMutationActor
>): Promise<Result<void, EntityMutationRejection>> {
  const committed = await commitEntityWrite(tx, actor, args, stamp)
  return committed.ok ? ok(undefined) : err(committed.error)
}
