"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import {
  createReplica,
  type MutationReceipt,
  type Replica,
  type ReplicaSnapshot,
} from "@workspace/replica"
import { err, type Result } from "@workspace/result"

import { loadEntityAcceptedAction } from "@/lib/actions/entity/replica/snapshot"
import { createEntityReplicaSource } from "@/lib/sync/entity-replica-source"

import type { EntityWrite } from "../commit/write.schema"
import { mintEntityClientIdentity } from "./identity"
import {
  entityReplicaMutations,
  writeEntity,
  type EntityComponents,
} from "./mutations"
import type { EntityReplicaRejection } from "./rejection"
import { createEntityReplicaTransport } from "./transport"

export type EntityReplicaSnapshot = ReplicaSnapshot<
  EntityComponents,
  EntityReplicaRejection
>

export type EntityWriteReceipt = MutationReceipt<EntityReplicaRejection, void>

type EntityReplica = Replica<
  EntityComponents,
  ReturnType<typeof writeEntity>,
  EntityReplicaRejection,
  void
>

interface RealtimeBridge {
  subscribe(events: { onPing(): void; onReconnect(): void }): () => void
  notifyPing(): void
  notifyReconnect(): void
}

/** Fans the provider's one realtime channel into the transport's seam — the
 *  provider stays the single Ably subscriber and forwards events here. */
function createRealtimeBridge(): RealtimeBridge {
  const handlers = new Set<{ onPing(): void; onReconnect(): void }>()
  return {
    subscribe(events) {
      handlers.add(events)
      return () => handlers.delete(events)
    },
    notifyPing() {
      for (const handler of [...handlers]) handler.onPing()
    },
    notifyReconnect() {
      for (const handler of [...handlers]) handler.onReconnect()
    },
  }
}

interface BufferedMutation {
  readonly write: EntityWrite
  readonly resolve: (receipt: EntityWriteReceipt) => void
}

export interface UseEntityReplicaArgs {
  readonly entityId: string
  /** False for read-only mounts (a non-owner viewing a public sheet): the
   *  snapshot read is strict-owner, so bootstrapping would only 403. */
  readonly enabled: boolean
}

export interface UseEntityReplicaReturn {
  /** Null until the bootstrap read resolves (and always for `enabled: false`)
   *  — render the RSC-loaded frame until then. */
  readonly snapshot: EntityReplicaSnapshot | null
  /** Predicts + delivers one entity write. Mutations dispatched before the
   *  bootstrap resolves are buffered in order and replayed through the
   *  replica — the receipt settles once the real one exists. */
  readonly mutate: (write: EntityWrite) => EntityWriteReceipt
  /** Forward the provider's realtime channel events into the transport. */
  readonly notifyPing: () => void
  readonly notifyReconnect: () => void
}

/**
 * Owns one entity replica's React lifecycle (UNN-645):
 *
 * - **Bootstrap before construction.** The replica is created only after
 *   `loadEntityAcceptedAction` resolves for a freshly minted identity — that
 *   read REGISTERS the client (the push door refuses unregistered
 *   identities) and returns the personalized `initial`, so registration
 *   provably precedes the first push. Until then `snapshot` is null and the
 *   provider renders the RSC frame; dispatches buffer.
 * - **Expiry rebuilds.** When the authority reports `unknown-client` the
 *   replica expires terminally; this hook toasts (when predictions were
 *   dropped), mints a fresh identity, and bootstraps a replacement. The
 *   `dropped` count comes from the replica's own `expired` event.
 * - **StrictMode-safe** by construction: creation happens in the effect, the
 *   cleanup disposes, and a replayed effect bootstraps a new identity — an
 *   abandoned identity's dedup row is reclaimed by the TTL sweep.
 */
export function useEntityReplica({
  entityId,
  enabled,
}: UseEntityReplicaArgs): UseEntityReplicaReturn {
  const [replica, setReplica] = useState<EntityReplica | null>(null)
  const [generation, setGeneration] = useState(0)
  const [bridge] = useState(createRealtimeBridge)
  const replicaRef = useRef<EntityReplica | null>(null)
  const bufferRef = useRef<BufferedMutation[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let instance: EntityReplica | null = null

    const drainBuffer = (target: EntityReplica): void => {
      const buffered = bufferRef.current
      bufferRef.current = []
      for (const entry of buffered)
        entry.resolve(target.mutate(writeEntity(entry.write)))
    }

    const identity = mintEntityClientIdentity(entityId)
    void loadEntityAcceptedAction({ entityId, ...identity }).then((result) => {
      if (!result.ok) return
      if (cancelled && bufferRef.current.length === 0) return
      const source = createEntityReplicaSource({
        entityId,
        identity,
        subscribe: bridge.subscribe,
      })
      const created = createReplica({
        identity,
        initial: result.value,
        mutations: entityReplicaMutations,
        transport: createEntityReplicaTransport({
          source,
          initial: result.value,
        }),
        onEvent: (event) => {
          if (event.kind !== "expired") return
          if (event.dropped > 0) {
            toast.error(
              "This tab's live session expired — unsaved changes were discarded. Reconnecting…"
            )
          }
          setGeneration((current) => current + 1)
        },
      })
      if (cancelled) {
        // Torn down mid-bootstrap with unmount saves in the buffer: flush
        // them through this short-lived replica (fire-and-forget, like the
        // classic path's unmount save), then let it go.
        drainBuffer(created)
        setTimeout(() => created.dispose(), 0)
        return
      }
      instance = created
      replicaRef.current = created
      drainBuffer(created)
      setReplica(created)
    })

    return () => {
      cancelled = true
      const teardown = instance
      setReplica((current) => (current === teardown ? null : current))
      // Deletion cleanups run PARENT-first: this provider-level cleanup runs
      // before a dirty field's `useDebouncedAutoSave` unmount flush, whose
      // fire-and-forget save must still find a live replica (Codex P1, PR
      // #386). Teardown therefore yields one macrotask — the same-commit
      // child cleanups land their mutations, the delivery microtasks
      // dispatch the Server Action POST, and only then does disposal abort
      // the already-sent wait. (The 2026-07-13 nested-root lesson: teardown
      // yields when the outer lifecycle can still invoke it.)
      setTimeout(() => {
        if (replicaRef.current === teardown) replicaRef.current = null
        teardown?.dispose()
      }, 0)
    }
  }, [entityId, enabled, generation, bridge])

  const snapshot = useSyncExternalStore(
    (onStoreChange) => (replica ? replica.subscribe(onStoreChange) : () => {}),
    () =>
      replica && !replica.getSnapshot().expired ? replica.getSnapshot() : null,
    () => null
  )

  function mutate(write: EntityWrite): EntityWriteReceipt {
    const current = replicaRef.current
    if (current) return current.mutate(writeEntity(write))
    if (!enabled) {
      const refused: Result<never, { kind: "disposed" }> = err({
        kind: "disposed",
      })
      return {
        id: null,
        local: Promise.resolve(refused),
        remote: Promise.resolve(refused),
      }
    }
    // Bootstrap window: hold the intent, replay in order once the replica
    // exists. The proxied receipt settles from the real one.
    let resolveReceipt!: (receipt: EntityWriteReceipt) => void
    const receiptPromise = new Promise<EntityWriteReceipt>((resolve) => {
      resolveReceipt = resolve
    })
    bufferRef.current.push({ write, resolve: resolveReceipt })
    return {
      id: null,
      local: receiptPromise.then((receipt) => receipt.local),
      remote: receiptPromise.then((receipt) => receipt.remote),
    }
  }

  return {
    snapshot,
    mutate,
    notifyPing: () => bridge.notifyPing(),
    notifyReconnect: () => bridge.notifyReconnect(),
  }
}
