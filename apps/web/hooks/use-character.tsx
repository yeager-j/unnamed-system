"use client"

import {
  createContext,
  useContext,
  useMemo,
  useOptimistic,
  useTransition,
  type RefObject,
} from "react"
import { toast } from "sonner"

import {
  reduceCharacter,
  type CharacterEdit,
  type HydratedCharacter,
} from "@/lib/game/character"
import type { Result } from "@/lib/result"

import { dispatchCharacterWriteWithRetry } from "./dispatch-character-write"
import { useCharacterTokenRef } from "./use-character-token-ref"
import {
  useCharacterVersionBroadcast,
  type VersionClass,
} from "./use-character-versions-broadcast"

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
    }),
    [
      character.id,
      applyEdit,
      identityRef,
      vitalsRef,
      inventoryRef,
      progressionRef,
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

interface WriteParams<
  TSuccess extends { version: number },
  TError extends string,
> {
  /** The optimistic edit, applied through {@link reduceCharacter}. */
  edit: CharacterEdit
  /** Which per-write-class token to condition the save on (UNN-140). */
  characterClass: VersionClass
  /** The Server Action call, given the expected version. */
  action: (expectedVersion: number) => Promise<Result<TSuccess, TError>>
  /** Toast copy. Defaults cover the stale and generic cases. */
  messages?: { stale?: string; error?: string }
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
    characterClass,
    action,
    messages,
  }: WriteParams<TSuccess, TError>) {
    startTransition(async () => {
      applyEdit(edit)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass,
        versionRef: versionRefs[characterClass],
        action,
      })
      if (result.ok) return
      toast.error(
        result.error === "stale"
          ? (messages?.stale ?? "Couldn't sync — refresh to see the latest.")
          : (messages?.error ?? "Couldn't save. Try again.")
      )
    })
  }

  return { pending, write, characterId }
}
