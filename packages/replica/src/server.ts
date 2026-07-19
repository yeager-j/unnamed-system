import { err, ok, type Result } from "@workspace/result"

import type { MutationInvocation, MutationRegistry } from "./mutations"
import type {
  ClientIdentity,
  MutationEnvelope,
  MutationId,
  ProcessRefusal,
  RecordedOutcome,
} from "./protocol"
import type { StandardSchemaV1 } from "./standard-schema"

export type {
  ClientIdentity,
  MutationEnvelope,
  MutationId,
  ProcessRefusal,
  RecordedOutcome,
  TerminalRejection,
} from "./protocol"

/**
 * Structured observability events for the authority side, emitted only after
 * the surrounding transaction resolves — an aborted transaction (ambiguous
 * delivery) emits nothing. `recorded` marks a watermark advance and is the
 * only place a deploy-skew refusal (`invalid`/`unknown-mutation`) becomes
 * visible: the application handler never runs for those. Events carry client
 * identity, mutation IDs, and names — never arguments.
 */
export type ProcessorEvent =
  | {
      readonly kind: "duplicate"
      readonly client: ClientIdentity
      readonly mutationId: MutationId
    }
  | {
      readonly kind: "unknown-client"
      readonly client: ClientIdentity
      readonly received: MutationId
    }
  | {
      readonly kind: "outcome-unavailable"
      readonly client: ClientIdentity
      readonly mutationId: MutationId
    }
  | {
      readonly kind: "gap"
      readonly client: ClientIdentity
      readonly expected: MutationId
      readonly received: MutationId
    }
  | {
      readonly kind: "recorded"
      readonly client: ClientIdentity
      readonly mutationId: MutationId
      readonly name: string
      readonly outcome: "accepted" | "rejected" | "invalid" | "unknown-mutation"
    }

/**
 * Storage adapter for the per-client dedup ledger. Both operations run inside
 * the processor's application transaction; `acquire` must lock or otherwise
 * serialize the client's record so concurrent deliveries of the same client
 * cannot interleave.
 */
export interface MutationDedupAdapter<Transaction, Remote, Error> {
  /**
   * Returns `null` when the adapter holds NO record for the client and its
   * retention policy cannot rule out a swept ledger: the processor then
   * refuses `unknown-client` without executing — a redelivered first
   * mutation may have committed before the sweep, so treating no-record as
   * "genuinely new" would double-apply it (Codex P2, PR #385). An adapter
   * that evicts records must therefore mint the record at the client's
   * bootstrap (the personalized snapshot read), making an absent row mean
   * "swept", never "new". Adapters whose records are never evicted may
   * return `{ lastMutationId: 0 }` for a first contact instead.
   */
  acquire(
    tx: Transaction,
    client: ClientIdentity
  ): Promise<{
    lastMutationId: MutationId
    lastOutcome?: RecordedOutcome<Remote, Error>
  } | null>
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
  /**
   * Optional sink for metrics/logging adapters. Observability must never
   * alter processing semantics: a throwing sink is swallowed.
   */
  readonly onEvent?: (event: ProcessorEvent) => void
}

export type MutationProcessor<TrustedContext, Error, Remote> = (
  envelope: MutationEnvelope<{ readonly name: string; readonly args: unknown }>,
  context: TrustedContext
) => Promise<Result<Remote, ProcessRefusal<Error>>>

export interface MutationPushDoorOptions<
  Input,
  Parsed extends {
    readonly envelope: MutationEnvelope<{
      readonly name: string
      readonly args: unknown
    }>
  },
  Context extends { committed?: Commit },
  Commit,
  Error,
  Remote,
  InvalidInput,
> {
  readonly schema: StandardSchemaV1<Input, Parsed>
  readonly invalidInput: InvalidInput
  prepare(parsed: Parsed): Context | Promise<Context>
  createProcessor(parsed: Parsed): MutationProcessor<Context, Error, Remote>
  afterCommit(
    commit: Commit,
    parsed: Parsed,
    context: Context
  ): void | Promise<void>
}

/**
 * Composes an authority push door around a mutation processor without taking
 * ownership of the application's framework, wire-schema vendor, authorization
 * policy, or post-commit effects. The door validates the transport shape,
 * prepares trusted context outside the transaction, invokes the configured
 * processor, and runs effects only when `execute` left a commit marker in the
 * context. A deduplicated replay therefore returns its recorded result without
 * repeating pings, revalidation, or other application effects.
 *
 * Validation issues become the caller's `invalidInput` value. Unexpected
 * throws from validation, context preparation, processing, or effects remain
 * thrown so the transport can classify their ambiguity.
 */
export function createMutationPushDoor<
  Input,
  Parsed extends {
    readonly envelope: MutationEnvelope<{
      readonly name: string
      readonly args: unknown
    }>
  },
  Context extends { committed?: Commit },
  Commit,
  Error,
  Remote,
  InvalidInput,
>(
  options: MutationPushDoorOptions<
    Input,
    Parsed,
    Context,
    Commit,
    Error,
    Remote,
    InvalidInput
  >
): (
  input: Input
) => Promise<Result<Remote, InvalidInput | ProcessRefusal<Error>>> {
  return async function push(input) {
    const parsed = await options.schema["~standard"].validate(input)
    if (parsed.issues) return err(options.invalidInput)

    const context = await options.prepare(parsed.value)
    const processor = options.createProcessor(parsed.value)
    const result = await processor(parsed.value.envelope, context)

    if (context.committed !== undefined) {
      await options.afterCommit(context.committed, parsed.value, context)
    }

    return result
  }
}

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

    let event: ProcessorEvent | null = null
    const result = await options.transact<
      Result<Remote, ProcessRefusal<Error>>
    >(async (tx) => {
      const acquired = await options.dedup.acquire(tx, client)
      if (acquired === null) {
        event = {
          kind: "unknown-client",
          client,
          received: envelope.mutationId,
        }
        return err({ kind: "unknown-client", received: envelope.mutationId })
      }
      const { lastMutationId, lastOutcome } = acquired

      if (envelope.mutationId <= lastMutationId) {
        if (envelope.mutationId === lastMutationId && lastOutcome) {
          event = { kind: "duplicate", client, mutationId: envelope.mutationId }
          return widen(lastOutcome)
        }
        event = {
          kind: "outcome-unavailable",
          client,
          mutationId: envelope.mutationId,
        }
        return err({
          kind: "outcome-unavailable",
          mutationId: envelope.mutationId,
        })
      }

      if (envelope.mutationId > lastMutationId + 1) {
        if (lastMutationId === 0) {
          event = {
            kind: "unknown-client",
            client,
            received: envelope.mutationId,
          }
          return err({
            kind: "unknown-client",
            received: envelope.mutationId,
          })
        }
        event = {
          kind: "gap",
          client,
          expected: lastMutationId + 1,
          received: envelope.mutationId,
        }
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
      event = {
        kind: "recorded",
        client,
        mutationId: envelope.mutationId,
        name: envelope.invocation.name,
        outcome: outcome.ok ? "accepted" : outcome.error.kind,
      }
      return widen(outcome)
    })
    if (event && options.onEvent) {
      try {
        options.onEvent(event)
      } catch {
        // A throwing sink is the adapter's bug; the recorded outcome must
        // still reach the transport.
      }
    }
    return result
  }

  function widen(
    outcome: RecordedOutcome<Remote, Error>
  ): Result<Remote, ProcessRefusal<Error>> {
    return outcome.ok ? outcome : err(outcome.error)
  }
}
