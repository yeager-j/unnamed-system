// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  acceptedStamp,
  defineCanon,
  revisionVector,
  type AcceptedStamp,
} from "@workspace/headcanon"
import { createPredictedRoot } from "@workspace/headcanon/react"
import { createInMemoryInvalidationAdapter } from "@workspace/headcanon/testing"
import { ok } from "@workspace/result"

import { characterProtocol } from "@/domain/character/commit/protocol"
import { combatProtocol } from "@/domain/combat/commit/protocol"
import { entityIdentityAxis, entityVitalsAxis } from "@/lib/db/axes"

function stamp(axis: string, value: number): AcceptedStamp {
  const parsed = revisionVector({ [axis]: value })
  if (!parsed.ok) throw new Error("invalid test stamp")
  return acceptedStamp(parsed.value)
}

describe("character and combat root invalidation isomorphism", () => {
  it("refreshes both roots through the shared vitals axis and ignores an axis mismatch", async () => {
    const invalidations = createInMemoryInvalidationAdapter()
    const refreshCharacter = vi.fn()
    const refreshCombat = vi.fn()
    const useCharacterRoot = createPredictedRoot({
      protocol: characterProtocol,
      send: async () => ok(stamp(entityVitalsAxis("entity-1"), 2)),
      refresh: () => ({ acceptanceGraceMs: 0, request: refreshCharacter }),
      invalidations,
    })
    const useCombatRoot = createPredictedRoot({
      protocol: combatProtocol,
      send: async () => ok(stamp(entityVitalsAxis("entity-1"), 2)),
      refresh: () => ({ acceptanceGraceMs: 0, request: refreshCombat }),
      invalidations,
    })
    const sharedAxis = entityVitalsAxis("entity-1")
    const characterCanon = defineCanon({
      value: {} as never,
      revisions: { [sharedAxis]: 1 },
    })
    const combatCanon = defineCanon({
      value: {} as never,
      revisions: { [sharedAxis]: 1 },
    })

    const character = renderHook(({ canon }) => useCharacterRoot({ canon }), {
      initialProps: { canon: characterCanon },
    })
    const combat = renderHook(({ canon }) => useCombatRoot({ canon }), {
      initialProps: { canon: combatCanon },
    })

    act(() => {
      void invalidations.publish(
        "axis-mismatch",
        stamp(entityIdentityAxis("entity-1"), 2)
      )
    })
    expect(refreshCharacter).not.toHaveBeenCalled()
    expect(refreshCombat).not.toHaveBeenCalled()

    act(() => {
      void invalidations.publish("character-vitals-write", stamp(sharedAxis, 2))
    })
    await waitFor(() => expect(refreshCombat).toHaveBeenCalledTimes(1))

    character.rerender({
      canon: defineCanon({
        value: {} as never,
        revisions: { [sharedAxis]: 2 },
      }),
    })
    combat.rerender({
      canon: defineCanon({
        value: {} as never,
        revisions: { [sharedAxis]: 2 },
      }),
    })

    act(() => {
      void invalidations.publish("durable-combat-write", stamp(sharedAxis, 3))
    })
    await waitFor(() => expect(refreshCharacter).toHaveBeenCalledTimes(2))

    character.unmount()
    combat.unmount()
  })
})
