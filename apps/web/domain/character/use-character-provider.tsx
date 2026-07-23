"use client"

import { useMemo } from "react"

import type { ResolveContext } from "@workspace/game-v2/resolve/resolve"
import type { Canon } from "@workspace/headcanon"

import type { CharacterCanonValue } from "@/domain/character/commit/protocol"
import { resolveEntity } from "@/domain/game-engine-v2"

import { CharacterRoot } from "./use-character-root"

/**
 * Mounts one character aggregate as a shared Headcanon root. Descendants read
 * and mutate through {@link CharacterRoot.useRoot}; this provider adds no
 * parallel read or write API.
 */
export function CharacterProvider({
  canon,
  resolveContext,
  children,
}: {
  canon: Canon<CharacterCanonValue>
  resolveContext?: ResolveContext
  children: React.ReactNode
}) {
  const mountedCanon = useMemo<Canon<CharacterCanonValue>>(() => {
    if (!resolveContext) return canon

    return {
      ...canon,
      value: {
        ...canon.value,
        resolveContext,
        resolved: resolveEntity(canon.value.entity, resolveContext),
      },
    }
  }, [canon, resolveContext])

  return (
    <CharacterRoot.Provider
      key={mountedCanon.value.profile.id}
      canon={mountedCanon}
    >
      {children}
    </CharacterRoot.Provider>
  )
}
