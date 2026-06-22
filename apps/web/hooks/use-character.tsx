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

import {
  type CharacterEdit,
  type HydratedCharacter,
  type Result,
} from "@workspace/game/foundation"

import {
  EDIT_SURFACE_CLASS,
  type EditSurface,
  type VersionClass,
} from "@/lib/db/version-classes"
import { reduceCharacter } from "@/lib/game-engine"

import {
  parseCharacterPing,
  type PingedVersions,
} from "./character-version-sync"
import { dispatchCharacterWriteWithRetry } from "./dispatch-character-write"
import { useCharacterVersionBroadcast } from "./use-character-versions-broadcast"
import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "./use-debounced-auto-save"
import { useRealtimeChannel } from "./use-realtime-channel"
import {
  useVersionTokenStore,
  type VersionTokenStore,
} from "./version-token-store"

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
 * Also mounts both remote-change listeners — the per-character
 * `BroadcastChannel` (UNN-203, cross-tab) and the Ably invalidation channel
 * (UNN-372, cross-user) — funneled through one version-compare: a ping whose
 * versions beat the local refs forwards them and `router.refresh()`es; the
 * writer's own tab (and any tab the other transport already reached) sees
 * nothing fresher and skips. Works signed-out too: the public sheet
 * subscribes by knowledge of the shortId, same as the snapshot API.
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
  /**
   * The per-write-class version tokens (UNN-140), consolidated into one
   * {@link VersionTokenStore} (UNN-374): owner writes read/bump a class's token
   * via {@link VersionTokenStore.ref}, and the realtime handlers forward a ping
   * through {@link VersionTokenStore.forward}.
   */
  tokens: VersionTokenStore<VersionClass>
  /**
   * Per-write-class save queues (UNN-274): one promise chain per class so
   * same-class debounced fields serialize their saves and each reads the
   * freshly-bumped {@link tokens} token instead of colliding at the stale
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
  const router = useRouter()

  const [optimisticCharacter, applyEdit] = useOptimistic(
    character,
    (current: HydratedCharacter, edit: CharacterEdit) =>
      reduceCharacter(current, edit)
  )

  const tokens = useVersionTokenStore<VersionClass>({
    identity: character.identityVersion,
    vitals: character.vitalsVersion,
    inventory: character.inventoryVersion,
    progression: character.progressionVersion,
  })

  const identityQueue = useRef<Promise<void>>(Promise.resolve())
  const vitalsQueue = useRef<Promise<void>>(Promise.resolve())
  const inventoryQueue = useRef<Promise<void>>(Promise.resolve())
  const progressionQueue = useRef<Promise<void>>(Promise.resolve())

  const editor: CharacterEditor = {
    characterId: character.id,
    applyEdit,
    tokens,
    saveQueues: {
      identity: identityQueue,
      vitals: vitalsQueue,
      inventory: inventoryQueue,
      progression: progressionQueue,
    },
  }

  // The shared remote-change handler (UNN-372): both transports — the Ably
  // ping and the UNN-203 cross-tab broadcast — funnel here, so a tab whose
  // refs are already current (the writer itself, or a tab the other transport
  // reached first) skips the redundant refresh.
  function applyRemoteVersions(versions: PingedVersions) {
    if (tokens.forward(versions)) router.refresh()
  }

  useCharacterVersionBroadcast(character.id, applyRemoteVersions)
  useRealtimeChannel({
    domain: "character",
    shortId: character.shortId,
    onPing: (data) => {
      const versions = parseCharacterPing(data)
      if (versions) applyRemoteVersions(versions)
    },
    onReconnect: () => router.refresh(),
  })

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
    versionRef: editor.tokens.ref(characterClass),
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
 * The one owner-mode write primitive. Background-updating by default (UNN-482):
 * the edit applies to the shared optimistic character **eagerly**, and the
 * dispatch is **serialized behind the per-class save queue** (the same chain
 * `useDebouncedAutoSave` uses, UNN-274) — so a rapid stepper burst stacks
 * visibly while each write reads its predecessor's freshly-bumped token instead
 * of colliding on one stale version. Controls therefore stop disabling on
 * `pending` and spam safely; `pending` survives only as the per-control
 * `aria-busy` signal (each `useCharacterWrite` keeps its own `useTransition`, so
 * busy stays per-control, not global).
 *
 * Because each dispatch is awaited *inside* its transition, the transition stays
 * pending across the queue wait — so every burst edit's optimistic frame stays
 * mounted until its own truth lands (`revalidateCharacter` rides the action
 * response, advancing the base per-write; no `router.refresh()`, no undercount).
 * Failures toast (deduped per class so a burst surfaces one toast, not N); React
 * reverts the failed edit's optimistic frame automatically.
 */
export function useCharacterWrite() {
  const editor = useContext(CharacterEditorContext)
  if (!editor) {
    throw new Error("useCharacterWrite must be used within a CharacterProvider")
  }
  const { characterId, applyEdit, tokens, saveQueues } = editor
  const [pending, startTransition] = useTransition()

  function write<TSuccess extends { version: number }, TError extends string>({
    edit,
    surface,
    action,
    messages,
    onError,
  }: WriteParams<TSuccess, TError>) {
    const characterClass = EDIT_SURFACE_CLASS[surface]
    const queueRef = saveQueues[characterClass]
    startTransition(async () => {
      if (edit) applyEdit(edit)
      // Serialize behind the per-class chain, reading the token *fresh* inside
      // the `.then` so a queued write sees its predecessor's bumped version.
      const run = queueRef.current.then(() =>
        dispatchCharacterWriteWithRetry({
          characterId,
          surface,
          versionRef: tokens.ref(characterClass),
          action,
        })
      )
      queueRef.current = run.then(
        () => {},
        () => {}
      )
      const result = await run
      if (result.ok) return
      if (onError?.(result.error)) return
      toast.error(
        result.error === "stale"
          ? (messages?.stale ?? "Couldn't sync — refresh to see the latest.")
          : (messages?.error ?? "Couldn't save. Try again."),
        { id: `character-write-error:${characterClass}` }
      )
    })
  }

  return { pending, write, characterId }
}
