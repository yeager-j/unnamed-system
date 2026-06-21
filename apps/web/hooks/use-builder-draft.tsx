"use client"

import {
  createContext,
  useContext,
  useRef,
  useTransition,
  type RefObject,
} from "react"
import { toast } from "sonner"

import { type Result } from "@workspace/game/foundation"

import type { BuilderCharacter } from "@/app/builder/[shortId]/_loader"
import type { EditSurface } from "@/lib/db/version-classes"

import { dispatchCharacterWriteWithRetry } from "./dispatch-character-write"
import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"
import { useMonotonicVersionRef } from "./use-monotonic-version-ref"

/**
 * The builder's draft context — the creation-time analogue of the sheet's
 * {@link import("./use-character").CharacterProvider}. It mirrors the sheet's
 * two-context split so every movement reads the draft (and its version token)
 * from context instead of having 15+ fields prop-drilled from the route page
 * (CLAUDE.md: "Avoid prop-drilling").
 *
 * It deliberately does *not* reuse `CharacterProvider`: the builder loads a
 * raw, incomplete {@link BuilderCharacter} row — not a derived
 * `HydratedCharacter` — and its writes have no optimistic `reduceCharacter`
 * frame, so coupling creation to the live-sheet reducer would be wrong.
 * Instead it reuses the low-level primitives the builder already depends on
 * ({@link dispatchCharacterWriteWithRetry}, {@link useMonotonicVersionRef}).
 *
 * Every builder edit surface maps to the `identity` version class, so the
 * provider holds a single identity version ref rather than the sheet's four.
 */

const BuilderDraftContext = createContext<BuilderCharacter | null>(null)

/**
 * The write surface: the owning character id, the identity version ref
 * (UNN-140), and the identity save queue (UNN-274). Lives in its own context
 * so write-only consumers ({@link useBuilderWrite}) don't re-render when the
 * draft changes.
 */
interface BuilderWrite {
  characterId: string
  versionRef: RefObject<number>
  /**
   * The identity-class save queue (UNN-274): a single promise chain so the
   * builder's same-class debounced fields serialize their saves and each reads
   * the freshly-bumped {@link versionRef} token instead of colliding at the
   * stale pre-bump version. Threaded into {@link useDebouncedAutoSave} by
   * {@link useBuilderAutoSave}.
   */
  saveQueueRef: RefObject<Promise<void>>
}

const BuilderWriteContext = createContext<BuilderWrite | null>(null)

export function BuilderDraftProvider({
  character,
  children,
}: {
  character: BuilderCharacter
  children: React.ReactNode
}) {
  const versionRef = useMonotonicVersionRef(character.identityVersion)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  // No manual `useMemo` — React Compiler (UNN-241) memoizes this inline value
  // on its stable inputs (`character.id` + the stable refs), so the write
  // context stays referentially stable across draft-only changes and
  // write-only consumers don't re-render.
  const write: BuilderWrite = {
    characterId: character.id,
    versionRef,
    saveQueueRef,
  }

  return (
    <BuilderWriteContext.Provider value={write}>
      <BuilderDraftContext.Provider value={character}>
        {children}
      </BuilderDraftContext.Provider>
    </BuilderWriteContext.Provider>
  )
}

/**
 * Reads the draft row from {@link BuilderDraftProvider}. Throws when called
 * outside a provider so a missing wrapper fails loudly.
 */
export function useBuilderDraft(): BuilderCharacter {
  const draft = useContext(BuilderDraftContext)
  if (!draft) {
    throw new Error(
      "useBuilderDraft must be used within a BuilderDraftProvider"
    )
  }
  return draft
}

/**
 * The builder's debounced auto-save primitive — the provider-bound wrapper
 * over {@link useDebouncedAutoSave}, mirroring how {@link useBuilderWrite}
 * wraps the shared click-write dispatch. It resolves the *shared* identity
 * version ref *and* save queue from {@link BuilderDraftProvider} (UNN-274) and
 * hands them to the core hook, so the builder's same-class fields both
 * coordinate on one token and serialize their saves — consumers never touch
 * either. Every builder surface is identity-class, so there's a single ref and
 * queue (no surface param). Pass the same args as {@link useDebouncedAutoSave}
 * minus `versionRef`/`saveQueueRef`.
 */
export function useBuilderAutoSave<TValue, TError extends string>(
  args: Omit<
    UseDebouncedAutoSaveArgs<TValue, TError>,
    "versionRef" | "saveQueueRef"
  >
): UseDebouncedAutoSaveReturn<TValue> {
  const ctx = useContext(BuilderWriteContext)
  if (!ctx) {
    throw new Error(
      "useBuilderAutoSave must be used within a BuilderDraftProvider"
    )
  }
  return useDebouncedAutoSave({
    ...args,
    versionRef: ctx.versionRef,
    saveQueueRef: ctx.saveQueueRef,
  })
}

interface BuilderWriteParams<
  TSuccess extends { version: number },
  TError extends string,
> {
  /**
   * The edit surface being written. Passed through to
   * {@link dispatchCharacterWriteWithRetry}, which resolves its per-write-class
   * version token (UNN-140) from the surface→class map shared with the server
   * wrappers (UNN-233). Every builder surface is `identity`-class.
   */
  surface: EditSurface
  /** The Server Action call, given the expected version. */
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  /**
   * Applied inside the transition before dispatch. The builder has no central
   * `reduceCharacter` frame, so leaves that show optimistic state pass their
   * own `useOptimistic` setter here (it must run within the transition).
   */
  optimistic?: () => void
  /** Runs on a successful write — e.g. selecting a just-created document. */
  onSuccess?: (value: TSuccess) => void
  /** Toast copy. Defaults cover the stale and generic cases. */
  messages?: { stale?: string; error?: string }
  /**
   * First crack at a failure: return `true` to suppress the default toast
   * (the caller handled it — e.g. a domain-specific message or an
   * intentionally ignored benign cross-tab race).
   */
  onError?: (error: TError | "stale") => boolean
}

/**
 * The builder's one write primitive — the creation-time analogue of
 * {@link import("./use-character").useCharacterWrite}. Bundles a *local*
 * `useTransition` (so each control keeps its own `pending` — no global lock),
 * then persists through the silent-retry + cross-tab-broadcast pipeline
 * against the identity version ref. Toasts on failure.
 *
 * It diverges from `useCharacterWrite` in two intentional ways: there is no
 * central optimistic `edit` (the builder has no `HydratedCharacter` reducer —
 * leaves own their local optimism via the {@link BuilderWriteParams.optimistic}
 * callback), and it exposes {@link BuilderWriteParams.onSuccess} for the
 * writer rail's "select the new document" follow-up.
 */
export function useBuilderWrite() {
  const ctx = useContext(BuilderWriteContext)
  if (!ctx) {
    throw new Error(
      "useBuilderWrite must be used within a BuilderDraftProvider"
    )
  }
  const { characterId, versionRef } = ctx
  const [pending, startTransition] = useTransition()

  function write<TSuccess extends { version: number }, TError extends string>({
    surface,
    action,
    optimistic,
    onSuccess,
    messages,
    onError,
  }: BuilderWriteParams<TSuccess, TError>) {
    startTransition(async () => {
      optimistic?.()
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        surface,
        versionRef,
        action,
      })
      if (result.ok) {
        onSuccess?.(result.value)
        return
      }
      if (onError?.(result.error)) return
      toast.error(
        result.error === "stale"
          ? (messages?.stale ?? "Couldn't sync — refresh to see the latest.")
          : (messages?.error ?? "Couldn't save. Try again.")
      )
    })
  }

  return { pending, write, characterId }
}
