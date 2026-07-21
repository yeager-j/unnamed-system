import { type MutationHandlerContext } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import type { EntityIdentityArgs } from "@/domain/entity/commit/protocol"

import { commitIdentityWrite } from "../identity-store"
import type {
  EntityMutationActor,
  EntityMutationRejection,
  EntityMutationTx,
} from "./types"

/**
 * The `entity.identity` authority handler (UNN-675) — the registry adapter binding
 * the executor-neutral {@link commitIdentityWrite} Store to the Headcanon
 * transaction, twin of `execute-entity-write.ts`. It supplies the attempt's
 * savepoint transaction as the executor and forwards the trusted actor and stamp
 * accumulator; the Store owns the load, ownership authorization, the
 * server-composed column patch, the guarded write, and the axis stamp.
 *
 * The Store's committed facts are discarded here — the executor builds the
 * accepted vector from the stamp and owns cache/realtime finalization. The door
 * re-reads the identity revision out of that stamp for the un-migrated client.
 */
export async function executeIdentityWrite({
  tx,
  args,
  actor,
  stamp,
}: MutationHandlerContext<
  EntityMutationTx,
  EntityIdentityArgs,
  EntityMutationActor
>): Promise<Result<void, EntityMutationRejection>> {
  const committed = await commitIdentityWrite(tx, actor, args, stamp)
  return committed.ok ? ok(undefined) : err(committed.error)
}
