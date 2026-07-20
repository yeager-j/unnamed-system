"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  createManagedReplica,
  type ManagedBootstrapFailure,
  type ManagedMutationReceipt,
  type ManagedReplica,
  type ManagedUnavailable,
} from "@workspace/replica"
import {
  classifyScalarCursor,
  createPullTransport,
} from "@workspace/replica/transport"
import { err, ok, type Result } from "@workspace/result"

import type {
  CombatDurableReplicaSnapshot,
  CombatReplicaSnapshots,
  EncounterReplicaSnapshot,
} from "@/domain/combat/compose-combat-model"
import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { compareEntityVersionVectors } from "@/domain/entity/replica/cursor"
import {
  loadCombatAcceptedAction,
  type CombatAccepted,
  type CombatAcceptedError,
} from "@/lib/actions/combat/replica/snapshot"
import type {
  CombatAcceptedRequest,
  CombatSessionRemote,
} from "@/lib/actions/combat/replica/wire.schema"
import {
  createCombatDurableSource,
  createEncounterSource,
} from "@/lib/sync/combat-replica-source"

import { logCombatReplicaEvent } from "./events"
import { mintCombatEntityIdentity, mintEncounterIdentity } from "./identity"
import {
  combatDurableMutations,
  createEncounterSessionInvocation,
  encounterMutations,
  writeCombatEntity,
  writeEncounterInline,
  type CombatDurableInvocation,
  type CombatDurableState,
  type EncounterInvocation,
  type EncounterReplicaState,
  type EncounterSessionEvent,
} from "./mutations"
import type {
  CombatReplicaRejection,
  CombatWriteDispatchError,
} from "./rejection"

export type CombatBootstrapUnavailableReason =
  | CombatAcceptedError
  | "not-a-participant"
  | "no-encounter-tuple"

/** One durable PC's realtime channel key. */
export interface PcChannel {
  characterId: string
  shortId: string
}

/**
 * One participant's resolved write route: the appropriate replica's `mutate`,
 * bound to the participant's addressing, plus the realtime channel key for a
 * durable participant. Downstream code receives the durable/inline
 * distinction resolved — it never re-reads `ParticipantMeta.storage`.
 */
export interface CombatWriteHandle {
  /** `null` for inline participants (and for a durable row whose public
   *  shortId hasn't resolved). */
  readonly channel: PcChannel | null
  mutate(
    write: CombatEntityWrite
  ): ManagedMutationReceipt<
    CombatReplicaRejection,
    CombatSessionRemote | void,
    CombatBootstrapUnavailableReason
  >
}

type DurableController = ManagedReplica<
  CombatDurableState,
  CombatDurableInvocation,
  CombatReplicaRejection,
  void,
  CombatBootstrapUnavailableReason
>

type EncounterController = ManagedReplica<
  EncounterReplicaState,
  EncounterInvocation,
  CombatReplicaRejection,
  CombatSessionRemote,
  CombatBootstrapUnavailableReason
>

/**
 * One bootstrap read's outcome, already classified for the managed layer: the
 * accepted tuples, or the failure that says whether retrying could help.
 */
type BatchedBootstrap = Result<
  CombatAccepted,
  ManagedBootstrapFailure<CombatBootstrapUnavailableReason>
>

/** The single-signal invalidation fan-in the console feeds per channel. */
interface InvalidationBridge {
  subscribe(invalidate: () => void): () => void
  notify(): void
}

interface CombatReplicaSnapshotStore {
  getSnapshot(): CombatReplicaSnapshots
  subscribe(listener: () => void): () => void
  attachDurable(entityId: string, controller: DurableController): () => void
  attachEncounter(controller: EncounterController): () => void
}

const EMPTY_REPLICA_SNAPSHOTS: CombatReplicaSnapshots = {
  encounterReplicaSnapshot: null,
  durableReplicaSnapshots: new Map(),
}

function createCombatReplicaSnapshotStore(): CombatReplicaSnapshotStore {
  let snapshot = EMPTY_REPLICA_SNAPSHOTS
  const listeners = new Set<() => void>()

  function publish(next: CombatReplicaSnapshots): void {
    snapshot = next
    for (const listener of [...listeners]) listener()
  }

  function attachDurable(
    entityId: string,
    controller: DurableController
  ): () => void {
    function sync(): void {
      const state = controller.getSnapshot()
      const current = snapshot.durableReplicaSnapshots.get(entityId)
      if (state.status === "ready") {
        if (current === state.replica) return
        const durableReplicaSnapshots = new Map(
          snapshot.durableReplicaSnapshots
        )
        durableReplicaSnapshots.set(entityId, state.replica)
        publish({ ...snapshot, durableReplicaSnapshots })
        return
      }
      if (current === undefined) return
      const durableReplicaSnapshots = new Map(snapshot.durableReplicaSnapshots)
      durableReplicaSnapshots.delete(entityId)
      publish({ ...snapshot, durableReplicaSnapshots })
    }

    const unsubscribe = controller.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      if (!snapshot.durableReplicaSnapshots.has(entityId)) return
      const durableReplicaSnapshots = new Map(snapshot.durableReplicaSnapshots)
      durableReplicaSnapshots.delete(entityId)
      publish({ ...snapshot, durableReplicaSnapshots })
    }
  }

  function attachEncounter(controller: EncounterController): () => void {
    function sync(): void {
      const state = controller.getSnapshot()
      const current = snapshot.encounterReplicaSnapshot
      if (state.status === "ready") {
        if (current === state.replica) return
        publish({ ...snapshot, encounterReplicaSnapshot: state.replica })
        return
      }
      if (current === null) return
      publish({ ...snapshot, encounterReplicaSnapshot: null })
    }

    const unsubscribe = controller.subscribe(sync)
    sync()
    return () => {
      unsubscribe()
      if (snapshot.encounterReplicaSnapshot === null) return
      publish({ ...snapshot, encounterReplicaSnapshot: null })
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    attachDurable,
    attachEncounter,
  }
}

interface DurableControllerEntry {
  readonly controller: DurableController
  readonly detachSnapshot: () => void
}

interface EncounterControllerEntry {
  readonly controller: EncounterController
  readonly detachSnapshot: () => void
}

function createInvalidationBridge(): InvalidationBridge {
  const handlers = new Set<() => void>()
  return {
    subscribe(invalidate) {
      handlers.add(invalidate)
      return () => handlers.delete(invalidate)
    },
    notify() {
      for (const handler of [...handlers]) handler()
    },
  }
}

export interface UseCombatReplicasArgs {
  readonly encounterId: string
  readonly participantMeta: Record<ParticipantId, ParticipantMeta>
  /** The (optimistic) roster — which participants get channels right now. */
  readonly rosterIds: ParticipantId[]
  /** Setup needs only the draft Encounter root. Durable entity roots are
   *  licensed and hydrated only by the live console. */
  readonly includeDurableRoots?: boolean
  /** Refreshes encounter-owned state after bootstrap proves the encounter is
   *  no longer live. Accepted component snapshots never use this callback. */
  readonly onEncounterUnavailable: () => void
}

export interface UseCombatReplicasReturn {
  /** Session intents need the accepted Encounter projection to capture their
   * preconditions. Controls stay unavailable until that projection is ready. */
  encounterIntentReady: boolean
  handleOf: (participantId: ParticipantId) => CombatWriteHandle | undefined
  mutateEncounter: (
    event: EncounterSessionEvent,
    options: { readonly roundComplete: boolean }
  ) => Result<
    ManagedMutationReceipt<
      CombatReplicaRejection,
      CombatSessionRemote,
      CombatBootstrapUnavailableReason
    >,
    CombatWriteDispatchError
  >
  /**
   * Waits for every root's in-flight writes to reach a trusted outcome.
   * Lifecycle commands that change the encounter out from under the replicas
   * — End Combat above all — await this first so they cannot overtake a
   * component write the DM already clicked.
   */
  settleAll: () => Promise<Result<void, "pending-write-failed">>
  pcChannels: PcChannel[]
  onPcPing: (characterId: string, data: unknown) => void
  notifyEncounterPing: () => void
  notifyReconnect: () => void
  encounterReplicaSnapshot: EncounterReplicaSnapshot | null
  durableReplicaSnapshots: ReadonlyMap<string, CombatDurableReplicaSnapshot>
}

/**
 * The combat replicas' keyed lifecycle (UNN-646) — the successor of
 * `useCombatantLanes`' per-PC queue/token machinery, and the console's **sole
 * consumer of `ParticipantMeta.storage`**: the app's ownership decision point
 * resolves each participant to the appropriate replica once, and everything
 * downstream reads handles, not tags.
 *
 * - **One replica per durable participant's entity row, one collection-valued
 *   replica per encounter** (the granularity decision — see AGENTS.md). Both
 *   ride `createManagedReplica` (bootstrap buffering, expiry rebuild,
 *   deferred disposal) over `createPullTransport`.
 * - **One batched bootstrap.** Controllers created in the same sync round
 *   share one `loadCombatAcceptedAction` call (Server Actions serialize per
 *   tab); an expiry rebuild or late joiner re-fetches its single root.
 * - **Roster changes diff the controller set.** A durable add is created on
 *   the RSC frame that delivers its meta (until then `handleOf` is
 *   `undefined` — the same participant-not-found toast window `laneOf` had);
 *   a remove disposes its controller, and its in-flight receipts settle
 *   `disposed`.
 * - **Ready projections are a React external store.** Component views
 *   subscribe directly; accepted advances never refresh the route. A root
 *   that expires or becomes unavailable drops back to the RSC event frame
 *   while a fresh identity bootstraps.
 * - **`settleAll` is the lifecycle-command barrier.** Commands that change
 *   the encounter's status (End Combat) must not overtake replica writes
 *   already in flight; the authority refuses a post-end write regardless, but
 *   settling first is what keeps the user-visible ordering intact.
 */
export function useCombatReplicas({
  encounterId,
  participantMeta,
  rosterIds,
  includeDurableRoots = true,
  onEncounterUnavailable,
}: UseCombatReplicasArgs): UseCombatReplicasReturn {
  const durableRef = useRef(new Map<string, DurableControllerEntry>())
  const durableBridges = useRef(new Map<string, InvalidationBridge>())
  const encounterRef = useRef<EncounterControllerEntry | null>(null)
  const encounterBridge = useRef<InvalidationBridge | null>(null)
  const [snapshotStore] = useState(createCombatReplicaSnapshotStore)
  const replicaSnapshots = useSyncExternalStore(
    snapshotStore.subscribe,
    snapshotStore.getSnapshot,
    snapshotStore.getSnapshot
  )
  const onEncounterUnavailableRef = useRef(onEncounterUnavailable)
  useEffect(() => {
    onEncounterUnavailableRef.current = onEncounterUnavailable
  })

  const encounterUnavailable = (): void => onEncounterUnavailableRef.current()

  function durableBridgeFor(entityId: string): InvalidationBridge {
    const existing = durableBridges.current.get(entityId)
    if (existing) return existing
    const created = createInvalidationBridge()
    durableBridges.current.set(entityId, created)
    return created
  }

  /** One controller's application policy: log protocol anomalies, toast on
   * identity expiry, and refresh only when bootstrap proves the route itself
   * is unavailable. Ready component snapshots publish through the external
   * store above; observability and routing do not participate in convergence. */
  function createControllerTelemetry(root: "durable" | "encounter") {
    return {
      onEvent: (event: Parameters<typeof logCombatReplicaEvent>[1]) =>
        logCombatReplicaEvent(root, event),
      onExpired({ dropped }: { dropped: number }) {
        if (dropped > 0) {
          toast.error(
            "This tab's combat session expired — unsent changes were discarded. Reconnecting…"
          )
        }
      },
      onUnavailable(
        failure: ManagedUnavailable<CombatBootstrapUnavailableReason>
      ) {
        if (
          failure.kind === "terminal" &&
          failure.reason === "encounter-not-live"
        ) {
          encounterUnavailable()
        }
      },
    }
  }

  /**
   * Turns one batched-bootstrap outcome into the managed layer's contract.
   * `encounter-not-live` is the stale-tab case: the encounter ended while
   * this console was open, so no identity will ever be minted for it again —
   * terminal. `onUnavailable` performs the route refresh only after the
   * controller has published and settled that terminal state.
   */
  function classifyBootstrapFailure(
    error: CombatAcceptedError
  ): ManagedBootstrapFailure<CombatBootstrapUnavailableReason> {
    return { kind: "unavailable", reason: error }
  }

  /**
   * The bootstrap read, with the door's typed errors classified terminal and
   * a THROW left to the managed layer's retry budget. The distinction is the
   * point: a refused read will be refused again, while a thrown one may be a
   * transient network failure that a retry recovers.
   */
  async function fetchAccepted(
    request: CombatAcceptedRequest
  ): Promise<BatchedBootstrap> {
    try {
      const result = await loadCombatAcceptedAction(request)
      return result.ok
        ? ok(result.value)
        : err(classifyBootstrapFailure(result.error))
    } catch (cause) {
      return err({ kind: "retryable", cause })
    }
  }

  function createDurableController(
    entityId: string,
    firstIdentity: ReturnType<typeof mintCombatEntityIdentity>,
    prefetch: Promise<BatchedBootstrap>
  ): DurableController {
    const bridge = durableBridgeFor(entityId)
    const telemetry = createControllerTelemetry("durable")
    let pending: {
      identity: typeof firstIdentity
      shared: Promise<BatchedBootstrap>
    } | null = { identity: firstIdentity, shared: prefetch }

    return createManagedReplica({
      mutations: combatDurableMutations,
      bootstrap: async () => {
        let identity: typeof firstIdentity
        let batch: BatchedBootstrap
        const initial = pending
        pending = null
        if (initial) {
          // Claim the one-shot handoff before awaiting it. If this shared call
          // times out, the managed retry must mint an identity and fetch anew.
          identity = initial.identity
          batch = await initial.shared
        } else {
          // Expiry rebuild: a fresh identity, a single-root fetch.
          identity = mintCombatEntityIdentity(entityId)
          batch = await fetchAccepted({
            encounterId,
            durable: [{ entityId, identity }],
          })
        }
        if (!batch.ok) return err(batch.error)
        const accepted = batch.value.durable[entityId]
        // Admitted-but-absent means the door did not license this entity: it
        // is no longer a durable participant of this encounter. No retry can
        // put it back on the roster, so the controller stops rather than
        // holding this participant's writes open.
        if (!accepted) {
          return err({
            kind: "unavailable" as const,
            reason: "not-a-participant",
          })
        }
        const source = createCombatDurableSource({
          encounterId,
          entityId,
          identity,
          subscribe: bridge.subscribe,
        })
        return ok({
          identity,
          initial: accepted,
          transport: createPullTransport({
            source,
            initial: accepted,
            classify: compareEntityVersionVectors,
          }),
        })
      },
      onEvent: telemetry.onEvent,
      onExpired: telemetry.onExpired,
      onUnavailable: telemetry.onUnavailable,
    })
  }

  function createEncounterController(
    firstIdentity: ReturnType<typeof mintEncounterIdentity>,
    prefetch: Promise<BatchedBootstrap>
  ): EncounterController {
    const bridge = encounterBridge.current ?? createInvalidationBridge()
    encounterBridge.current = bridge
    const telemetry = createControllerTelemetry("encounter")
    let pending: {
      identity: typeof firstIdentity
      shared: Promise<BatchedBootstrap>
    } | null = { identity: firstIdentity, shared: prefetch }

    return createManagedReplica({
      mutations: encounterMutations,
      bootstrap: async () => {
        let identity: typeof firstIdentity
        let batch: BatchedBootstrap
        const initial = pending
        pending = null
        if (initial) {
          // Claim the one-shot handoff before awaiting it. If this shared call
          // times out, the managed retry must mint an identity and fetch anew.
          identity = initial.identity
          batch = await initial.shared
        } else {
          identity = mintEncounterIdentity(encounterId)
          batch = await fetchAccepted({ encounterId, encounter: identity })
        }
        if (!batch.ok) return err(batch.error)
        const accepted = batch.value.encounter
        if (!accepted) {
          return err({
            kind: "unavailable" as const,
            reason: "no-encounter-tuple",
          })
        }
        const source = createEncounterSource({
          encounterId,
          identity,
          subscribe: bridge.subscribe,
        })
        return ok({
          identity,
          initial: accepted,
          transport: createPullTransport({
            source,
            initial: accepted,
            classify: classifyScalarCursor,
          }),
        })
      },
      onEvent: telemetry.onEvent,
      onExpired: telemetry.onExpired,
      onUnavailable: telemetry.onUnavailable,
    })
  }

  const rosterIdSet = new Set<string>(rosterIds)
  const durableEntityIds = includeDurableRoots
    ? [
        ...new Set(
          Object.entries(participantMeta).flatMap(([participantId, meta]) =>
            rosterIdSet.has(participantId) && meta.storage === "durable"
              ? [meta.characterId]
              : []
          )
        ),
      ].sort()
    : []
  const durableKey = durableEntityIds.join("|")

  // Sync the controller set to the roster: create missing (one batched
  // bootstrap per round), dispose removed. Refs persist across runs; the
  // teardown effect below owns full disposal.
  useEffect(() => {
    for (const [entityId, entry] of durableRef.current) {
      if (!durableEntityIds.includes(entityId)) {
        entry.detachSnapshot()
        entry.controller.dispose()
        durableRef.current.delete(entityId)
        durableBridges.current.delete(entityId)
      }
    }

    const missing = durableEntityIds.filter(
      (entityId) => !durableRef.current.has(entityId)
    )
    const needEncounter = encounterRef.current === null
    if (missing.length === 0 && !needEncounter) return

    const durableRequests = missing.map((entityId) => ({
      entityId,
      identity: mintCombatEntityIdentity(entityId),
    }))
    const encounterIdentity = needEncounter
      ? mintEncounterIdentity(encounterId)
      : undefined
    const shared = fetchAccepted({
      encounterId,
      ...(encounterIdentity ? { encounter: encounterIdentity } : {}),
      durable: durableRequests.map(({ entityId, identity }) => ({
        entityId,
        identity,
      })),
    })

    if (encounterIdentity) {
      const controller = createEncounterController(encounterIdentity, shared)
      encounterRef.current = {
        controller,
        detachSnapshot: snapshotStore.attachEncounter(controller),
      }
    }
    for (const { entityId, identity } of durableRequests) {
      const controller = createDurableController(entityId, identity, shared)
      durableRef.current.set(entityId, {
        controller,
        detachSnapshot: snapshotStore.attachDurable(entityId, controller),
      })
    }
    // Controller membership is keyed by encounter + durable IDs. Factory
    // identities change on render, but existing controllers deliberately keep
    // the identity, transport, and bootstrap closures they were created with;
    // adding them here would rerun this lifecycle effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encounterId, durableKey, snapshotStore])

  // Full teardown: unmount, or the console remounting onto a different
  // encounter. Runs before the sync effect's next pass, which recreates.
  useEffect(() => {
    const durable = durableRef.current
    const bridges = durableBridges.current
    return () => {
      for (const entry of durable.values()) {
        entry.detachSnapshot()
        entry.controller.dispose()
      }
      durable.clear()
      bridges.clear()
      encounterRef.current?.detachSnapshot()
      encounterRef.current?.controller.dispose()
      encounterRef.current = null
      encounterBridge.current = null
    }
  }, [encounterId, snapshotStore])

  function handleOf(
    participantId: ParticipantId
  ): CombatWriteHandle | undefined {
    if (!rosterIdSet.has(participantId)) return undefined
    const meta = participantMeta[participantId]
    if (meta === undefined) return undefined

    if (meta.storage === "durable") {
      const entry = durableRef.current.get(meta.characterId)
      if (!entry) return undefined
      return {
        channel:
          meta.characterShortId !== ""
            ? {
                characterId: meta.characterId,
                shortId: meta.characterShortId,
              }
            : null,
        mutate: (write) => entry.controller.mutate(writeCombatEntity(write)),
      }
    }

    const entry = encounterRef.current
    if (!entry) return undefined
    return {
      channel: null,
      mutate: (write) =>
        entry.controller.mutate(writeEncounterInline({ participantId, write })),
    }
  }

  function mutateEncounter(
    event: EncounterSessionEvent,
    options: { readonly roundComplete: boolean }
  ): Result<
    ManagedMutationReceipt<
      CombatReplicaRejection,
      CombatSessionRemote,
      CombatBootstrapUnavailableReason
    >,
    CombatWriteDispatchError
  > {
    const entry = encounterRef.current
    if (entry === null) return err("write-unavailable")
    const snapshot = entry.controller.getSnapshot()
    if (snapshot.status !== "ready") return err("write-unavailable")
    const invocation = createEncounterSessionInvocation(
      snapshot.replica.value,
      event,
      options
    )
    if (!invocation.ok) return err(invocation.error)
    return ok(entry.controller.mutate(invocation.value))
  }

  // Channel keys are loader-projected meta, not transport internals — derived
  // directly so subscriptions begin before any bootstrap resolves (a
  // pre-bootstrap ping notifies an empty bridge; the bootstrap read is the
  // catch-up).
  const seen = new Set<string>()
  const pcChannels = rosterIds.flatMap((participantId) => {
    const meta = participantMeta[participantId]
    if (meta?.storage !== "durable" || meta.characterShortId === "") return []
    if (seen.has(meta.characterId)) return []
    seen.add(meta.characterId)
    return [{ characterId: meta.characterId, shortId: meta.characterShortId }]
  })

  async function settleAll(): Promise<Result<void, "pending-write-failed">> {
    const controllers = [
      ...[...durableRef.current.values()].map((entry) => entry.controller),
      ...(encounterRef.current ? [encounterRef.current.controller] : []),
    ]
    const outcomes = await Promise.all(
      controllers.map((controller) => controller.settleMutations())
    )
    return outcomes.every((outcome) => outcome.ok)
      ? ok(undefined)
      : err("pending-write-failed")
  }

  return {
    encounterIntentReady: replicaSnapshots.encounterReplicaSnapshot !== null,
    handleOf,
    mutateEncounter,
    settleAll,
    pcChannels,
    // The payload is no longer parsed client-side: a ping is only ever an
    // invalidation signal — the transport's causal gate decides causality.
    onPcPing: (characterId) =>
      durableBridges.current.get(characterId)?.notify(),
    notifyEncounterPing: () => encounterBridge.current?.notify(),
    notifyReconnect: () => {
      for (const bridge of durableBridges.current.values()) bridge.notify()
      encounterBridge.current?.notify()
    },
    encounterReplicaSnapshot: replicaSnapshots.encounterReplicaSnapshot,
    durableReplicaSnapshots: replicaSnapshots.durableReplicaSnapshots,
  }
}
