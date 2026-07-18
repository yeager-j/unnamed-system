import { err, ok, type Result } from "@workspace/result"

import type { MutationInvocation, MutationRegistry } from "./mutations"
import type { Accepted, ClientIdentity, MutationEnvelope } from "./protocol"
import {
  createMutationProcessor,
  type ProcessorEvent,
  type ProcessRefusal,
  type RecordedOutcome,
} from "./server"
import type { ReplicaTransport, ReplicaTransportSink } from "./transport"

/**
 * Authority-side domain handler. The default replays the registry's own
 * `apply` (phase `rebase`) — for an in-memory authority the prediction IS the
 * trusted transition. Real authorities own a separate handler executed
 * against persistence state.
 */
export type InMemoryExecute<State, Invocation, ApplyError, Remote> = (
  state: State,
  invocation: Invocation
) => Result<{ state: State; remote: Remote }, ApplyError>

export interface InMemoryAuthorityOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  readonly mutations: MutationRegistry<State, Invocation, ApplyError>
  readonly initial: State
  readonly execute?: InMemoryExecute<State, Invocation, ApplyError, Remote>
  /** Forwarded to the underlying `createMutationProcessor`. */
  readonly onEvent?: (event: ProcessorEvent) => void
}

export interface InMemoryTransportHandle<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
> {
  readonly transport: ReplicaTransport<
    State,
    Invocation,
    ApplyError,
    Remote,
    number
  >
  /** Sends liveness evidence to the connected sink, simulating stream health. */
  alive(): void
  /** Marks the source unreachable for the connected sink. */
  down(): void
  /** The current accepted tuple personalized to this handle's client. */
  accepted(): Accepted<State, number>
}

/**
 * A deterministic authority + transport pair for tests. It runs deliveries
 * through the real `createMutationProcessor`, so authority-side ordering and
 * dedup semantics in tests are the production code path, not a reenactment.
 *
 * Accepted-state publication is manual (`publish()`), and push processing can
 * be paused, forced to fail before processing (`failNextPush`), or processed
 * with the response lost (`dropNextResult`) to script ambiguous deliveries.
 */
export interface InMemoryAuthority<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
> {
  transport(
    identity: ClientIdentity
  ): InMemoryTransportHandle<State, Invocation, ApplyError, Remote>
  read(): State
  cursor(): number
  /** Delivers personalized accepted snapshots to every connected sink. */
  publish(): void
  /** Commits a change as an out-of-band writer (no envelope, no dedup row). */
  commitExternal(invocation: Invocation): Promise<void>
  /** Direct protocol injection, bypassing any transport: for gap/dedup laws. */
  deliver(
    envelope: MutationEnvelope<Invocation>
  ): Promise<Result<Remote, ProcessRefusal<ApplyError>>>
  /** Every envelope that arrived at push, including forced failures. */
  deliveries(): ReadonlyArray<MutationEnvelope<Invocation>>
  /** Every envelope whose application handler actually ran. */
  executions(): ReadonlyArray<MutationEnvelope<Invocation>>
  /** The application handler terminally rejects its next execution. */
  vetoNext(error: ApplyError): void
  /**
   * Deletes the client's dedup record — the in-memory analogue of a
   * retention sweep. The client's next out-of-order delivery is refused
   * `unknown-client` (its next `mutationId` is well past the reset ledger).
   */
  forgetClient(client: ClientIdentity): void
  /** The next `count` pushes fail ambiguously WITHOUT reaching the authority. */
  failNextPush(count?: number): void
  /** The next `count` pushes process fully but lose their response. */
  dropNextResult(count?: number): void
  /** Parks subsequent pushes until released. */
  pause(): void
  /** Releases up to `count` parked pushes, each completing before the next. */
  flush(count?: number): Promise<void>
  /** Unpauses and releases everything parked. */
  resume(): Promise<void>
}

interface ClientRecord<Remote, ApplyError> {
  lastMutationId: number
  lastOutcome?: RecordedOutcome<Remote, ApplyError>
}

interface MemoryTx<State, Remote, ApplyError> {
  state: State
  version: number
  clients: Map<string, ClientRecord<Remote, ApplyError>>
}

interface ParkedPush {
  release(): void
  readonly completed: Promise<void>
}

function clientKey(client: ClientIdentity): string {
  return `${client.clientGroupId} ${client.clientId}`
}

export function createInMemoryAuthority<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote = void,
>(
  options: InMemoryAuthorityOptions<State, Invocation, ApplyError, Remote>
): InMemoryAuthority<State, Invocation, ApplyError, Remote> {
  const { mutations } = options
  const execute: InMemoryExecute<State, Invocation, ApplyError, Remote> =
    options.execute ??
    ((state, invocation) => {
      const definition = mutations.get(invocation.name)
      if (!definition) {
        throw new Error(`Unknown mutation "${invocation.name}"`)
      }
      const applied = definition.apply(state, invocation.args, {
        phase: "rebase",
      })
      return applied.ok
        ? ok({ state: applied.value, remote: undefined as Remote })
        : err(applied.error)
    })

  let state = structuredClone(options.initial)
  let version = 0
  const clients = new Map<string, ClientRecord<Remote, ApplyError>>()
  const sinks = new Map<string, ReplicaTransportSink<State, number>>()

  const deliveriesLog: MutationEnvelope<Invocation>[] = []
  const executionsLog: MutationEnvelope<Invocation>[] = []
  const vetoes: ApplyError[] = []
  let failNext = 0
  let dropNext = 0
  let paused = false
  const parked: ParkedPush[] = []

  // The promise chain stands in for the row lock a real dedup adapter takes:
  // transactions run strictly one at a time against a cloned draft that
  // commits only on success.
  let chain: Promise<unknown> = Promise.resolve()
  function transact<T>(
    work: (tx: MemoryTx<State, Remote, ApplyError>) => Promise<T>
  ): Promise<T> {
    const run = chain.then(async () => {
      const tx: MemoryTx<State, Remote, ApplyError> = {
        state: structuredClone(state),
        version,
        clients: new Map(
          [...clients].map(([key, record]) => [key, { ...record }])
        ),
      }
      const result = await work(tx)
      state = tx.state
      version = tx.version
      clients.clear()
      for (const [key, record] of tx.clients) clients.set(key, record)
      return result
    })
    chain = run.catch(() => undefined)
    return run
  }

  const processor = createMutationProcessor<
    State,
    Invocation,
    MemoryTx<State, Remote, ApplyError>,
    MutationEnvelope<Invocation>,
    ApplyError,
    Remote
  >({
    mutations,
    transact,
    onEvent: options.onEvent,
    dedup: {
      acquire: (tx, client) =>
        Promise.resolve(
          tx.clients.get(clientKey(client)) ?? { lastMutationId: 0 }
        ),
      record: (tx, client, mutationId, outcome) => {
        tx.clients.set(clientKey(client), {
          lastMutationId: mutationId,
          lastOutcome: outcome,
        })
        return Promise.resolve()
      },
    },
    execute: (tx, invocation, envelope) => {
      executionsLog.push(envelope)
      const veto = vetoes.shift()
      if (veto !== undefined) return Promise.resolve(err(veto))
      const result = execute(tx.state, invocation)
      if (!result.ok) return Promise.resolve(err(result.error))
      tx.state = result.value.state
      tx.version += 1
      return Promise.resolve(ok(result.value.remote))
    },
  })

  function acceptedFor(client: ClientIdentity): Accepted<State, number> {
    return {
      value: structuredClone(state),
      through: clients.get(clientKey(client))?.lastMutationId ?? 0,
      cursor: version,
    }
  }

  function deliver(
    envelope: MutationEnvelope<Invocation>
  ): Promise<Result<Remote, ProcessRefusal<ApplyError>>> {
    return processor(envelope, envelope)
  }

  /** Parks the caller until flushed/resumed, or until the signal aborts. */
  function parkPush(signal: AbortSignal): {
    gate: Promise<"released" | "aborted">
    markCompleted: () => void
  } {
    let releaseGate!: (outcome: "released" | "aborted") => void
    const gate = new Promise<"released" | "aborted">((resolve) => {
      releaseGate = resolve
    })
    let markCompleted!: () => void
    const completed = new Promise<void>((resolve) => {
      markCompleted = resolve
    })
    const entry: ParkedPush = {
      release: () => releaseGate("released"),
      completed,
    }
    parked.push(entry)
    signal.addEventListener(
      "abort",
      () => {
        const index = parked.indexOf(entry)
        if (index !== -1) parked.splice(index, 1)
        markCompleted()
        releaseGate("aborted")
      },
      { once: true }
    )
    return { gate, markCompleted }
  }

  return {
    transport(identity) {
      const key = clientKey(identity)
      return {
        transport: {
          connect(sink) {
            sinks.set(key, sink)
            // Catch-up emission: the current accepted tuple is the gapless
            // continuation for an in-process source.
            sink.accept(acceptedFor(identity))
            sink.alive()
            return () => {
              if (sinks.get(key) === sink) sinks.delete(key)
            }
          },
          async push(envelope, signal) {
            deliveriesLog.push(envelope)
            if (failNext > 0) {
              failNext -= 1
              return err({ kind: "retryable", cause: "forced-failure" })
            }
            let markCompleted: (() => void) | null = null
            if (paused) {
              if (signal.aborted) {
                return err({ kind: "retryable", cause: "aborted" })
              }
              const parking = parkPush(signal)
              markCompleted = parking.markCompleted
              const outcome = await parking.gate
              if (outcome === "aborted") {
                return err({ kind: "retryable", cause: "aborted" })
              }
            }
            try {
              const processed = await deliver(envelope)
              if (dropNext > 0) {
                dropNext -= 1
                return err({ kind: "retryable", cause: "response-dropped" })
              }
              if (processed.ok) return ok(processed.value)
              const refusal = processed.error
              if (refusal.kind === "rejected") {
                return err({ kind: "rejected", error: refusal.error })
              }
              if (refusal.kind === "unknown-client") {
                return err({ kind: "unknown-client" })
              }
              // A gap, invalid decode, or aged-out duplicate through push
              // means the client runtime broke the protocol — surface it
              // loudly in tests instead of inventing a domain error.
              throw new Error(
                `in-memory authority protocol violation: ${refusal.kind}`
              )
            } finally {
              markCompleted?.()
            }
          },
        },
        alive() {
          sinks.get(key)?.alive()
        },
        down() {
          sinks.get(key)?.down()
        },
        accepted: () => acceptedFor(identity),
      }
    },

    read: () => structuredClone(state),
    cursor: () => version,

    publish() {
      for (const [key, sink] of sinks) {
        const [clientGroupId = "", clientId = ""] = key.split(" ")
        sink.accept(acceptedFor({ clientGroupId, clientId }))
      }
    },

    async commitExternal(invocation) {
      const decoded = mutations.decode(invocation)
      if (!decoded.ok) {
        throw new Error(
          `commitExternal received an invalid invocation: ${JSON.stringify(decoded.error)}`
        )
      }
      await transact((tx) => {
        const result = execute(tx.state, decoded.value)
        if (!result.ok) {
          throw new Error(
            `commitExternal was refused: ${JSON.stringify(result.error)}`
          )
        }
        tx.state = result.value.state
        tx.version += 1
        return Promise.resolve()
      })
    },

    deliver,
    deliveries: () => [...deliveriesLog],
    executions: () => [...executionsLog],
    vetoNext: (error) => {
      vetoes.push(error)
    },
    forgetClient: (client) => {
      clients.delete(clientKey(client))
    },
    failNextPush: (count = 1) => {
      failNext += count
    },
    dropNextResult: (count = 1) => {
      dropNext += count
    },
    pause: () => {
      paused = true
    },
    async flush(count = Number.POSITIVE_INFINITY) {
      let remaining = count
      while (remaining > 0 && parked.length > 0) {
        const entry = parked.shift()
        if (!entry) break
        entry.release()
        await entry.completed
        remaining -= 1
      }
    },
    async resume() {
      paused = false
      while (parked.length > 0) {
        const entry = parked.shift()
        if (!entry) break
        entry.release()
        await entry.completed
      }
    },
  }
}
