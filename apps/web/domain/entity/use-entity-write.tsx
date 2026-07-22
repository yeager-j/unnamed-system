"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { toast } from "sonner"

import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import type { Canon, MutationErrorOf } from "@workspace/headcanon"
import type { MutationReceipt } from "@workspace/headcanon/react"
import { err, ok, type Result } from "@workspace/result"

import type { CharacterProfile } from "@/domain/character/load"
import type { IdentityWrite } from "@/domain/entity/commit/identity.schema"
import {
  entityFinalize,
  entityIdentity,
  entityWrite,
  type EntityCanonValue,
  type EntityMutationError,
} from "@/domain/entity/commit/protocol"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { resolveEntity } from "@/domain/game-engine-v2"

import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"
import { useEntityPredictions } from "./use-entity-predictions"

/**
 * The character surfaces' write provider — since P2d (UNN-676) a thin domain
 * binding over the Headcanon predicted root. The package owns what four
 * hundred lines of this file used to hand-coordinate: the optimistic replay
 * frame, one ordered delivery queue, durable mutation identity and ambiguous
 * retry, accepted-vector canonization, refresh coalescing and stall detection,
 * and axis invalidations. What remains here is domain knowledge only:
 *
 * - **The read frame** — {@link useLoadedCharacter} serves the predicted
 *   `{ entity, resolved }` plus the app profile, with the identity columns
 *   sourced from the predicted value (the canon's `identity` slice is the one
 *   authority; `profile` contributes only the unversioned subtype facts).
 * - **Typed dispatch** — {@link useEntityWrite} / {@link useIdentityWrite}
 *   build invocations and map lifecycle outcomes onto the app's toast and
 *   callback vocabulary. A predictor refusal returns synchronously and sends
 *   nothing; an authority rejection rolls the prediction back.
 * - **Autosave UX** — {@link useEntityAutoSave} / {@link useEntityColumnSave}
 *   keep the debounced draft lifecycle and flush one `mutate` per settled
 *   edit; the debounce lives before the protocol, never inside it.
 * - **Honest degradation** — uncertain delivery and refresh stalls surface as
 *   persistent toasts with retry affordances ({@link useEntityWriteStatus}
 *   exposes the same facts to any surface that wants richer treatment).
 *
 * There are no version refs, class queues, token refetches, or realtime
 * comparisons left in this binding — that machinery is what the P2d cutover
 * deleted (the contraction gate).
 */

interface LoadedFrame {
  profile: CharacterProfile
  entity: Entity
  resolved: ResolvedEntity
}

interface EntityWriteApi {
  entityId: string
  root: ReturnType<typeof useEntityPredictions>
}

const EntityFrameContext = createContext<LoadedFrame | null>(null)
const EntityWriteContext = createContext<EntityWriteApi | null>(null)

const DELIVERY_TOAST_ID = "entity-delivery-uncertain"
const FRESHNESS_TOAST_ID = "entity-refresh-stalled"

/** Surfaces the root's degraded states as persistent, actionable toasts. */
function useStatusToasts(root: ReturnType<typeof useEntityPredictions>): void {
  const { status, conflicts, retryDelivery, retryRefresh } = root

  useEffect(() => {
    if (status.delivery === "uncertain") {
      toast.error("Connection lost mid-save — your change is kept.", {
        id: DELIVERY_TOAST_ID,
        duration: Infinity,
        action: { label: "Retry", onClick: retryDelivery },
      })
    } else {
      toast.dismiss(DELIVERY_TOAST_ID)
    }
  }, [status.delivery, retryDelivery])

  useEffect(() => {
    if (status.freshness === "stalled") {
      toast.error("Couldn't confirm your latest changes.", {
        id: FRESHNESS_TOAST_ID,
        duration: Infinity,
        action: { label: "Refresh", onClick: retryRefresh },
      })
    } else {
      toast.dismiss(FRESHNESS_TOAST_ID)
    }
  }, [status.freshness, retryRefresh])

  const surfacedConflicts = useRef(0)
  useEffect(() => {
    if (conflicts.length > surfacedConflicts.current) {
      surfacedConflicts.current = conflicts.length
      toast.error(
        "A pending change was rolled back — this character changed elsewhere."
      )
    }
  }, [conflicts])
}

export function EntityWriteProvider({
  profile,
  canon,
  resolveContext,
  children,
}: {
  profile: CharacterProfile
  canon: Canon<EntityCanonValue>
  /** The encounter context to re-fold derived values with. Omitted on the
   *  character routes (the canon's own partyless resolve renders); the watch's
   *  own-sheet column passes its combatant's zone effects + party composition
   *  (UNN-566), re-derived here from the predicted entity — a pure projection,
   *  never a second store. */
  resolveContext?: ResolveContext
  children: React.ReactNode
}) {
  const predicted = useEntityPredictions({ canon })
  const { entity, resolved: canonResolved, identity } = predicted.value

  const resolved = useMemo(
    () =>
      resolveContext ? resolveEntity(entity, resolveContext) : canonResolved,
    [canonResolved, entity, resolveContext]
  )
  const frame = useMemo(
    () => ({ profile: { ...profile, ...identity }, entity, resolved }),
    [entity, identity, profile, resolved]
  )

  useStatusToasts(predicted)

  return (
    <EntityWriteContext.Provider
      value={{ entityId: profile.id, root: predicted }}
    >
      <EntityFrameContext.Provider value={frame}>
        {children}
      </EntityFrameContext.Provider>
    </EntityWriteContext.Provider>
  )
}

/**
 * The one read path: the app profile plus the **predicted** entity/resolved
 * frame. Surfaces read authored choices off `entity.components`, derived
 * read-units off `resolved`, and app-owned facts off `profile` — whose
 * identity columns (name, pronouns, portrait, notes) come from the predicted
 * canon value, so an in-flight rename is already visible everywhere.
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

/** The root's lifecycle facts, for surfaces that want more than the default
 *  toasts: pending/delivery/freshness/invalidation status, jossed-prediction
 *  conflicts, and the retry controls. */
export function useEntityWriteStatus() {
  const { root } = useWriteApi("useEntityWriteStatus")
  return {
    status: root.status,
    conflicts: root.conflicts,
    retryDelivery: root.retryDelivery,
    retryRefresh: root.retryRefresh,
  }
}

export interface EntityDispatchOptions {
  /** Runs when the authority accepts the mutation. */
  onSuccess?: () => void
  /** First crack at a refusal or rejection: return `true` to suppress the
   *  default toast. */
  onError?: (error: EntityMutationError) => boolean
  /** Toast copy override. */
  messages?: { error?: string }
}

type EntityMutationResult<Error extends EntityMutationError> = Result<
  MutationReceipt<Error>,
  Error
>

/**
 * The shared dispatch spine of both click-write hooks: run `mutate`, surface a
 * synchronous predictor refusal, then map the acceptance outcome onto the
 * caller's options. Cancelled delivery (a navigation signal) and unmount are
 * deliberately silent — there is nothing actionable to toast.
 */
function useProtocolDispatch(caller: string) {
  const { entityId, root } = useWriteApi(caller)
  const [inflight, setInflight] = useState(0)

  function dispatchMutation<Error extends EntityMutationError>(
    result: EntityMutationResult<Error>,
    refusalMessage: string,
    opts?: EntityDispatchOptions
  ): void {
    const surface = (error: EntityMutationError, fallback: string) => {
      if (opts?.onError?.(error)) return
      toast.error(opts?.messages?.error ?? fallback)
    }

    if (!result.ok) {
      surface(result.error, refusalMessage)
      return
    }

    setInflight((count) => count + 1)
    void result.value.accepted.then((accepted) => {
      setInflight((count) => count - 1)
      if (accepted.ok) {
        opts?.onSuccess?.()
        return
      }
      const failure = accepted.error
      if (failure.kind !== "domain" && failure.kind !== "replay-refused") return
      surface(failure.error, "Couldn't save. Try again.")
    })
  }

  return { entityId, root, pending: inflight > 0, dispatchMutation }
}

/**
 * The click-write primitive for engine-component descriptors: predict
 * immediately through the registered `entity.write` mutation, deliver in root
 * order, roll back on rejection. Each consumer gets its own `pending`.
 */
export function useEntityWrite() {
  const { entityId, root, pending, dispatchMutation } =
    useProtocolDispatch("useEntityWrite")

  function dispatch(write: EntityWrite, opts?: EntityDispatchOptions) {
    dispatchMutation(
      root.mutate(entityWrite({ entityId, write })),
      "That change can't apply to this character. Reload and try again.",
      opts
    )
  }

  return { pending, dispatch }
}

/**
 * The click-write primitive for the app-owned identity columns (portrait
 * commit/removal today): the registered `entity.identity` mutation, predicted
 * per field. Debounced text fields use {@link useEntityColumnSave} instead.
 */
export function useIdentityWrite() {
  const { entityId, root, pending, dispatchMutation } =
    useProtocolDispatch("useIdentityWrite")

  function dispatch(write: IdentityWrite, opts?: EntityDispatchOptions) {
    dispatchMutation(
      root.mutate(entityIdentity({ entityId, write })),
      "Couldn't save. Try again.",
      opts
    )
  }

  return { pending, dispatch }
}

/** The builder's terminal lifecycle command. It shares the root queue with
 * identity autosaves, so finalize cannot race a pending rename, and its
 * authority-side status flip is receipt-backed with the identity-axis bump. */
export function useFinalizeEntity() {
  const { entityId, root, pending, dispatchMutation } =
    useProtocolDispatch("useFinalizeEntity")

  function dispatch(opts?: EntityDispatchOptions) {
    dispatchMutation(
      root.mutate(entityFinalize({ entityId })),
      "This character isn't ready to finalize.",
      opts
    )
  }

  return { pending, dispatch }
}

/** The autosave settle vocabulary: the protocol's typed failures plus the
 *  app-local `"save-interrupted"` — a cancelled navigation or an unmount whose
 *  delivery outcome is unproven. Transient; the next edit retries. */
type EntityAutoSaveDomainError =
  | MutationErrorOf<typeof entityWrite>
  | MutationErrorOf<typeof entityIdentity>

export type EntityAutoSaveError = EntityAutoSaveDomainError | "save-interrupted"

/**
 * Settles one autosave-issued mutation into the debounced hook's Result
 * vocabulary. Acceptance (even one learned during unmount) confirms the value;
 * a domain rejection reports typed; a cancelled or unproven delivery reports
 * `"save-interrupted"` because no receipt exists to say anything stronger.
 * (Authority contention never reaches here — the send adapter classifies it
 * retryable and the package redelivers.)
 */
async function settleAutoSave<TValue, Error extends EntityAutoSaveDomainError>(
  value: TValue,
  result: EntityMutationResult<Error>
): Promise<Result<{ value: TValue }, EntityAutoSaveError>> {
  if (!result.ok) return err(result.error)

  const accepted = await result.value.accepted
  if (accepted.ok) return ok({ value })

  const failure = accepted.error
  if (failure.kind === "domain" || failure.kind === "replay-refused") {
    return err(failure.error)
  }
  if (failure.kind === "root-unmounted" && failure.outcome === "accepted") {
    return ok({ value })
  }
  return err("save-interrupted")
}

/**
 * Debounced descriptor auto-save for free-text component fields (narrative
 * prose): the {@link useDebouncedAutoSave} draft lifecycle, flushing one
 * `entity.write` mutation per settled edit. The leaf owns the draft display;
 * route revalidation catches the base up.
 */
export function useEntityAutoSave(
  args: Omit<UseDebouncedAutoSaveArgs<string, EntityAutoSaveError>, "save"> & {
    /** Builds the descriptor persisting `value` — e.g.
     *  `(value) => ({ component: "narrative", op: "setField", field, value })`. */
    makeWrite: (value: string) => EntityWrite
  }
): UseDebouncedAutoSaveReturn<string> {
  const { entityId, root } = useWriteApi("useEntityAutoSave")
  const { makeWrite, ...rest } = args

  return useDebouncedAutoSave<string, EntityAutoSaveError>({
    ...rest,
    save: (value) =>
      settleAutoSave(
        value,
        root.mutate(entityWrite({ entityId, write: makeWrite(value) }))
      ),
  })
}

/**
 * Debounced **identity-column** auto-save (name, pronouns, notes): the same
 * draft lifecycle over the `entity.identity` mutation. Since P2d the leaf
 * supplies only the per-field descriptor — the Server Action, mutation
 * identity, and concurrency belong to the protocol.
 */
export function useEntityColumnSave<TValue>(
  args: Omit<UseDebouncedAutoSaveArgs<TValue, EntityAutoSaveError>, "save"> & {
    /** Builds the per-field descriptor persisting `value` — e.g.
     *  `(value) => ({ field: "name", value })`. */
    makeWrite: (value: TValue) => IdentityWrite
  }
): UseDebouncedAutoSaveReturn<TValue> {
  const { entityId, root } = useWriteApi("useEntityColumnSave")
  const { makeWrite, ...rest } = args

  return useDebouncedAutoSave<TValue, EntityAutoSaveError>({
    ...rest,
    save: (value) =>
      settleAutoSave(
        value,
        root.mutate(entityIdentity({ entityId, write: makeWrite(value) }))
      ),
  })
}
