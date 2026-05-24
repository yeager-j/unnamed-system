"use client"

import { createContext, useContext } from "react"

import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { useCharacterVersionBroadcast } from "./use-character-versions-broadcast"

/**
 * Supplies the hydrated character to every client component below it,
 * eliminating prop drilling through deeper interactive surfaces (rows,
 * popovers, the eventual cast button). The provider sits inside the existing
 * client subtree — RSC sections that already take `character` as a prop
 * continue to do so and don't need to consume the context.
 *
 * Also mounts the per-character `BroadcastChannel` listener (UNN-203) so
 * any sibling tab that lands a successful write triggers a
 * `router.refresh()` in this tab — without that, two tabs on the same
 * character drift apart silently until a manual reload.
 */
export const CharacterContext = createContext<HydratedCharacter | null>(null)

export function CharacterProvider({
  character,
  children,
}: {
  character: HydratedCharacter
  children: React.ReactNode
}) {
  useCharacterVersionBroadcast(character.id)
  return (
    <CharacterContext.Provider value={character}>
      {children}
    </CharacterContext.Provider>
  )
}

/**
 * Reads the hydrated character from {@link CharacterProvider}. Throws when
 * called outside a provider so a missing wrapper fails loudly instead of
 * silently rendering against `null`.
 */
export function useCharacter(): HydratedCharacter {
  const character = useContext(CharacterContext)
  if (!character) {
    throw new Error("useCharacter must be used within a CharacterProvider")
  }
  return character
}
