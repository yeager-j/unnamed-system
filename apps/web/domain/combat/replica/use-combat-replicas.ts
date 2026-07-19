"use client"

import { useEffect, useRef } from "react"
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
  createCombatInlineSource,
} from "@/lib/sync/combat-replica-source"

import { logCombatReplicaEvent } from "./events"
import { mintCombatEntityIdentity, mintCombatSessionIdentity } from "./identity"
import {
  combatDurableMutations,
  combatInlineMutations,
  writeCombatEntity,
  writeCombatInline,
  type CombatDurableInvocation,
  type CombatDurableState,
  type CombatInlineInvocation,
  type CombatInlineState,
} from "./mutations"
import type { CombatReplicaRejection } from "./rejection"

export type CombatBootstrapUnavailableReason =
  | CombatAcceptedError
  | "not-a-participant"
  | "no-inline-tuple"

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

type InlineController = ManagedReplica<
  CombatInlineState,
  CombatInlineInvocation,
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
  /** The console's microtask-deduped refresh, fired whenever any root's
   *  accepted state advances (see `createControllerTelemetry`). */
  readonly onExternalChange: () => void
}

export interface UseCombatReplicasReturn {
  handleOf: (participantId: ParticipantId) => CombatWriteHandle | undefined
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
 * - **Every accepted advance refreshes the route** (`onAccepted`). See
 *   `createControllerTelemetry` for why the watermark cannot gate this.
 * - **`settleAll` is the lifecycle-command barrier.** Commands that change
 *   the encounter's status (End Combat) must not overtake replica writes
 *   already in flight; the authority refuses a post-end write regardless, but
 *   settling first is what keeps the user-visible ordering intact.
 */
export function useCombatReplicas({
  encounterId,
  participantMeta,
  rosterIds,
  onExternalChange,
}: UseCombatReplicasArgs): UseCombatReplicasReturn {
  const durableRef = useRef(new Map<string, DurableController>())
  const durableBridges = useRef(new Map<string, InvalidationBridge>())
  const inlineRef = useRef<InlineController | null>(null)
  const inlineBridge = useRef<InvalidationBridge | null>(null)
  const onExternalChangeRef = useRef(onExternalChange)
  useEffect(() => {
    onExternalChangeRef.current = onExternalChange
  })

  const externalChange = (): void => onExternalChangeRef.current()

  function durableBridgeFor(entityId: string): InvalidationBridge {
    const existing = durableBridges.current.get(entityId)
    if (existing) return existing
    const created = createInvalidationBridge()
    durableBridges.current.set(entityId, created)
    return created
  }

  /**
   * One controller's application policy: refresh the route whenever this
   * root's accepted state advances, and toast on identity expiry.
   *
   * **Why the refresh is unconditional.** An earlier rule (UNN-646, before
   * review) suppressed the refresh when the incorporation watermark advanced,
   * reasoning that such a snapshot merely incorporated our own push, whose
   * Server Action response already carried the revalidated RSC payload. That
   * inference does not hold: `through` says which of THIS identity's
   * mutations are in, and says nothing about whether the same accepted tuple
   * also carries another identity's change. A second tab committing between
   * our push and our next pull produced exactly that — an advancing watermark
   * over a value the console's separate RSC container had never seen — and
   * nothing later corrected the frame.
   *
   * The cost is bounded and paid knowingly: the transport's causal gate
   * already drops duplicate and stale observations, and the bootstrap tuple
   * arrives as `initial` rather than as a snapshot event, so this costs one
   * redundant `router.refresh()` after some local writes and nothing at mount.
   *
   * This rides `onAccepted`, NOT `onEvent`. `onEvent` is a metrics sink whose
   * failure the package is entitled to swallow; reconciliation must never
   * ride an observability seam.
   */
  function createControllerTelemetry(root: "durable" | "session") {
    return {
      onEvent: (event: Parameters<typeof logCombatReplicaEvent>[1]) =>
        logCombatReplicaEvent(root, event),
      onAccepted: externalChange,
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
          externalChange()
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
      onAccepted: telemetry.onAccepted,
      onExpired: telemetry.onExpired,
      onUnavailable: telemetry.onUnavailable,
    })
  }

  function createInlineController(
    firstIdentity: ReturnType<typeof mintCombatSessionIdentity>,
    prefetch: Promise<BatchedBootstrap>
  ): InlineController {
    const bridge = inlineBridge.current ?? createInvalidationBridge()
    inlineBridge.current = bridge
    const telemetry = createControllerTelemetry("session")
    let pending: {
      identity: typeof firstIdentity
      shared: Promise<BatchedBootstrap>
    } | null = { identity: firstIdentity, shared: prefetch }

    return createManagedReplica({
      mutations: combatInlineMutations,
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
          identity = mintCombatSessionIdentity(encounterId)
          batch = await fetchAccepted({ encounterId, inline: identity })
        }
        if (!batch.ok) return err(batch.error)
        const accepted = batch.value.inline
        if (!accepted) {
          return err({
            kind: "unavailable" as const,
            reason: "no-inline-tuple",
          })
        }
        const source = createCombatInlineSource({
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
      onAccepted: telemetry.onAccepted,
      onExpired: telemetry.onExpired,
      onUnavailable: telemetry.onUnavailable,
    })
  }

  const durableEntityIds = [
    ...new Set(
      Object.values(participantMeta).flatMap((meta) =>
        meta.storage === "durable" ? [meta.characterId] : []
      )
    ),
  ].sort()
  const durableKey = durableEntityIds.join("|")

  // Sync the controller set to the roster: create missing (one batched
  // bootstrap per round), dispose removed. Refs persist across runs; the
  // teardown effect below owns full disposal.
  useEffect(() => {
    for (const [entityId, controller] of durableRef.current) {
      if (!durableEntityIds.includes(entityId)) {
        controller.dispose()
        durableRef.current.delete(entityId)
        durableBridges.current.delete(entityId)
      }
    }

    const missing = durableEntityIds.filter(
      (entityId) => !durableRef.current.has(entityId)
    )
    const needInline = inlineRef.current === null
    if (missing.length === 0 && !needInline) return

    const durableRequests = missing.map((entityId) => ({
      entityId,
      identity: mintCombatEntityIdentity(entityId),
    }))
    const inlineIdentity = needInline
      ? mintCombatSessionIdentity(encounterId)
      : undefined
    const shared = fetchAccepted({
      encounterId,
      ...(inlineIdentity ? { inline: inlineIdentity } : {}),
      durable: durableRequests.map(({ entityId, identity }) => ({
        entityId,
        identity,
      })),
    })

    if (inlineIdentity) {
      inlineRef.current = createInlineController(inlineIdentity, shared)
    }
    for (const { entityId, identity } of durableRequests) {
      durableRef.current.set(
        entityId,
        createDurableController(entityId, identity, shared)
      )
    }
    // The sync reads participantMeta through durableKey; the controller
    // factories are stable closures over refs.
  }, [encounterId, durableKey])

  // Full teardown: unmount, or the console remounting onto a different
  // encounter. Runs before the sync effect's next pass, which recreates.
  useEffect(() => {
    const durable = durableRef.current
    const bridges = durableBridges.current
    return () => {
      for (const controller of durable.values()) controller.dispose()
      durable.clear()
      bridges.clear()
      inlineRef.current?.dispose()
      inlineRef.current = null
      inlineBridge.current = null
    }
  }, [encounterId])

  function handleOf(
    participantId: ParticipantId
  ): CombatWriteHandle | undefined {
    const meta = participantMeta[participantId]
    if (meta === undefined) return undefined

    if (meta.storage === "durable") {
      const controller = durableRef.current.get(meta.characterId)
      if (!controller) return undefined
      return {
        channel:
          meta.characterShortId !== ""
            ? {
                characterId: meta.characterId,
                shortId: meta.characterShortId,
              }
            : null,
        mutate: (write) => controller.mutate(writeCombatEntity(write)),
      }
    }

    const inline = inlineRef.current
    if (!inline) return undefined
    return {
      channel: null,
      mutate: (write) =>
        inline.mutate(writeCombatInline({ participantId, write })),
    }
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
      ...durableRef.current.values(),
      ...(inlineRef.current ? [inlineRef.current] : []),
    ]
    const outcomes = await Promise.all(
      controllers.map((controller) => controller.settleMutations())
    )
    return outcomes.every((outcome) => outcome.ok)
      ? ok(undefined)
      : err("pending-write-failed")
  }

  return {
    handleOf,
    settleAll,
    pcChannels,
    // The payload is no longer parsed client-side: a ping is only ever an
    // invalidation signal — the transport's causal gate decides causality.
    onPcPing: (characterId) =>
      durableBridges.current.get(characterId)?.notify(),
    notifyEncounterPing: () => inlineBridge.current?.notify(),
    notifyReconnect: () => {
      for (const bridge of durableBridges.current.values()) bridge.notify()
      inlineBridge.current?.notify()
    },
  }
}
