import type { MutationInvocation } from "../mutations"
import type { Accepted, ConnectionStatus, MutationEnvelope } from "../protocol"
import type { ReplicaTransport } from "../transport"
import {
  deepEqual,
  eventually,
  invariant,
  settle,
  type ContractLaw,
} from "./support"

/** Programs how the scenario's source handles the next push it receives. */
export type PushPrime<ApplyError> =
  | { readonly kind: "reject"; readonly error: ApplyError }
  /** Executes and records the mutation, then loses the response. */
  | { readonly kind: "ambiguous-committed" }
  /** Loses the request before the authority sees it. */
  | { readonly kind: "ambiguous-dropped" }

export interface ReadGate {
  /** Number of source reads currently held open. */
  count(): number
  /** Completes the held read at `index` (arrival order). */
  release(index: number): Promise<void>
  releaseAll(): Promise<void>
}

/**
 * The controllable harness an adapter supplies over its source. Capability
 * methods (`gateReads`, `sever`/`restore`, `advanceIncomparable`) are needed
 * by the correspondingly named laws; a scenario that deliberately does not
 * model one must say so via `TransportContractOptions.omit`, which drops the
 * law VISIBLY — assert the returned law count in your test so a silent
 * coverage cap cannot creep in.
 */
export interface TransportContractScenario<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
  Cursor,
> {
  readonly transport: ReplicaTransport<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
  /** A representative terminal error the source can reject a push with. */
  readonly rejectionError: ApplyError
  /** The accepted tuple a correct adapter would emit right now. */
  authoritative(): Accepted<State, Cursor>
  /** Every consistent tuple the source has served since creation. */
  observations(): ReadonlyArray<Accepted<State, Cursor>>
  /** Commit an external change at the source (advances value and cursor). */
  advance(): void | Promise<void>
  /** Fire the adapter's invalidation signal (realtime ping / poll tick). */
  signal(): void
  /** A valid next-in-order envelope for push-side laws. */
  makeEnvelope(): MutationEnvelope<Invocation>
  /** Envelopes that arrived at the source's push endpoint, in order. */
  received(): ReadonlyArray<MutationEnvelope<Invocation>>
  /** Envelopes the source actually executed. */
  executed(): ReadonlyArray<MutationEnvelope<Invocation>>
  primePush(outcome: PushPrime<ApplyError>): void
  /** Hold subsequent source reads open to script response-order races. */
  gateReads?(): ReadGate
  /** Sever and restore the source's streaming connection. */
  sever?(): void
  restore?(): void
  /** Produce a snapshot causally incomparable with the last emission. */
  advanceIncomparable?(): void | Promise<void>
  dispose?(): void
}

export type TransportCapability =
  | "pull-generations"
  | "duplicate-suppression"
  | "incomparable-cursors"
  | "reconnect"

export interface TransportContractOptions<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
  Cursor,
> {
  create():
    | TransportContractScenario<State, Invocation, ApplyError, Remote, Cursor>
    | Promise<
        TransportContractScenario<State, Invocation, ApplyError, Remote, Cursor>
      >
  /**
   * Capabilities this scenario deliberately does not model. Each omission
   * drops its law from the returned list; production-shaped adapters should
   * omit nothing.
   */
  omit?: ReadonlyArray<TransportCapability>
}

export const TRANSPORT_CONTRACT_LAW_NAMES = [
  "emits a current accepted snapshot before reporting connected",
  "suppresses a slower result from an older pull generation",
  "never emits a duplicate accepted snapshot",
  "never emits a causally stale accepted snapshot",
  "recovers rather than guessing when cursors are incomparable",
  "recovers current accepted state after a reconnect",
  "preserves the accepted value and its watermark as one observation",
  "preserves an envelope exactly across an ambiguous redelivery",
  "reports terminal rejection separately from ambiguous failure",
  "stops all emissions after disposal",
] as const

const LAW_CAPABILITIES: Partial<
  Record<(typeof TRANSPORT_CONTRACT_LAW_NAMES)[number], TransportCapability>
> = {
  [TRANSPORT_CONTRACT_LAW_NAMES[1]]: "pull-generations",
  [TRANSPORT_CONTRACT_LAW_NAMES[2]]: "duplicate-suppression",
  [TRANSPORT_CONTRACT_LAW_NAMES[4]]: "incomparable-cursors",
  [TRANSPORT_CONTRACT_LAW_NAMES[5]]: "reconnect",
}

type SinkEvent<State, Cursor> =
  | { readonly kind: "accept"; readonly accepted: Accepted<State, Cursor> }
  | { readonly kind: "connection"; readonly status: ConnectionStatus }

interface RecordingSink<State, Cursor> {
  readonly sink: {
    accept(accepted: Accepted<State, Cursor>): void
    setConnection(status: ConnectionStatus): void
  }
  events(): ReadonlyArray<SinkEvent<State, Cursor>>
  accepts(): ReadonlyArray<Accepted<State, Cursor>>
  lastStatus(): ConnectionStatus | undefined
}

function recordingSink<State, Cursor>(): RecordingSink<State, Cursor> {
  const events: SinkEvent<State, Cursor>[] = []
  return {
    sink: {
      accept: (accepted) => {
        events.push({ kind: "accept", accepted })
      },
      setConnection: (status) => {
        events.push({ kind: "connection", status })
      },
    },
    events: () => [...events],
    accepts: () =>
      events.flatMap((event) =>
        event.kind === "accept" ? [event.accepted] : []
      ),
    lastStatus: () => {
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const event = events[i]
        if (event && event.kind === "connection") return event.status
      }
      return undefined
    },
  }
}

export function verifyTransportContract<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
  Remote,
  Cursor,
>(
  options: TransportContractOptions<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
): ContractLaw[] {
  type Scenario = TransportContractScenario<
    State,
    Invocation,
    ApplyError,
    Remote,
    Cursor
  >
  const omitted = new Set(options.omit ?? [])

  function law(
    name: string,
    body: (
      scenario: Scenario,
      rec: RecordingSink<State, Cursor>,
      connect: () => () => void
    ) => Promise<void>
  ): ContractLaw {
    return {
      name,
      run: async () => {
        const scenario = await options.create()
        const rec = recordingSink<State, Cursor>()
        // Laws decide when to connect: the catch-up law moves the source
        // first, so the wrapper must not connect eagerly.
        const cleanups: Array<() => void> = []
        const connect = (): (() => void) => {
          const disconnect = scenario.transport.connect(rec.sink)
          cleanups.push(disconnect)
          return disconnect
        }
        try {
          await body(scenario, rec, connect)
          assertConsistentEmissions(scenario, rec)
        } finally {
          for (const cleanup of cleanups) cleanup()
          scenario.dispose?.()
        }
      },
    }
  }

  /**
   * Every emitted tuple must deep-equal one consistent observation the source
   * actually served — a franken-tuple pairing one read's value with another's
   * watermark or cursor fails here.
   */
  function assertConsistentEmissions(
    scenario: Scenario,
    rec: RecordingSink<State, Cursor>
  ): void {
    const observations = scenario.observations()
    for (const accepted of rec.accepts()) {
      invariant(
        observations.some((observation) => deepEqual(observation, accepted)),
        "emitted an accepted tuple the source never served as one observation"
      )
    }
  }

  /**
   * The rank of an emission is the index of the first observation it equals;
   * causal delivery requires non-regressing ranks, and (where duplicate
   * suppression is claimed) strictly increasing ones.
   */
  function assertCausalOrder(
    scenario: Scenario,
    rec: RecordingSink<State, Cursor>,
    label: string,
    { strict }: { strict: boolean }
  ): void {
    const observations = scenario.observations()
    let lastRank = -1
    for (const accepted of rec.accepts()) {
      const rank = observations.findIndex((observation) =>
        deepEqual(observation, accepted)
      )
      invariant(rank !== -1, `${label}: emission not among source observations`)
      invariant(
        strict ? rank > lastRank : rank >= lastRank,
        `${label}: stale${strict ? " or duplicate" : ""} emission`
      )
      lastRank = rank
    }
  }

  async function awaitConnected(
    rec: RecordingSink<State, Cursor>
  ): Promise<void> {
    await eventually(() => {
      invariant(rec.lastStatus() === "connected", "adapter never connected")
    })
  }

  const strictDuplicates = !omitted.has("duplicate-suppression")

  const implementations: Record<
    (typeof TRANSPORT_CONTRACT_LAW_NAMES)[number],
    ContractLaw
  > = {
    [TRANSPORT_CONTRACT_LAW_NAMES[0]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[0],
      async (scenario, rec, connect) => {
        // The source advanced between adapter construction and connect; the
        // adapter must surface current accepted state before claiming health.
        await scenario.advance()
        connect()
        await awaitConnected(rec)
        const events = rec.events()
        const connectedAt = events.findIndex(
          (event) => event.kind === "connection" && event.status === "connected"
        )
        invariant(connectedAt !== -1, "adapter never reported connected")
        const priorAccepts = events
          .slice(0, connectedAt)
          .flatMap((event) => (event.kind === "accept" ? [event.accepted] : []))
        invariant(
          priorAccepts.some((accepted) =>
            deepEqual(accepted, scenario.authoritative())
          ),
          "no current accepted snapshot was emitted before reporting connected"
        )
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[1]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[1],
      async (scenario, rec, connect) => {
        invariant(
          scenario.gateReads,
          "scenario must implement gateReads() for the pull-generation law"
        )
        connect()
        await awaitConnected(rec)
        // Establish a baseline emission first: a correct adapter emits
        // nothing at connect when the source never moved.
        await scenario.advance()
        scenario.signal()
        await eventually(() => {
          invariant(rec.accepts().length >= 1, "expected a baseline emission")
        })
        const gate = scenario.gateReads()
        scenario.signal()
        await eventually(() => {
          invariant(gate.count() >= 1, "first pull never started")
        })
        await scenario.advance()
        scenario.signal()
        await eventually(() => {
          invariant(gate.count() >= 2, "second pull never started")
        })
        const before = rec.accepts().length
        await gate.release(1)
        await eventually(() => {
          invariant(
            rec.accepts().length > before,
            "the newer pull must publish"
          )
        })
        const afterNewest = rec.accepts().length
        await gate.release(0)
        await settle(10)
        invariant(
          rec.accepts().length === afterNewest,
          "the older pull generation must not publish after the newer one"
        )
        assertCausalOrder(scenario, rec, "pull generations", {
          strict: strictDuplicates,
        })
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[2]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[2],
      async (scenario, rec, connect) => {
        connect()
        await awaitConnected(rec)
        // Establish a baseline emission first: a correct adapter emits
        // nothing at connect when the source never moved.
        await scenario.advance()
        scenario.signal()
        await eventually(() => {
          invariant(rec.accepts().length >= 1, "expected a baseline emission")
        })
        const before = rec.accepts().length
        scenario.signal()
        scenario.signal()
        await settle(10)
        invariant(
          rec.accepts().length === before,
          "an unchanged source must not re-emit"
        )
        assertCausalOrder(scenario, rec, "duplicate suppression", {
          strict: true,
        })
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[3]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[3],
      async (scenario, rec, connect) => {
        connect()
        await awaitConnected(rec)
        await scenario.advance()
        scenario.signal()
        await eventually(() => {
          invariant(
            rec.accepts().some((a) => deepEqual(a, scenario.authoritative())),
            "the fresh snapshot never arrived"
          )
        })
        assertCausalOrder(scenario, rec, "causal ordering", {
          strict: strictDuplicates,
        })
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[4]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[4],
      async (scenario, rec, connect) => {
        invariant(
          scenario.advanceIncomparable,
          "scenario must implement advanceIncomparable() for the incomparable-cursor law"
        )
        connect()
        await awaitConnected(rec)
        // Advance first so the recovery read has genuinely fresh state to
        // surface; the doctored incomparable snapshot must not be emitted.
        await scenario.advance()
        await scenario.advanceIncomparable()
        scenario.signal()
        await eventually(() => {
          invariant(
            rec.accepts().some((a) => deepEqual(a, scenario.authoritative())),
            "recovery never surfaced current accepted state"
          )
        })
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[5]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[5],
      async (scenario, rec, connect) => {
        invariant(
          scenario.sever && scenario.restore,
          "scenario must implement sever()/restore() for the reconnect law"
        )
        connect()
        await awaitConnected(rec)
        scenario.sever?.()
        await scenario.advance()
        scenario.restore?.()
        await eventually(() => {
          invariant(
            rec.accepts().some((a) => deepEqual(a, scenario.authoritative())),
            "the change missed while severed never arrived"
          )
          invariant(
            rec.lastStatus() === "connected",
            "the adapter must report connected after recovery"
          )
        })
        assertCausalOrder(scenario, rec, "reconnect recovery", {
          strict: strictDuplicates,
        })
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[6]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[6],
      async (scenario, rec, connect) => {
        connect()
        await awaitConnected(rec)
        await scenario.advance()
        scenario.signal()
        await scenario.advance()
        scenario.signal()
        await eventually(() => {
          invariant(
            rec.accepts().some((a) => deepEqual(a, scenario.authoritative())),
            "the final snapshot never arrived"
          )
        })
        // assertConsistentEmissions runs in the law wrapper for every law;
        // this law exists to exercise it under interleaved advances.
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[7]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[7],
      async (scenario) => {
        scenario.primePush({ kind: "ambiguous-committed" })
        const envelope = scenario.makeEnvelope()
        const first = await scenario.transport.push(
          envelope,
          new AbortController().signal
        )
        invariant(
          !first.ok && first.error.kind === "retryable",
          "an ambiguous push must report retryable"
        )
        const second = await scenario.transport.push(
          envelope,
          new AbortController().signal
        )
        invariant(second.ok, "redelivery must recover the recorded outcome")
        const received = scenario.received()
        invariant(received.length === 2, "expected two arrivals at the source")
        invariant(
          deepEqual(received[0], received[1]) &&
            deepEqual(received[0], envelope),
          "the redelivered envelope must be identical"
        )
        invariant(
          scenario.executed().length === 1,
          "the source must have executed the mutation exactly once"
        )
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[8]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[8],
      async (scenario) => {
        scenario.primePush({ kind: "ambiguous-dropped" })
        const dropped = await scenario.transport.push(
          scenario.makeEnvelope(),
          new AbortController().signal
        )
        invariant(
          !dropped.ok && dropped.error.kind === "retryable",
          "a lost request must be retryable, not rejected"
        )
        invariant(
          scenario.executed().length === 0,
          "a dropped request must not have executed"
        )
        scenario.primePush({ kind: "reject", error: scenario.rejectionError })
        const rejected = await scenario.transport.push(
          scenario.makeEnvelope(),
          new AbortController().signal
        )
        invariant(
          !rejected.ok && rejected.error.kind === "rejected",
          "a terminal refusal must be rejected, not retryable"
        )
        invariant(
          !rejected.ok &&
            rejected.error.kind === "rejected" &&
            deepEqual(rejected.error.error, scenario.rejectionError),
          "the terminal refusal must carry the source's typed error"
        )
      }
    ),

    [TRANSPORT_CONTRACT_LAW_NAMES[9]]: law(
      TRANSPORT_CONTRACT_LAW_NAMES[9],
      async (scenario, rec, connect) => {
        const disconnect = connect()
        await awaitConnected(rec)
        disconnect()
        const frozen = rec.events().length
        await scenario.advance()
        scenario.signal()
        await settle(10)
        invariant(
          rec.events().length === frozen,
          "a disposed transport must stop all emissions"
        )
      }
    ),
  }

  return TRANSPORT_CONTRACT_LAW_NAMES.flatMap((name) => {
    const capability = LAW_CAPABILITIES[name]
    if (capability && omitted.has(capability)) return []
    return [implementations[name]]
  })
}
