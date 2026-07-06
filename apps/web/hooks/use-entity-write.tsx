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

import { applyEntityWriteAction } from "@/lib/actions/entity/apply-entity-write"
import type { ApplyEntityWriteError } from "@/lib/actions/entity/apply-entity-write.schema"
import type { EntityCommit } from "@/lib/actions/entity/entity-row-store"
import type { CharacterProfile, LoadedCharacter } from "@/lib/character/load"
import type { VersionClass } from "@/lib/db/version-classes"
import { mergeComponentPatch } from "@/lib/entity/commit/merge-patch"
import type { EntityWrite } from "@/lib/entity/commit/write.schema"
import {
  applyEntityWrite,
  ENTITY_WRITERS,
  type WriterDeps,
} from "@/lib/entity/commit/writers"
import { resolveEntity } from "@/lib/game-engine-v2"

import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"
import { useMonotonicVersionRef } from "./use-monotonic-version-ref"

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
 * - **Per-class version tokens + save queues** (UNN-140/UNN-274, generalized
 *   from the builder's single identity lane): a write reads the token of *its
 *   Writer's* declared class and serializes on that class's queue, so ortus
 *   writing `talents` (identity) and `virtues` (progression) in one sitting
 *   can never collide or misfile a token.
 * - **The door** — every write goes to `applyEntityWriteAction` (the entity
 *   door). Stale handling is the ADR's simple model: toast + `router.refresh()`
 *   (v1's silent multi-tab retry was dropped with its broadcast pipeline; the
 *   per-class queues remove the dominant same-tab stale source).
 *
 * Widget blindness: components receive {@link useEntityWrite}'s `dispatch` /
 * {@link useEntityAutoSave} from this provider and never import the Server
 * Action. Column actions (name, portrait — the app-column species) stay
 * classic per-field leaves via {@link useEntityColumnSave}.
 */

interface EntityFrame {
  entity: Entity
  resolved: ResolvedEntity
}

interface LoadedFrame extends EntityFrame {
  profile: CharacterProfile
}

/** Resolved values the Writers' validations need, derived from the client's
 *  own view. Only Prisma's cap today — unresolved until its upgrade tree
 *  ships, so it stays absent (parity with the server's `serverDeps`). */
function clientDeps(): WriterDeps {
  return {}
}

interface EntityWriteApi {
  entityId: string
  versionRefs: Record<VersionClass, RefObject<number>>
  queueRefs: Record<VersionClass, RefObject<Promise<void>>>
  applyLocal: (write: EntityWrite) => void
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

  const [frame, applyLocal] = useOptimistic(
    { entity: loaded.entity, resolved: loaded.resolved },
    (prev: EntityFrame, write: EntityWrite): EntityFrame => {
      const predicted = applyEntityWrite(
        prev.entity.components,
        write,
        clientDeps()
      )
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
 * the entity door, serialized on the Writer's class queue. Each consumer gets
 * its own `pending` (local `useTransition` — no global lock).
 */
export function useEntityWrite() {
  const { entityId, versionRefs, queueRefs, applyLocal } =
    useWriteApi("useEntityWrite")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function dispatch(write: EntityWrite, opts?: EntityDispatchOptions) {
    const durableClass = ENTITY_WRITERS[write.component].durableClass
    const versionRef = versionRefs[durableClass]
    const queueRef = queueRefs[durableClass]

    startTransition(async () => {
      applyLocal(write)

      const queued = queueRef.current.then(async () => {
        const result = await applyEntityWriteAction({
          entityId,
          expectedVersion: versionRef.current,
          write,
        })
        if (result.ok) {
          versionRef.current = result.value.version
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
      queueRef.current = queued.catch(() => {})
      await queued
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
  const { entityId, versionRefs, queueRefs } = useWriteApi("useEntityAutoSave")
  const { makeWrite, ...rest } = args

  const durableClass =
    ENTITY_WRITERS[makeWrite(rest.serverValue).component].durableClass
  const versionRef = versionRefs[durableClass]

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
    dispatchWrite: async (action) => {
      const result = await action(versionRef.current)
      if (result.ok) versionRef.current = result.value.version
      return result
    },
  })
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
  const { entityId, versionRefs, queueRefs } = useWriteApi(
    "useEntityColumnSave"
  )
  const { save, ...rest } = args
  const versionRef = versionRefs.identity

  return useDebouncedAutoSave<TValue, TError>({
    ...rest,
    saveQueueRef: queueRefs.identity,
    save: (value, expectedVersion) =>
      save(value, { entityId, expectedVersion }),
    dispatchWrite: async (action) => {
      const result = await action(versionRef.current)
      if (result.ok) versionRef.current = result.value.version
      return result
    },
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
