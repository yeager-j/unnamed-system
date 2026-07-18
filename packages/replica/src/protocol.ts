/**
 * The wire-level vocabulary shared by the replica runtime, the transport port,
 * and the authority processor. Everything here must survive serialization
 * across a network boundary without losing precision.
 */

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
 * `disconnected`: pending mutations remain projected but no delivery attempt
 * is active. `recovering`: the transport has reconnected but has not yet
 * re-established accepted state; delivery resumes only once `connected`.
 */
export type ConnectionStatus = "connected" | "recovering" | "disconnected"

/**
 * `retryable` means the authority outcome is unknown — not that the authority
 * is known to have skipped the mutation. Only `rejected` is a trusted terminal
 * refusal.
 */
export type PushError<Error> =
  | { readonly kind: "retryable"; readonly cause: unknown }
  | { readonly kind: "rejected"; readonly error: Error }
