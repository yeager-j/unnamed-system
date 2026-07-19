"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useTransition,
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
import { parsePlayerCharacterStatus } from "@/lib/realtime/character-lifecycle-ping"
import { useRealtimeChannel } from "@/lib/sync/use-realtime-channel"

import {
  setEntityColumn,
  writeEntity,
  type EntityColumnWrite,
  type EntityReplicaInvocation,
} from "./replica/mutations"
import type { EntityReplicaRejection } from "./replica/rejection"
import {
  useEntityReplica,
  type EntityMutationReceipt,
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
 * UNN-648 adds replayable app-column intent to the same replica root. The
 * only guarded writes left outside it are portrait upload and finalize:
 * their Blob/lifecycle meaning is non-replayable, so the provider settles
 * current replica writes, captures a fresh identity-version precondition,
 * and invokes each exactly once. Builder step is an unversioned subtype LWW
 * action and needs no identity serialization.
 *
 * The provider stays the single Ably subscriber (the cross-writer reconcile
 * channel, UNN-569). Writable owner mounts forward pings to the replica
 * transport, whose causal gate decides whether to accept the refetch. An
 * explicit PC-lifecycle ping also refreshes the owner's RSC layout because
 * subtype status is deliberately outside the replica projection. A read-only
 * mount has no replica and refreshes its RSC frame instead; that is its sole
 * cross-writer liveness path.
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

export type EntityIdentityActionError = "identity-precondition-unavailable"

type RunIdentityActionOnce = <TSuccess, TError>(
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
) => Promise<Result<TSuccess, TError | EntityIdentityActionError>>

interface EntityWriteApi {
  entityId: string
  /** The single replica mutation interface for component and column intent. */
  mutate: (invocation: EntityReplicaInvocation) => EntityMutationReceipt
  /** Lifecycle seam: settle replica writes, capture identity intent, run once. */
  runIdentityActionOnce: RunIdentityActionOnce
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

  const identityLifecycleRef = useRef<Promise<void>>(Promise.resolve())
  const { snapshot, mutate, settleMutations, notifyPing, notifyReconnect } =
    useEntityReplica({ entityId: profile.id, enabled: writable })

  const runIdentityActionOnce: RunIdentityActionOnce = (action) => {
    const run = identityLifecycleRef.current.then(async () => {
      const settled = await settleMutations()
      if (!settled.ok) return err("identity-precondition-unavailable" as const)

      const fresh = await getEntityClassVersionAction({
        entityId: profile.id,
        versionClass: "identity",
      })
      if (!fresh.ok) return err("identity-precondition-unavailable" as const)

      return action(fresh.value.version)
    })
    identityLifecycleRef.current = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  // The cross-writer reconcile channel (UNN-569 → UNN-649): every guarded
  // entity commit pings `character:{shortId}`. Owner mounts feed the replica
  // transport; its causal gate suppresses echoes and stale reads. A lifecycle
  // fact additionally refreshes the RSC layout because PC subtype status is
  // not part of the replica root.
  // Read-only mounts cannot bootstrap the strict-owner replica, so their RSC
  // frame refresh is the deliberately separate liveness arm. Inert without
  // ABLY_API_KEY, like every listener.
  const router = useRouter()
  useRealtimeChannel({
    domain: "character",
    shortId: profile.shortId,
    onPing: (data) => {
      if (!writable) {
        router.refresh()
        return
      }
      notifyPing()
      if (parsePlayerCharacterStatus(data)) router.refresh()
    },
    onReconnect: () => {
      if (writable) notifyReconnect()
      else router.refresh()
    },
  })

  // The replica projection re-folded through the mount's resolve context —
  // or the RSC frame until the bootstrap resolves (and on read-only mounts).
  const frame = useMemo((): LoadedFrame => {
    if (!snapshot) return loaded
    const entity: Entity = {
      ...loaded.entity,
      components: snapshot.value.components,
    }
    return {
      profile: { ...loaded.profile, ...snapshot.value.columns },
      entity,
      resolved: resolveEntity(entity, resolveContext),
    }
  }, [snapshot, loaded, resolveContext])

  const write: EntityWriteApi = {
    entityId: profile.id,
    mutate,
    runIdentityActionOnce,
  }

  return (
    <EntityWriteContext.Provider value={write}>
      <EntityFrameContext.Provider value={frame}>
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
function useEntityMutationDispatch(caller: string) {
  const { mutate } = useWriteApi(caller)
  const [pending, startTransition] = useTransition()

  function dispatch(
    invocation: EntityReplicaInvocation,
    opts?: EntityDispatchOptions
  ) {
    const receipt = mutate(invocation)

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

export function useEntityWrite() {
  const mutation = useEntityMutationDispatch("useEntityWrite")
  return {
    pending: mutation.pending,
    dispatch: (write: EntityWrite, opts?: EntityDispatchOptions) =>
      mutation.dispatch(writeEntity(write), opts),
  }
}

/** Click-write interface for replayable app columns such as portrait removal. */
export function useEntityColumnWrite() {
  const mutation = useEntityMutationDispatch("useEntityColumnWrite")
  return {
    pending: mutation.pending,
    dispatch: (write: EntityColumnWrite, opts?: EntityDispatchOptions) =>
      mutation.dispatch(setEntityColumn(write), opts),
  }
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
 * 0). The leaf owns the draft
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
      const receipt = mutate(writeEntity(makeWrite(value)))
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
    case "unavailable":
      // A controller whose bootstrap terminally failed never mounted a
      // replica; to an auto-saving leaf that is the same "this surface can no
      // longer save" story `disposed` already tells.
      return "disposed"
  }
}

/**
 * Debounced app-column auto-save through `entity.setColumn` (UNN-648). The
 * leaf names only its typed desired-value intent; the replica owns ordering,
 * delivery, rebase, and cross-column serialization.
 */
export function useEntityColumnSave<TValue>(
  args: Omit<
    UseDebouncedAutoSaveArgs<TValue, EntityAutoSaveError>,
    "saveQueueRef" | "dispatchWrite" | "save"
  > & {
    makeWrite: (value: TValue) => EntityColumnWrite
  }
): UseDebouncedAutoSaveReturn<TValue> {
  const { mutate } = useWriteApi("useEntityColumnSave")
  const { makeWrite, ...rest } = args

  return useDebouncedAutoSave<TValue, EntityAutoSaveError>({
    ...rest,
    save: async (value) => {
      const receipt = mutate(setEntityColumn(makeWrite(value)))
      const local = await receipt.local
      if (!local.ok) return err(autoSaveError(local.error))
      const remote = await receipt.remote
      if (!remote.ok) return err(autoSaveError(remote.error))
      return ok({ value, version: 0 })
    },
    dispatchWrite: (action) => action(0),
  })
}

/**
 * Single-attempt lifecycle interface (UNN-648). Each action waits for current
 * replica intent, captures a fresh identity version as its typed precondition,
 * and runs exactly once. A later external bump may still return a legitimate
 * `stale`; this seam never silently replays lifecycle meaning on a newer base.
 */
export function useEntityIdentityAction() {
  const { entityId, runIdentityActionOnce } = useWriteApi(
    "useEntityIdentityAction"
  )
  return { entityId, runOnce: runIdentityActionOnce }
}
