/**
 * The wire-level vocabulary shared by the replica runtime, the transport port,
 * and the authority processor. Everything here must survive serialization
 * across a network boundary without losing precision.
 */

import type { Result } from "@workspace/result"

import type { DecodeError } from "./mutations"

/** Strictly monotonic per client, beginning at one. */
export type MutationId = number

/**
 * `clientGroupId` identifies replicas that share persisted client state;
 * `clientId` identifies one ordered producer within that group.
 */
export interface ClientIdentity {
  readonly clientGroupId: string
  readonly clientId: string
}

/**
 * Transport identity added by the runtime. Application callers never mint
 * idempotency keys; the ordered `(clientGroupId, clientId, mutationId)` triple
 * is what makes redelivery safe.
 */
export interface MutationEnvelope<Invocation> extends ClientIdentity {
  readonly mutationId: MutationId
  readonly invocation: Invocation
}

/**
 * One consistent authority observation. `through` is this client's
 * incorporation watermark: the base reflects the terminal outcome of every
 * mutation from this replica's client through that ID (accepted mutations are
 * present; rejected mutations have no effect). `cursor` is an adapter-owned
 * causal token for the domain value — the replica carries it but never
 * interprets it. The tuple must be read atomically: pairing a newer watermark
 * with an older value (or vice versa) breaks pruning.
 */
export interface Accepted<State, Cursor = unknown> {
  readonly value: State
  readonly through: MutationId
  readonly cursor: Cursor
}

/**
 * The replica-derived delivery health surfaced on snapshots. `disconnected`
 * means pending mutations remain projected but no delivery attempt is active
 * — either the transport reported the source unreachable (`sink.down()`) or
 * the replica parked itself after exhausting its retry budget. Any liveness
 * evidence (`sink.alive()` or an accepted snapshot) returns it to
 * `connected`. This is derived state, not a transport-negotiated protocol.
 */
export type ConnectionStatus = "connected" | "disconnected"

/**
 * `retryable` means the authority outcome is unknown — not that the authority
 * is known to have skipped the mutation. Only `rejected` is a trusted terminal
 * refusal of THIS mutation. `unknown-client` is a trusted terminal refusal of
 * the whole client identity: the authority holds no history for it (dedup
 * retention expired, or the identity never existed), so no mutation from this
 * ordered stream can ever be processed again — the replica expires and the
 * application must rebuild it under a fresh identity (UNN-645).
 */
export type PushError<Error> =
  | { readonly kind: "retryable"; readonly cause: unknown }
  | { readonly kind: "rejected"; readonly error: Error }
  | { readonly kind: "unknown-client" }

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
       * A gap from a client the ledger holds NO history for (`expected === 1`
       * — the dedup row is absent or fresh-seeded): the authority cannot ever
       * accept this stream, so the client must rebuild under a fresh
       * identity. Decided here, once, so every transport inherits the
       * distinction instead of re-deriving it from `expected` (UNN-645; the
       * dedup-retention sweep is what makes this reachable by a correct
       * client). A fresh client whose runtime skips IDs lands here too — the
       * same reset recovery converges, and the authority-side event keeps
       * the anomaly observable.
       */
      readonly kind: "unknown-client"
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
