"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useContext,
  useOptimistic,
  useRef,
  useTransition,
  type RefObject,
} from "react"
import { toast } from "sonner"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { Result } from "@workspace/game/foundation"

import { applyEntityWriteAction } from "@/lib/actions/entity/apply-entity-write"
import type { ApplyEntityWriteError } from "@/lib/actions/entity/apply-entity-write.schema"
import type { EntityCommit } from "@/lib/actions/entity/entity-row-store"
import { getEntityClassVersionAction } from "@/lib/actions/entity/versions"
import type { CharacterProfile, LoadedCharacter } from "@/lib/character/load"
import type { VersionClass } from "@/lib/db/version-classes"
import { mergeComponentPatch } from "@/lib/entity/commit/merge-patch"
import type { EntityWrite } from "@/lib/entity/commit/write.schema"
import { applyEntityWrite, ENTITY_WRITERS } from "@/lib/entity/commit/writers"
import { resolveEntity } from "@/lib/game-engine-v2"

import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"
import { useMonotonicVersionRef } from "./use-monotonic-version-ref"
import {
  createWriteQueue,
  runVersionedWrite,
  type WriteQueueTokenPort,
} from "./write-queue"

/**
 * The character surfaces' write provider (ADR §2.4/CH18; UNN-556) — the
 * durable-route sibling of `useCombatantWrite`. The builder mounts it today;
 * the S2 sheet shell reuses it. It owns the three things every entity-backed
 * surface needs:
 *
 * - **The optimistic frame** — one reducer-form `useOptimistic` holding
 *   `{ entity, resolved }`. A dispatch applies the *same pure Writer* the
 *   server commits with ({@link applyEntityWrite}), merges the patch, and
 *   re-runs `resolveEntity` client-side, so **derived** values (a max under
 *   depletion, a skill preview) move in the same frame (the CH18 re-fold; the
 *   cheap-algebra shortcut is rejected). A Writer refusal returns the previous
 *   frame — no optimistic lie.
 * - **Per-class version tokens + write queues** (UNN-140/UNN-274; UNN-568):
 *   a write reads the token of *its Writer's* declared class and serializes on
 *   that class's spine — the shared `write-queue` core, so ortus writing
 *   `talents` (identity) and `virtues` (progression) in one sitting can never
 *   collide or misfile a token, and a genuine cross-writer `"stale"` (the DM
 *   console writing this PC's vitals mid-combat) **silently one-shot-retries**
 *   with a refetched class token ({@link getEntityClassVersionAction}) — the
 *   same policy the console's durable lanes run, decided once in the core. A
 *   stale that survives the retry is a real conflict: toast +
 *   `router.refresh()`.
 * - **The door** — every write goes to `applyEntityWriteAction` (the entity
 *   door). Column actions (name, portrait — the app-column species) stay
 *   classic per-field leaves via {@link useEntityColumnSave}.
 *
 * Widget blindness: components receive {@link useEntityWrite}'s `dispatch` /
 * {@link useEntityAutoSave} from this provider and never import the Server
 * Action.
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
type ClassWriteRun = <
  TSuccess extends { version: number },
  TError extends string,
>(
  versionClass: VersionClass,
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
) => Promise<Result<TSuccess, TError>>

interface EntityWriteApi {
  entityId: string
  versionRefs: Record<VersionClass, RefObject<number>>
  queueRefs: Record<VersionClass, RefObject<Promise<void>>>
  applyLocal: (write: EntityWrite) => void
  /** Serialized dispatch on the class's spine + one-shot stale-retry — the
   *  click-write path. */
  enqueue: ClassWriteRun
  /** One retrying protocol pass with NO enqueue — for callers already chained
   *  on the class spine (the debounced auto-save runs inside its own queued
   *  step; enqueueing from there would wait on itself). */
  runVersioned: ClassWriteRun
}

const EntityFrameContext = createContext<LoadedFrame | null>(null)
const EntityWriteContext = createContext<EntityWriteApi | null>(null)

export function EntityWriteProvider({
  loaded,
  children,
}: {
  loaded: LoadedCharacter
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

  const runVersioned: ClassWriteRun = (versionClass, action) =>
    runVersionedWrite(tokenFor(versionClass), refetchFor(versionClass), action)

  const [frame, applyLocal] = useOptimistic(
    { entity: loaded.entity, resolved: loaded.resolved },
    (prev: EntityFrame, write: EntityWrite): EntityFrame => {
      const predicted = applyEntityWrite(prev.entity.components, write)
      if (!predicted.ok) return prev
      const entity = mergeComponentPatch(prev.entity, predicted.value)
      return { entity, resolved: resolveEntity(entity) }
    }
  )

  const write: EntityWriteApi = {
    entityId: profile.id,
    versionRefs,
    queueRefs,
    applyLocal,
    enqueue,
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
  /** Runs on a successful commit — e.g. selecting a just-added Knife. */
  onSuccess?: (value: EntityCommit) => void
  /** First crack at a failure: return `true` to suppress the default toast. */
  onError?: (error: ApplyEntityWriteError | "stale") => boolean
  /** Toast copy overrides. */
  messages?: { stale?: string; error?: string }
}

/**
 * The click-write primitive: optimistic frame + descriptor dispatch through
 * the entity door, serialized on the Writer's class queue with the shared
 * one-shot stale-retry (UNN-568). A `"stale"` that reaches the failure branch
 * survived the retry — a real conflict, so it toasts and refreshes. Each
 * consumer gets its own `pending` (local `useTransition` — no global lock).
 */
export function useEntityWrite() {
  const { entityId, applyLocal, enqueue } = useWriteApi("useEntityWrite")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function dispatch(write: EntityWrite, opts?: EntityDispatchOptions) {
    const durableClass = ENTITY_WRITERS[write.component].durableClass

    startTransition(async () => {
      applyLocal(write)

      const result = await enqueue(durableClass, (expectedVersion) =>
        applyEntityWriteAction({ entityId, expectedVersion, write })
      )
      if (result.ok) {
        opts?.onSuccess?.(result.value)
        return
      }
      if (opts?.onError?.(result.error)) return
      toast.error(
        result.error === "stale"
          ? (opts?.messages?.stale ??
              "This character changed elsewhere — refreshing.")
          : (opts?.messages?.error ?? "Couldn't save. Try again.")
      )
      if (result.error === "stale") router.refresh()
    })
  }

  return { pending, dispatch }
}

/**
 * Debounced descriptor auto-save for free-text component fields (narrative
 * prose): the `useDebouncedAutoSave` lifecycle over the entity door, with the
 * token + queue resolved from the Writer's class. The leaf owns the draft
 * display, so no optimistic frame ride-along — the route revalidation catches
 * the base up.
 */
export function useEntityAutoSave(
  args: Omit<
    UseDebouncedAutoSaveArgs<string, ApplyEntityWriteError>,
    "saveQueueRef" | "dispatchWrite" | "save"
  > & {
    /** Builds the descriptor persisting `value` — e.g.
     *  `(value) => ({ component: "narrative", op: "setField", field, value })`. */
    makeWrite: (value: string) => EntityWrite
  }
): UseDebouncedAutoSaveReturn<string> {
  const { entityId, queueRefs } = useWriteApi("useEntityAutoSave")
  const dispatchWithRetry = useRetryingDispatch("useEntityAutoSave")
  const { makeWrite, ...rest } = args

  const durableClass =
    ENTITY_WRITERS[makeWrite(rest.serverValue).component].durableClass

  return useDebouncedAutoSave<string, ApplyEntityWriteError>({
    ...rest,
    saveQueueRef: queueRefs[durableClass],
    save: async (value, expectedVersion) => {
      const result = await applyEntityWriteAction({
        entityId,
        expectedVersion,
        write: makeWrite(value),
      })
      return result.ok
        ? { ok: true, value: { value, version: result.value.version } }
        : result
    },
    dispatchWrite: (action) => dispatchWithRetry(durableClass, action),
  })
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
 * The identity token + entity id for the one-shot lifecycle actions that
 * bypass the queue by design (finalize's button, the builder-step footer) —
 * they read the freshest identity token and bump it on success.
 */
export function useEntityIdentityToken() {
  const { entityId, versionRefs } = useWriteApi("useEntityIdentityToken")
  const versionRef = versionRefs.identity
  return {
    entityId,
    read: () => versionRef.current,
    bump: (version: number) => {
      versionRef.current = version
    },
  }
}
