import { err, type Result } from "@workspace/result"

import type { MutationInvocation } from "./mutations"
import type { Accepted, MutationEnvelope, PushError } from "./protocol"

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

/**
 * `alive` is level-triggered: call it after EVERY successful source
 * round-trip, including ones that emitted nothing (a duplicate-suppressed
 * pull). Repeats are expected and cheap; a parked replica needs exactly that
 * "still alive, nothing new" signal to resume delivery, and deduplication
 * erases it from the accept channel. `down` marks the source unreachable;
 * any subsequent `alive` or `accept` clears it. An `accept` implies `alive`.
 */
export interface ReplicaTransportSink<State, Cursor = unknown> {
  accept(accepted: Accepted<State, Cursor>): void
  alive(): void
  down(): void
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

/**
 * The natural classifier for a scalar (monotonic counter) cursor. Scalars are
 * totally ordered, so `unknown` is unreachable — every pair of consistent
 * observations is comparable.
 */
export function classifyScalarCursor(
  previous: number,
  incoming: number
): CausalRelationship {
  return incoming < previous
    ? "stale"
    : incoming === previous
      ? "same"
      : "fresh"
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
 * A recovery read emits only when it is provably fresh against the snapshot
 * last emitted. Because `last` may advance while a recovery read is in
 * flight, an in-flight result can come back incomparable with the *new*
 * `last`: if `last` moved, the read was raced and recovery re-runs; if
 * `last` did not move, the source served an inconsistent observation and the
 * result is dropped (two consistent observations of one serialized authority
 * are always comparable, so re-reading an unchanged world cannot help).
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
    const lastAtStart = last
    void options
      .recover(controller.signal)
      .then((recovered) => {
        if (disposed || controller.signal.aborted) return
        const decision = classifyAgainstLast(recovered)
        if (decision === "emit") {
          emit(recovered)
        } else if (decision === "recover" && last !== lastAtStart) {
          // The read raced a fresher emission; re-read against the new last.
          recoveryQueued = true
        }
        // Otherwise drop: stale/duplicate, or incomparable against an
        // unchanged last (an inconsistent source read a re-read cannot fix).
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

/**
 * The IO seam a pull-on-invalidation adapter is composed over: one consistent
 * accepted read, the push door, and an invalidation signal (a realtime ping,
 * a poll tick, a reconnect — the transport treats them all as "the authority
 * may have moved; pull"). Vendor code (realtime clients, HTTP, Server
 * Actions, backoff policy) stays behind this seam in the application.
 *
 * `pushEnvelope` contract: a throw reaching the transport is classified
 * ambiguous-retryable and REDELIVERED. A throw from the layers around the
 * authority door means the authority recorded nothing; mapping it to
 * `rejected` would advance the replica past an unrecorded ID and wedge the
 * stream. Terminal refusals must arrive as typed `rejected` results from the
 * door, never as throws.
 */
export interface PullTransportSource<
  State,
  Invocation extends MutationInvocation,
  Error,
  Remote = void,
  Cursor = unknown,
> {
  fetchAccepted(signal: AbortSignal): Promise<Accepted<State, Cursor>>
  pushEnvelope(
    envelope: MutationEnvelope<Invocation>,
    signal: AbortSignal
  ): Promise<Result<Remote, PushError<Error>>>
  /** Every invalidation signal schedules a generation-gated pull. */
  subscribe(invalidate: () => void): () => void
}

export interface PullTransportOptions<
  State,
  Invocation extends MutationInvocation,
  Error,
  Remote = void,
  Cursor = unknown,
> {
  readonly source: PullTransportSource<State, Invocation, Error, Remote, Cursor>
  /** The accepted tuple the replica was loaded with (the causal floor). */
  readonly initial: Accepted<State, Cursor>
  /** Describes the relationship between two DOMAIN cursors (see the gate). */
  readonly classify: (previous: Cursor, incoming: Cursor) => CausalRelationship
}

/**
 * The pull-on-invalidation transport: every invalidation signal triggers a
 * snapshot refetch; every refetch runs through a pull generation (the "older
 * response finished last" race) and the causal acceptance gate keyed on the
 * adapter's cursor. A signal is only ever an invalidation — the gate, not the
 * signal payload, decides causality, so a stale or echoed signal costs one
 * suppressed read instead of a wrong emission.
 *
 * Extracted (UNN-646) from the twin loops the entity adapter and the alien
 * polling reference adapter each carried; both are now thin delegates, as is
 * the combat binding.
 */
export function createPullTransport<
  State,
  Invocation extends MutationInvocation,
  Error,
  Remote = void,
  Cursor = unknown,
>(
  options: PullTransportOptions<State, Invocation, Error, Remote, Cursor>
): ReplicaTransport<State, Invocation, Error, Remote, Cursor> {
  return {
    connect(sink) {
      let active = true
      const generations = createPullGenerationGate()
      const acceptance = createCausalAcceptanceGate<State, Cursor>({
        initial: options.initial,
        classify: options.classify,
        recover: (signal) => options.source.fetchAccepted(signal),
        emit: (accepted) => {
          if (active) sink.accept(accepted)
        },
      })

      const pull = (): void => {
        const generation = generations.begin()
        options.source.fetchAccepted(generation.signal).then(
          (snapshot) => {
            generation.publish(() => {
              // Emit (via the gate) before the liveness signal, so the sink
              // holds current accepted state before delivery resumes.
              acceptance.offer(snapshot)
              if (active) sink.alive()
            })
          },
          () => {
            if (active && !generation.signal.aborted) sink.down()
          }
        )
      }

      // Subscribe BEFORE the catch-up read (Codex P2, PR #382): a signal
      // landing while the catch-up is in flight schedules another
      // generation-gated pull instead of vanishing into the gap between
      // read and subscription — missed changes are closed by the read.
      const unsubscribe = options.source.subscribe(pull)
      pull()
      return () => {
        active = false
        unsubscribe()
        generations.cancel()
        acceptance.dispose()
      }
    },

    async push(envelope, signal) {
      try {
        return await options.source.pushEnvelope(envelope, signal)
      } catch (cause) {
        return err({ kind: "retryable", cause })
      }
    },
  }
}
