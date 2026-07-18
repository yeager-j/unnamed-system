"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useTransition,
  type RefObject,
} from "react"
import { toast } from "sonner"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import type { MutationError } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { CharacterProfile, LoadedCharacter } from "@/domain/character/load"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { resolveEntity } from "@/domain/game-engine-v2"
import { getEntityClassVersionAction } from "@/lib/actions/entity/versions"
import type { VersionClass } from "@/lib/db/version-classes"
import {
  forwardPingedVersions,
  parseCharacterPing,
} from "@/lib/sync/character-version-sync"
import { useMonotonicVersionRef } from "@/lib/sync/use-monotonic-version-ref"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"
import {
  createWriteQueue,
  runVersionedWrite,
  type WriteQueueTokenPort,
} from "@/lib/sync/write-queue"

import type { EntityReplicaRejection } from "./replica/rejection"
import {
  useEntityReplica,
  type EntityWriteReceipt,
} from "./replica/use-entity-replica"
import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"

/**
 * The character surfaces' write provider (ADR §2.4/CH18; UNN-556 → UNN-645) —
 * the durable-route sibling of `useCombatantWrite`. As of UNN-645 the
 * component-write transport is the **predicted replica**
 * ({@link useEntityReplica}): the frame is the replica's projection —
 * accepted base + pending predictions, each applied by the *same pure
 * Writer* the server commits with and re-folded through `resolveEntity`
 * with the mount's `resolveContext` (the CH18 re-fold; the cheap-algebra
 * shortcut stays rejected). Call sites no longer know about version classes,
 * expected versions, queues, or stale retry — ordering, dedup, rebase, and
 * conflict surfacing are the replica protocol's. Before the replica's
 * bootstrap read resolves (and on read-only mounts) the frame is the
 * RSC-loaded one.
 *
 * Still on the classic guarded path in this increment (UNN-645 expand
 * phase): **column actions** (name, portrait, pronouns, notes — the
 * app-column species) and the **identity-queue lifecycle writes** (portrait
 * upload, finalize, builder step), which keep the identity-class token +
 * queue machinery below.
 *
 * The provider stays the single Ably subscriber (the cross-writer reconcile
 * channel, UNN-569): each ping is fanned into the replica transport (its
 * causal gate decides whether to accept the refetch) AND into the classic
 * forward-only token compare + `router.refresh()` — the RSC payload still
 * feeds the profile and every non-replica reader during the migration
 * window; the contract step deletes the refresh half when nothing reads it.
 *
 * Widget blindness: components receive {@link useEntityWrite}'s `dispatch` /
 * {@link useEntityAutoSave} from this provider and never import the Server
 * Action or the replica.
 */

interface EntityFrame {
  entity: Entity
  resolved: ResolvedEntity
}

interface LoadedFrame extends EntityFrame {
  profile: CharacterProfile
}

/** A guarded dispatch on one class's token: `action` receives the expected
 *  version, a success's `version` folds back into the token. */
type ClassWriteRun = <TSuccess extends { version: number }, TError>(
  versionClass: VersionClass,
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
) => Promise<Result<TSuccess, TError>>

type ClassWriteStep = <T>(
  versionClass: VersionClass,
  action: () => Promise<T>
) => Promise<T>

interface EntityWriteApi {
  entityId: string
  versionRefs: Record<VersionClass, RefObject<number>>
  queueRefs: Record<VersionClass, RefObject<Promise<void>>>
  /** The replica dispatch — every component write's transport (UNN-645). */
  mutate: (write: EntityWrite) => EntityWriteReceipt
  /** Serialized dispatch on the identity spine + one-shot stale-retry — the
   *  classic path the column/lifecycle writes still ride. */
  enqueue: ClassWriteRun
  /** Serialized dispatch with token accounting but no stale retry. */
  enqueueOnce: ClassWriteRun
  /** Serialized unversioned step for state outside the entity row. */
  enqueueStep: ClassWriteStep
  /** One retrying protocol pass with NO enqueue — for callers already chained
   *  on the class spine (the debounced auto-save runs inside its own queued
   *  step; enqueueing from there would wait on itself). */
  runVersioned: ClassWriteRun
}

const EntityFrameContext = createContext<LoadedFrame | null>(null)
const EntityWriteContext = createContext<EntityWriteApi | null>(null)

const INERT_RESOLVE_CONTEXT: ResolveContext = {}

export function EntityWriteProvider({
  loaded,
  resolveContext = INERT_RESOLVE_CONTEXT,
  writable = true,
  children,
}: {
  loaded: LoadedCharacter
  /** The encounter context `loaded.resolved` was folded with, re-applied on
   *  every optimistic re-fold. Inert off-encounter (the character routes) —
   *  the watch's own-sheet column passes its combatant's zone effects + party
   *  composition (UNN-566). */
  resolveContext?: ResolveContext
  /** False for non-owner mounts of the public routes (sheet/atlas viewers):
   *  the replica bootstrap is strict-owner, so a read-only mount skips it and
   *  renders the RSC frame; ping-driven `router.refresh()` remains its
   *  liveness. */
  writable?: boolean
  children: React.ReactNode
}) {
  const { profile } = loaded

  // One call per class at the top level — hooks inside an object literal trip
  // the React Compiler's transform (a hook-order crash at runtime).
  const identityVersionRef = useMonotonicVersionRef(profile.versions.identity)
  const vitalsVersionRef = useMonotonicVersionRef(profile.versions.vitals)
  const inventoryVersionRef = useMonotonicVersionRef(profile.versions.inventory)
  const progressionVersionRef = useMonotonicVersionRef(
    profile.versions.progression
  )
  const identityQueueRef = useRef<Promise<void>>(Promise.resolve())
  const vitalsQueueRef = useRef<Promise<void>>(Promise.resolve())
  const inventoryQueueRef = useRef<Promise<void>>(Promise.resolve())
  const progressionQueueRef = useRef<Promise<void>>(Promise.resolve())

  const versionRefs: Record<VersionClass, RefObject<number>> = {
    identity: identityVersionRef,
    vitals: vitalsVersionRef,
    inventory: inventoryVersionRef,
    progression: progressionVersionRef,
  }
  const queueRefs: Record<VersionClass, RefObject<Promise<void>>> = {
    identity: identityQueueRef,
    vitals: vitalsQueueRef,
    inventory: inventoryQueueRef,
    progression: progressionQueueRef,
  }

  // The token port + refetch for one class — assembled at event time inside
  // `enqueue`/`runVersioned` (never during render; the ref stays unread until
  // a dispatch). `bump` is forward-only: the monotonic invariant lives in the
  // port (write-queue's contract).
  function tokenFor(versionClass: VersionClass): WriteQueueTokenPort {
    const ref = versionRefs[versionClass]
    return {
      read: () => ref.current,
      bump: (version) => {
        if (version > ref.current) ref.current = version
      },
    }
  }
  function refetchFor(
    versionClass: VersionClass
  ): () => Promise<number | null> {
    return async () => {
      const fresh = await getEntityClassVersionAction({
        entityId: profile.id,
        versionClass,
      })
      return fresh.ok ? fresh.value.version : null
    }
  }

  const enqueue: ClassWriteRun = (versionClass, action) =>
    createWriteQueue({
      token: tokenFor(versionClass),
      refetchVersion: refetchFor(versionClass),
      chain: queueRefs[versionClass],
    }).enqueue(action)

  const enqueueOnce: ClassWriteRun = (versionClass, action) =>
    createWriteQueue({
      token: tokenFor(versionClass),
      chain: queueRefs[versionClass],
    }).enqueue(action)

  const enqueueStep: ClassWriteStep = (versionClass, action) =>
    createWriteQueue({
      token: tokenFor(versionClass),
      chain: queueRefs[versionClass],
    }).enqueueStep(action)

  const runVersioned: ClassWriteRun = (versionClass, action) =>
    runVersionedWrite(tokenFor(versionClass), refetchFor(versionClass), action)

  const { snapshot, mutate, notifyPing, notifyReconnect } = useEntityReplica({
    entityId: profile.id,
    enabled: writable,
  })

  // The cross-writer reconcile channel (UNN-569 → UNN-645): every guarded
  // entity commit pings `character:{shortId}` with its class's new version.
  // Each ping fans BOTH ways during the migration window: into the replica
  // transport (whose causal gate decides whether the refetch is fresh) and
  // into the classic forward-only token compare + `router.refresh()`, which
  // still feeds the profile and every non-replica reader. Echoes of this
  // tab's own writes are absorbed by the gate on one side and the monotonic
  // refs on the other. Inert without ABLY_API_KEY, like every listener.
  const router = useRouter()
  useRealtimeChannel({
    domain: "character",
    shortId: profile.shortId,
    onPing: (data) => {
      notifyPing()
      const versions = parseCharacterPing(data, "entity")
      if (versions && forwardPingedVersions(versionRefs, versions)) {
        router.refresh()
      }
    },
    onReconnect: () => {
      notifyReconnect()
      router.refresh()
    },
  })

  // The replica projection re-folded through the mount's resolve context —
  // or the RSC frame until the bootstrap resolves (and on read-only mounts).
  const frame = useMemo((): EntityFrame => {
    if (!snapshot) return { entity: loaded.entity, resolved: loaded.resolved }
    const entity: Entity = { ...loaded.entity, components: snapshot.value }
    return { entity, resolved: resolveEntity(entity, resolveContext) }
  }, [snapshot, loaded.entity, loaded.resolved, resolveContext])

  const write: EntityWriteApi = {
    entityId: profile.id,
    versionRefs,
    queueRefs,
    mutate,
    enqueue,
    enqueueOnce,
    enqueueStep,
    runVersioned,
  }

  return (
    <EntityWriteContext.Provider value={write}>
      <EntityFrameContext.Provider value={{ profile, ...frame }}>
        {children}
      </EntityFrameContext.Provider>
    </EntityWriteContext.Provider>
  )
}

/**
 * The one read path: the route's profile plus the **optimistic** entity/
 * resolved frame. Surfaces read authored choices off `entity.components` and
 * derived read-units off `resolved`.
 */
export function useLoadedCharacter(): LoadedFrame {
  const frame = useContext(EntityFrameContext)
  if (!frame) {
    throw new Error(
      "useLoadedCharacter must be used within an EntityWriteProvider"
    )
  }
  return frame
}

function useWriteApi(caller: string): EntityWriteApi {
  const api = useContext(EntityWriteContext)
  if (!api) {
    throw new Error(`${caller} must be used within an EntityWriteProvider`)
  }
  return api
}

export interface EntityDispatchOptions {
  /** Runs on a successful commit — e.g. selecting a just-added Knife. (No
   *  payload since UNN-645: no consumer read the commit, and the replica's
   *  accepted stream is the authority on post-write state.) */
  onSuccess?: () => void
  /** First crack at a failure: return `true` to suppress the default toast. */
  onError?: (error: EntityReplicaRejection) => boolean
  /** Toast copy overrides. */
  messages?: { error?: string }
}

/**
 * The click-write primitive (UNN-645): descriptor dispatch through the
 * replica. The prediction lands synchronously in the frame; `pending` tracks
 * the delivery to the authority's terminal outcome. A local Writer refusal
 * or a trusted remote rejection routes through `onError` → toast; there is
 * no `"stale"` arm anymore — concurrent writers are rebased by the replica,
 * and only a genuine replay refusal surfaces (as a `conflict` on the
 * snapshot plus the rejection here). Each consumer gets its own `pending`
 * (local `useTransition` — no global lock).
 */
export function useEntityWrite() {
  const { mutate } = useWriteApi("useEntityWrite")
  const [pending, startTransition] = useTransition()

  function dispatch(write: EntityWrite, opts?: EntityDispatchOptions) {
    const receipt = mutate(write)

    startTransition(async () => {
      const local = await receipt.local
      if (!local.ok) {
        if (local.error.kind === "refused") {
          if (opts?.onError?.(local.error.error)) return
          toast.error(
            opts?.messages?.error ??
              "That change can't apply to this character. Reload and try again."
          )
        } else if (local.error.kind === "invalid") {
          toast.error(opts?.messages?.error ?? "Couldn't save. Try again.")
        }
        // `disposed`/`expired`: the surface unmounted or the session-expiry
        // toast already fired — nothing useful to add here.
        return
      }

      const remote = await receipt.remote
      if (remote.ok) {
        opts?.onSuccess?.()
        return
      }
      if (remote.error.kind === "rejected") {
        if (opts?.onError?.(remote.error.error)) return
        toast.error(opts?.messages?.error ?? "Couldn't save. Try again.")
      }
    })
  }

  return { pending, dispatch }
}

/** The auto-save failure vocabulary over the replica: the door's rejections
 *  plus the two receipt-lifecycle strandings (both toast generically). */
export type EntityAutoSaveError =
  | EntityReplicaRejection
  | "expired"
  | "disposed"

/**
 * Debounced descriptor auto-save for free-text component fields (narrative
 * prose): the `useDebouncedAutoSave` lifecycle over the replica (UNN-645).
 * The hook keeps owning draft/debounce/flush; each save is one replica
 * mutation, so cross-field ordering and redelivery are the protocol's job —
 * the version token in the shared hook's signature is vestigial here (always
 * 0) until the classic column path migrates too. The leaf owns the draft
 * display, so no optimistic frame ride-along.
 */
export function useEntityAutoSave(
  args: Omit<
    UseDebouncedAutoSaveArgs<string, EntityAutoSaveError>,
    "saveQueueRef" | "dispatchWrite" | "save"
  > & {
    /** Builds the descriptor persisting `value` — e.g.
     *  `(value) => ({ component: "narrative", op: "setField", field, value })`. */
    makeWrite: (value: string) => EntityWrite
  }
): UseDebouncedAutoSaveReturn<string> {
  const { mutate } = useWriteApi("useEntityAutoSave")
  const { makeWrite, ...rest } = args

  return useDebouncedAutoSave<string, EntityAutoSaveError>({
    ...rest,
    save: async (value) => {
      const receipt = mutate(makeWrite(value))
      const local = await receipt.local
      if (!local.ok) return err(autoSaveError(local.error))
      const remote = await receipt.remote
      if (!remote.ok) return err(autoSaveError(remote.error))
      return ok({ value, version: 0 })
    },
    dispatchWrite: (action) => action(0),
  })
}

function autoSaveError(
  failure: MutationError<EntityReplicaRejection>
): EntityAutoSaveError {
  switch (failure.kind) {
    case "refused":
    case "rejected":
      return failure.error
    case "invalid":
      return "invalid-write"
    case "expired":
      return "expired"
    case "disposed":
      return "disposed"
  }
}

/**
 * The debounced wrappers' shared dispatch (UNN-568): one retrying protocol
 * pass on the class token — `runVersioned`, **never** `enqueue`, because the
 * debounced lifecycle already chained this call on the class spine
 * (`saveQueueRef`) and enqueueing from inside a chained step would wait on
 * itself. A stale that survives the retry triggers `router.refresh()` so the
 * provider re-renders with fresh server versions and the monotonic refs move
 * forward — without it, a cross-tab/external bump would strand this tab.
 * (The click-write path in {@link useEntityWrite} refreshes the same way.)
 */
function useRetryingDispatch(caller: string) {
  const { runVersioned } = useWriteApi(caller)
  const router = useRouter()
  return async function dispatchWithRetry<TValue, TError extends string>(
    versionClass: VersionClass,
    action: (
      expectedVersion: number
    ) => Promise<
      | { ok: true; value: { value: TValue; version: number } }
      | { ok: false; error: TError }
    >
  ) {
    const result = await runVersioned(versionClass, action)
    if (!result.ok && result.error === "stale") router.refresh()
    return result
  }
}

/**
 * Debounced **column** auto-save (the app-column species — name, pronouns):
 * same lifecycle, but the leaf supplies its own per-field Server Action and
 * the class is fixed to `identity`.
 */
export function useEntityColumnSave<TValue, TError extends string>(
  args: Omit<
    UseDebouncedAutoSaveArgs<TValue, TError>,
    "saveQueueRef" | "dispatchWrite" | "save"
  > & {
    save: (
      value: TValue,
      args: { entityId: string; expectedVersion: number }
    ) => Promise<
      | { ok: true; value: { value: TValue; version: number } }
      | { ok: false; error: TError }
    >
  }
): UseDebouncedAutoSaveReturn<TValue> {
  const { entityId, queueRefs } = useWriteApi("useEntityColumnSave")
  const dispatchWithRetry = useRetryingDispatch("useEntityColumnSave")
  const { save, ...rest } = args

  return useDebouncedAutoSave<TValue, TError>({
    ...rest,
    saveQueueRef: queueRefs.identity,
    save: (value, expectedVersion) =>
      save(value, { entityId, expectedVersion }),
    dispatchWrite: (action) => dispatchWithRetry("identity", action),
  })
}

/**
 * The identity-class queue for one-shot lifecycle and column actions. Callers
 * never read or bump the token themselves: guarded actions enqueue through the
 * retrying protocol, Blob upload uses the single-attempt arm, and subtype-only
 * writes serialize as unversioned steps on the same spine.
 */
export function useEntityIdentityQueue() {
  const { entityId, enqueue, enqueueOnce, enqueueStep } = useWriteApi(
    "useEntityIdentityQueue"
  )
  return {
    entityId,
    enqueue: <TSuccess extends { version: number }, TError>(
      action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
    ) => enqueue("identity", action),
    enqueueOnce: <TSuccess extends { version: number }, TError>(
      action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
    ) => enqueueOnce("identity", action),
    enqueueStep: <T,>(action: () => Promise<T>) =>
      enqueueStep("identity", action),
  }
}
