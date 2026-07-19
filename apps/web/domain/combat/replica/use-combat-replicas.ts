"use client"

import { useEffect, useRef } from "react"
import { toast } from "sonner"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import {
  createManagedReplica,
  type ManagedReplica,
  type MutationReceipt,
} from "@workspace/replica"
import {
  classifyScalarCursor,
  createPullTransport,
} from "@workspace/replica/transport"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { compareEntityVersionVectors } from "@/domain/entity/replica/cursor"
import {
  loadCombatAcceptedAction,
  type CombatAccepted,
} from "@/lib/actions/combat/replica/snapshot"
import type { CombatSessionRemote } from "@/lib/actions/combat/replica/wire.schema"
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
  ): MutationReceipt<CombatReplicaRejection, CombatSessionRemote | void>
}

type DurableController = ManagedReplica<
  CombatDurableState,
  CombatDurableInvocation,
  CombatReplicaRejection,
  void
>

type InlineController = ManagedReplica<
  CombatInlineState,
  CombatInlineInvocation,
  CombatReplicaRejection,
  CombatSessionRemote
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
  /** The console's microtask-deduped refresh; fired only for EXTERNAL
   *  changes (see the watermark rule below). */
  readonly onExternalChange: () => void
}

export interface UseCombatReplicasReturn {
  handleOf: (participantId: ParticipantId) => CombatWriteHandle | undefined
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
 * - **The watermark refresh rule** (replacing `decidePcPing`): an accepted
 *   snapshot whose incorporation watermark did NOT advance was caused by
 *   someone else's write → `onExternalChange`. A snapshot that advanced
 *   `through` incorporated our own push, whose action response already
 *   carried the revalidated RSC payload → skip — except a write recovered by
 *   redelivery, whose original response (and payload) may have been lost;
 *   that arm refreshes on settlement (see `createControllerTelemetry`).
 *   Echoed pings never get this far — the causal gate suppresses the
 *   duplicate pull.
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
   * One controller's shared telemetry: the expiry toast, and the two rules
   * deciding when a root's change needs a route refresh —
   *
   * - **The watermark rule** (replacing `decidePcPing`): an accepted snapshot
   *   whose incorporation watermark did NOT advance was someone else's write
   *   → refresh. One that advanced incorporated our own push, whose action
   *   response already carried the revalidated RSC payload → skip.
   * - **The recovered-write rule** (Codex P2, PR #391): the skip above is
   *   only sound when the push RESPONSE actually arrived. A mutation that
   *   settles after a redelivery (`sent` with `attempt > 1`) may have
   *   committed on an attempt whose response was lost — the revalidation ran
   *   server-side, but no payload reached this client, and the deduplicated
   *   replay deliberately re-fires nothing. Refresh on its settlement so the
   *   base catches up before the held transition drops the prediction. A
   *   redelivery whose first attempt never reached the server refreshes
   *   redundantly — one spare `router.refresh()` on an already-rare path.
   */
  function createControllerTelemetry(root: "durable" | "session") {
    let lastThrough = 0
    const redelivered = new Set<number>()
    return {
      bootstrapped(through: number) {
        lastThrough = through
      },
      onEvent(event: Parameters<typeof logCombatReplicaEvent>[1]) {
        logCombatReplicaEvent(root, event)
        switch (event.kind) {
          case "sent":
            if (event.attempt > 1) redelivered.add(event.id)
            return
          case "settled":
            if (redelivered.delete(event.id)) externalChange()
            return
          case "expired":
            redelivered.clear()
            return
          case "snapshot": {
            const advanced = event.through > lastThrough
            lastThrough = event.through
            if (!advanced) externalChange()
            return
          }
          default:
            return
        }
      },
      onExpired({ dropped }: { dropped: number }) {
        if (dropped > 0) {
          toast.error(
            "This tab's combat session expired — unsent changes were discarded. Reconnecting…"
          )
        }
      },
    }
  }

  function createDurableController(
    entityId: string,
    firstIdentity: ReturnType<typeof mintCombatEntityIdentity>,
    prefetch: Promise<CombatAccepted | null>
  ): DurableController {
    const bridge = durableBridgeFor(entityId)
    const telemetry = createControllerTelemetry("durable")
    let pending: {
      identity: typeof firstIdentity
      shared: Promise<CombatAccepted | null>
    } | null = { identity: firstIdentity, shared: prefetch }

    return createManagedReplica({
      mutations: combatDurableMutations,
      bootstrap: async () => {
        let identity: typeof firstIdentity
        let accepted
        if (pending) {
          identity = pending.identity
          const batch = await pending.shared
          pending = null
          accepted = batch?.durable[entityId] ?? null
        } else {
          // Expiry rebuild: a fresh identity, a single-root fetch.
          identity = mintCombatEntityIdentity(entityId)
          const result = await loadCombatAcceptedAction({
            encounterId,
            durable: [{ entityId, identity }],
          })
          accepted = result.ok ? (result.value.durable[entityId] ?? null) : null
        }
        if (!accepted) return null
        telemetry.bootstrapped(accepted.through)
        const source = createCombatDurableSource({
          encounterId,
          entityId,
          identity,
          subscribe: bridge.subscribe,
        })
        return {
          identity,
          initial: accepted,
          transport: createPullTransport({
            source,
            initial: accepted,
            classify: compareEntityVersionVectors,
          }),
        }
      },
      onEvent: telemetry.onEvent,
      onExpired: telemetry.onExpired,
    })
  }

  function createInlineController(
    firstIdentity: ReturnType<typeof mintCombatSessionIdentity>,
    prefetch: Promise<CombatAccepted | null>
  ): InlineController {
    const bridge = inlineBridge.current ?? createInvalidationBridge()
    inlineBridge.current = bridge
    const telemetry = createControllerTelemetry("session")
    let pending: {
      identity: typeof firstIdentity
      shared: Promise<CombatAccepted | null>
    } | null = { identity: firstIdentity, shared: prefetch }

    return createManagedReplica({
      mutations: combatInlineMutations,
      bootstrap: async () => {
        let identity: typeof firstIdentity
        let accepted
        if (pending) {
          identity = pending.identity
          const batch = await pending.shared
          pending = null
          accepted = batch?.inline ?? null
        } else {
          identity = mintCombatSessionIdentity(encounterId)
          const result = await loadCombatAcceptedAction({
            encounterId,
            inline: identity,
          })
          accepted = result.ok ? (result.value.inline ?? null) : null
        }
        if (!accepted) return null
        telemetry.bootstrapped(accepted.through)
        const source = createCombatInlineSource({
          encounterId,
          identity,
          subscribe: bridge.subscribe,
        })
        return {
          identity,
          initial: accepted,
          transport: createPullTransport({
            source,
            initial: accepted,
            classify: classifyScalarCursor,
          }),
        }
      },
      onEvent: telemetry.onEvent,
      onExpired: telemetry.onExpired,
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
    const shared: Promise<CombatAccepted | null> = loadCombatAcceptedAction({
      encounterId,
      ...(inlineIdentity ? { inline: inlineIdentity } : {}),
      durable: durableRequests.map(({ entityId, identity }) => ({
        entityId,
        identity,
      })),
    })
      .then((result) => (result.ok ? result.value : null))
      .catch(() => null)

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

  return {
    handleOf,
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
