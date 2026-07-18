import { err, ok, type Result } from "@workspace/result"

import type {
  DecodeError,
  MutationInvocation,
  MutationRegistry,
} from "./mutations"
import type { ClientIdentity, MutationEnvelope, MutationId } from "./protocol"

export type { ClientIdentity, MutationEnvelope, MutationId } from "./protocol"

/**
 * A terminal refusal recorded against the client's watermark. Recording it
 * (rather than aborting) is what lets the watermark advance past a rejection
 * and lets an ambiguous redelivery recover the same classification. Schema
 * and registry failures are terminal for the same reason: the client
 * validated before enqueueing, so reaching here means deployment skew, and
 * refusing to advance would wedge the client's ordered queue forever.
 */
export type TerminalRejection<Error> =
  | { readonly kind: "rejected"; readonly error: Error }
  | DecodeError

/** A non-terminal refusal to process: nothing was recorded or advanced. */
export type ProcessRefusal<Error> =
  | TerminalRejection<Error>
  | {
      readonly kind: "gap"
      readonly expected: MutationId
      readonly received: MutationId
    }
  | {
      /**
       * The ID was already processed but its recorded outcome has aged out of
       * the adapter's retention window, so the original result cannot be
       * reproduced. Serial delivery makes this unreachable while retention
       * covers at least the last outcome per client.
       */
      readonly kind: "outcome-unavailable"
      readonly mutationId: MutationId
    }

export type RecordedOutcome<Remote, Error> = Result<
  Remote,
  TerminalRejection<Error>
>

/**
 * Storage adapter for the per-client dedup ledger. Both operations run inside
 * the processor's application transaction; `acquire` must lock or otherwise
 * serialize the client's record so concurrent deliveries of the same client
 * cannot interleave.
 */
export interface MutationDedupAdapter<Transaction, Remote, Error> {
  acquire(
    tx: Transaction,
    client: ClientIdentity
  ): Promise<{
    lastMutationId: MutationId
    lastOutcome?: RecordedOutcome<Remote, Error>
  }>
  record(
    tx: Transaction,
    client: ClientIdentity,
    mutationId: MutationId,
    outcome: RecordedOutcome<Remote, Error>
  ): Promise<void>
}

export interface MutationProcessorOptions<
  State,
  Invocation extends MutationInvocation,
  Transaction,
  TrustedContext,
  Error,
  Remote = void,
> {
  readonly mutations: MutationRegistry<State, Invocation, Error>
  transact<T>(work: (tx: Transaction) => Promise<T>): Promise<T>
  readonly dedup: MutationDedupAdapter<Transaction, Remote, Error>
  /**
   * The application-owned handler, executed in trusted context against
   * current persistence state. A typed `err` is a terminal rejection and is
   * recorded; an unexpected throw aborts the transaction without advancing
   * the watermark, so the delivery stays ambiguous and may be retried.
   */
  execute(
    tx: Transaction,
    invocation: Invocation,
    context: TrustedContext
  ): Promise<Result<Remote, Error>>
}

export type MutationProcessor<TrustedContext, Error, Remote> = (
  envelope: MutationEnvelope<{ readonly name: string; readonly args: unknown }>,
  context: TrustedContext
) => Promise<Result<Remote, ProcessRefusal<Error>>>

/**
 * Parses an envelope, enforces per-client ordering and deduplication, invokes
 * the application handler, and stores the terminal outcome atomically with
 * the domain write. Inside one application transaction it:
 *
 * 1. locks the dedup record for the client,
 * 2. returns the recorded outcome when this ID was already processed,
 * 3. rejects a gap when the ID is greater than `lastMutationId + 1`,
 * 4. executes the application handler when the ID is next, and
 * 5. records the terminal outcome and advances the watermark with the commit.
 */
export function createMutationProcessor<
  State,
  Invocation extends MutationInvocation,
  Transaction,
  TrustedContext,
  Error,
  Remote = void,
>(
  options: MutationProcessorOptions<
    State,
    Invocation,
    Transaction,
    TrustedContext,
    Error,
    Remote
  >
): MutationProcessor<TrustedContext, Error, Remote> {
  return async function process(envelope, context) {
    const client: ClientIdentity = {
      clientGroupId: envelope.clientGroupId,
      clientId: envelope.clientId,
    }
    const decoded = options.mutations.decode(envelope.invocation)

    return options.transact(async (tx) => {
      const { lastMutationId, lastOutcome } = await options.dedup.acquire(
        tx,
        client
      )

      if (envelope.mutationId <= lastMutationId) {
        if (envelope.mutationId === lastMutationId && lastOutcome) {
          return widen(lastOutcome)
        }
        return err({
          kind: "outcome-unavailable",
          mutationId: envelope.mutationId,
        })
      }

      if (envelope.mutationId > lastMutationId + 1) {
        return err({
          kind: "gap",
          expected: lastMutationId + 1,
          received: envelope.mutationId,
        })
      }

      let outcome: RecordedOutcome<Remote, Error>
      if (!decoded.ok) {
        outcome = err(decoded.error)
      } else {
        const executed = await options.execute(tx, decoded.value, context)
        outcome = executed.ok
          ? ok(executed.value)
          : err({ kind: "rejected", error: executed.error })
      }

      await options.dedup.record(tx, client, envelope.mutationId, outcome)
      return widen(outcome)
    })
  }

  function widen(
    outcome: RecordedOutcome<Remote, Error>
  ): Result<Remote, ProcessRefusal<Error>> {
    return outcome.ok ? outcome : err(outcome.error)
  }
}
