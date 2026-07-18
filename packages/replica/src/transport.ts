import type { Result } from "@workspace/result"

import type { MutationInvocation } from "./mutations"
import type {
  Accepted,
  ConnectionStatus,
  MutationEnvelope,
  PushError,
} from "./protocol"

export type {
  Accepted,
  ClientIdentity,
  ConnectionStatus,
  MutationEnvelope,
  MutationId,
  PushError,
} from "./protocol"

/**
 * The port implemented by adapter authors. The adapter must deliver accepted
 * snapshots in causal order — HTTP request races, polling generations,
 * reconnect cursors, and vendor message ordering are adapter decisions, made
 * once per adapter with the gates below rather than reimplemented in every
 * callback. `push` is called serially for one client; a retry reuses the
 * exact same envelope.
 */
export interface ReplicaTransport<
  State,
  Invocation extends MutationInvocation,
  Error,
  Remote = void,
  Cursor = unknown,
> {
  connect(sink: ReplicaTransportSink<State, Cursor>): () => void
  push(
    envelope: MutationEnvelope<Invocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<Error>>>
}

export interface ReplicaTransportSink<State, Cursor = unknown> {
  accept(accepted: Accepted<State, Cursor>): void
  setConnection(status: ConnectionStatus): void
}

/**
 * The relationship between the last emitted domain cursor and an incoming
 * one, as described by an adapter-supplied classifier. `unknown` never
 * guesses — it starts the configured recovery read.
 */
export type CausalRelationship = "stale" | "same" | "fresh" | "unknown"

export interface PullGeneration {
  /** Aborted as soon as a newer pull generation begins. */
  readonly signal: AbortSignal
  /** Runs `work` only if this generation is still the newest; returns whether it ran. */
  publish(work: () => void): boolean
}

export interface PullGenerationGate {
  /** Starts a new pull generation, superseding (and aborting) all prior ones. */
  begin(): PullGeneration
  /** Aborts every outstanding generation without starting a new one. */
  cancel(): void
}

/**
 * Issues a generation for each overlapping pull and allows only the latest
 * still-relevant request to publish. Centralizes cancellation and the "older
 * response finished last" race.
 */
export function createPullGenerationGate(): PullGenerationGate {
  let current = 0
  let controller: AbortController | null = null

  return {
    begin() {
      current += 1
      const generation = current
      controller?.abort()
      const own = new AbortController()
      controller = own
      return {
        signal: own.signal,
        publish(work) {
          if (generation !== current) return false
          work()
          return true
        },
      }
    },
    cancel() {
      current += 1
      controller?.abort()
      controller = null
    },
  }
}

export interface CausalAcceptanceGateOptions<State, Cursor> {
  readonly initial: Accepted<State, Cursor>
  /** Describes the relationship between the previous and incoming DOMAIN cursors. */
  readonly classify: (previous: Cursor, incoming: Cursor) => CausalRelationship
  /** One consistent current-state read, used whenever ordering cannot be proven. */
  readonly recover: (signal: AbortSignal) => Promise<Accepted<State, Cursor>>
  readonly emit: (accepted: Accepted<State, Cursor>) => void
}

export interface CausalAcceptanceGate<State, Cursor> {
  /** Offers an incoming accepted snapshot; emits, drops, or starts recovery. */
  offer(accepted: Accepted<State, Cursor>): void
  /** Forces a recovery read, e.g. after a reconnect with an unknown gap. */
  recover(): void
  /** Stops all emissions and aborts any in-flight recovery. */
  dispose(): void
}

/**
 * Remembers the last emitted accepted snapshot and applies the product-order
 * rules over (domain cursor, watermark) so adapters do not reimplement causal
 * delivery:
 *
 * - `stale` cursor with an equal-or-older watermark drops; a newer watermark
 *   paired with stale domain state is incomparable and starts recovery.
 * - `same` cursor emits only when the watermark advanced (how a terminal
 *   rejection becomes observable without a domain-state change); an equal
 *   watermark is a duplicate and an older one is stale.
 * - `fresh` cursor emits when the watermark held or advanced; a regressing
 *   watermark starts recovery.
 * - `unknown` starts recovery rather than guessing.
 *
 * A recovery read is the authority's current consistent observation, so its
 * result is emitted unless it is provably stale or a duplicate — this is what
 * makes recovery terminate instead of looping on incomparable cursors.
 */
export function createCausalAcceptanceGate<State, Cursor>(
  options: CausalAcceptanceGateOptions<State, Cursor>
): CausalAcceptanceGate<State, Cursor> {
  let last = options.initial
  let disposed = false
  let recovery: AbortController | null = null
  let recoveryQueued = false

  function classifyAgainstLast(
    incoming: Accepted<State, Cursor>
  ): "emit" | "drop" | "recover" {
    const relationship = options.classify(last.cursor, incoming.cursor)
    const watermarkDelta = incoming.through - last.through
    switch (relationship) {
      case "stale":
        return watermarkDelta > 0 ? "recover" : "drop"
      case "same":
        if (watermarkDelta > 0) return "emit"
        return "drop"
      case "fresh":
        return watermarkDelta >= 0 ? "emit" : "recover"
      case "unknown":
        return "recover"
    }
  }

  function emit(accepted: Accepted<State, Cursor>): void {
    last = accepted
    options.emit(accepted)
  }

  function startRecovery(): void {
    if (disposed) return
    if (recovery) {
      recoveryQueued = true
      return
    }
    const controller = new AbortController()
    recovery = controller
    void options
      .recover(controller.signal)
      .then((recovered) => {
        if (disposed || controller.signal.aborted) return
        const decision = classifyAgainstLast(recovered)
        if (decision !== "drop") emit(recovered)
      })
      .catch(() => {
        // A failed recovery read leaves `last` untouched; the next offer or
        // explicit recover() will try again.
      })
      .finally(() => {
        if (recovery === controller) recovery = null
        if (recoveryQueued && !disposed) {
          recoveryQueued = false
          startRecovery()
        }
      })
  }

  return {
    offer(accepted) {
      if (disposed) return
      const decision = classifyAgainstLast(accepted)
      if (decision === "emit") emit(accepted)
      else if (decision === "recover") startRecovery()
    },
    recover() {
      startRecovery()
    },
    dispose() {
      disposed = true
      recovery?.abort()
      recovery = null
    },
  }
}
