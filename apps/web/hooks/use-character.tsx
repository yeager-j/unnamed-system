"use client"

import {
  createContext,
  useContext,
  useMemo,
  useOptimistic,
  useRef,
  useTransition,
  type RefObject,
} from "react"
import { toast } from "sonner"

import {
  EDIT_SURFACE_CLASS,
  type EditSurface,
  type VersionClass,
} from "@/lib/db/version-classes"
import {
  reduceCharacter,
  type CharacterEdit,
  type HydratedCharacter,
} from "@/lib/game/character"
import type { Result } from "@/lib/result"

import { dispatchCharacterWriteWithRetry } from "./dispatch-character-write"
import { useCharacterTokenRef } from "./use-character-token-ref"
import { useCharacterVersionBroadcast } from "./use-character-versions-broadcast"
import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"

/**
 * The single client-side source of truth for the character sheet. The provider
 * holds one optimistic {@link HydratedCharacter} (UNN-237): every owner edit is
 * applied through the pure {@link reduceCharacter} — the same derivation the
 * server runs — so a stat-affecting edit re-derives every dependent value (the
 * header Attributes, Combat Affinities, skill affordability) in the same frame,
 * not just the slice that was touched.
 *
 * - {@link useCharacter} is the one read path: every display surface reads the
 *   optimistic character here instead of receiving it as a prop (CLAUDE.md:
 *   "Avoid prop-drilling. `HydratedCharacter` is supplied via `useCharacter()`").
 * - {@link useCharacterWrite} is the one write path: owner controls dispatch a
 *   {@link CharacterEdit} and the provider applies it optimistically + persists.
 *
 * On a read-only sheet nothing dispatches, so `useCharacter()` simply returns
 * the never-mutated server value.
 *
 * Also mounts the per-character `BroadcastChannel` listener (UNN-203) so a
 * sibling tab's successful write refreshes this tab.
 */

const CharacterContext = createContext<HydratedCharacter | null>(null)

/**
 * The write surface: the optimistic dispatch plus the per-write-class version
 * refs (UNN-140). Lives in its own context so write-only consumers
 * ({@link useCharacterWrite}) don't re-render on every optimistic change.
 */
interface CharacterEditor {
  characterId: string
  applyEdit: (edit: CharacterEdit) => void
  versionRefs: Record<VersionClass, RefObject<number>>
  /**
   * Per-write-class save queues (UNN-274): one promise chain per class so
   * same-class debounced fields serialize their saves and each reads the
   * freshly-bumped {@link versionRefs} token instead of colliding at the stale
   * pre-bump version. Threaded into {@link useDebouncedAutoSave} by
   * {@link useCharacterAutoSave}.
   */
  saveQueues: Record<VersionClass, RefObject<Promise<void>>>
}

const CharacterEditorContext = createContext<CharacterEditor | null>(null)

export function CharacterProvider({
  character,
  children,
}: {
  character: HydratedCharacter
  children: React.ReactNode
}) {
  useCharacterVersionBroadcast(character.id)

  const [optimisticCharacter, applyEdit] = useOptimistic(
    character,
    (current: HydratedCharacter, edit: CharacterEdit) =>
      reduceCharacter(current, edit)
  )

  const identityRef = useCharacterTokenRef(character.identityVersion)
  const vitalsRef = useCharacterTokenRef(character.vitalsVersion)
  const inventoryRef = useCharacterTokenRef(character.inventoryVersion)
  const progressionRef = useCharacterTokenRef(character.progressionVersion)

  const identityQueue = useRef<Promise<void>>(Promise.resolve())
  const vitalsQueue = useRef<Promise<void>>(Promise.resolve())
  const inventoryQueue = useRef<Promise<void>>(Promise.resolve())
  const progressionQueue = useRef<Promise<void>>(Promise.resolve())

  const editor = useMemo<CharacterEditor>(
    () => ({
      characterId: character.id,
      applyEdit,
      versionRefs: {
        identity: identityRef,
        vitals: vitalsRef,
        inventory: inventoryRef,
        progression: progressionRef,
      },
      saveQueues: {
        identity: identityQueue,
        vitals: vitalsQueue,
        inventory: inventoryQueue,
        progression: progressionQueue,
      },
    }),
    [
      character.id,
      applyEdit,
      identityRef,
      vitalsRef,
      inventoryRef,
      progressionRef,
      identityQueue,
      vitalsQueue,
      inventoryQueue,
      progressionQueue,
    ]
  )

  return (
    <CharacterEditorContext.Provider value={editor}>
      <CharacterContext.Provider value={optimisticCharacter}>
        {children}
      </CharacterContext.Provider>
    </CharacterEditorContext.Provider>
  )
}

/**
 * Reads the optimistic hydrated character from {@link CharacterProvider}.
 * Throws when called outside a provider so a missing wrapper fails loudly.
 */
export function useCharacter(): HydratedCharacter {
  const character = useContext(CharacterContext)
  if (!character) {
    throw new Error("useCharacter must be used within a CharacterProvider")
  }
  return character
}

/**
 * The sheet's debounced auto-save primitive — the provider-bound wrapper over
 * {@link useDebouncedAutoSave}, mirroring how {@link useCharacterWrite} wraps
 * the shared click-write dispatch. It resolves the *shared* per-write-class
 * version ref *and* save queue from {@link CharacterProvider} (UNN-274) and
 * hands them to the core hook, so sibling same-class fields both coordinate on
 * one token and serialize their saves — consumers never touch either. Pass the
 * same args as {@link useDebouncedAutoSave} minus `versionRef`/`saveQueueRef`.
 */
export function useCharacterAutoSave<TValue, TError extends string>(
  args: Omit<
    UseDebouncedAutoSaveArgs<TValue, TError>,
    "versionRef" | "saveQueueRef"
  >
): UseDebouncedAutoSaveReturn<TValue> {
  const editor = useContext(CharacterEditorContext)
  if (!editor) {
    throw new Error(
      "useCharacterAutoSave must be used within a CharacterProvider"
    )
  }
  const characterClass = EDIT_SURFACE_CLASS[args.surface]
  return useDebouncedAutoSave({
    ...args,
    versionRef: editor.versionRefs[characterClass],
    saveQueueRef: editor.saveQueues[characterClass],
  })
}

interface WriteParams<
  TSuccess extends { version: number },
  TError extends string,
> {
  /**
   * The optimistic edit, applied through {@link reduceCharacter}. Optional:
   * a write whose result isn't known client-side ahead of the round-trip
   * (e.g. a portrait upload, where the Blob URL comes back from the server)
   * omits it and lets `revalidateCharacter` repaint the affected surface —
   * the same shape `useBuilderWrite`'s optional `optimistic` callback allows.
   */
  edit?: CharacterEdit
  /**
   * The edit surface being written. Its per-write-class version token (UNN-140)
   * is resolved from {@link EDIT_SURFACE_CLASS} — the one place surface→class
   * lives, shared with the server wrappers (UNN-233).
   */
  surface: EditSurface
  /** The Server Action call, given the expected version. */
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  /** Toast copy. Defaults cover the stale and generic cases. */
  messages?: { stale?: string; error?: string }
  /**
   * First crack at a failure: return `true` to suppress the default toast
   * (the caller handled it — e.g. surfacing a domain-specific message or
   * intentionally ignoring a benign cross-tab race).
   */
  onError?: (error: TError | "stale") => boolean
}

/**
 * The one owner-mode write primitive. Bundles a *local* `useTransition` (so
 * each control keeps its own `pending` — no global lock), applies the edit to
 * the shared optimistic character, then persists through the silent-retry +
 * cross-tab-broadcast pipeline against the right per-class version ref. Toasts
 * on failure; React reverts the optimistic frame automatically.
 */
export function useCharacterWrite() {
  const editor = useContext(CharacterEditorContext)
  if (!editor) {
    throw new Error("useCharacterWrite must be used within a CharacterProvider")
  }
  const { characterId, applyEdit, versionRefs } = editor
  const [pending, startTransition] = useTransition()

  function write<TSuccess extends { version: number }, TError extends string>({
    edit,
    surface,
    action,
    messages,
    onError,
  }: WriteParams<TSuccess, TError>) {
    const characterClass = EDIT_SURFACE_CLASS[surface]
    startTransition(async () => {
      if (edit) applyEdit(edit)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        surface,
        versionRef: versionRefs[characterClass],
        action,
      })
      if (result.ok) return
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
