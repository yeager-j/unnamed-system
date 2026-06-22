// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/game/foundation"

import type { CharacterRow } from "@/lib/db/schema/character"
import { deriveHydratedCharacter } from "@/lib/game-engine"

import { CharacterProvider, useCharacterWrite } from "./use-character"

// The provider mounts the realtime + cross-tab listeners and reads next's
// router; stub them so this is a pure client-logic test (no Ably, no
// BroadcastChannel, no router context). None are exercised by the write path.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("./use-realtime-channel", () => ({ useRealtimeChannel: vi.fn() }))
vi.mock("./use-character-versions-broadcast", () => ({
  useCharacterVersionBroadcast: vi.fn(),
  broadcastCharacterVersion: vi.fn(),
}))
vi.mock("../lib/actions/character-versions", () => ({
  getCharacterVersionsAction: vi.fn(),
}))

const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a) },
}))

type WriteResult = Result<{ version: number }, string>

/** A manually-resolved write action recording each `expectedVersion` it was
 *  handed — reproduces a back-to-back burst deterministically. */
function makeControlledAction() {
  const calls: {
    expectedVersion: number
    resolve: (result: WriteResult) => void
  }[] = []
  const action = (expectedVersion: number) =>
    new Promise<WriteResult>((resolve) => {
      calls.push({ expectedVersion, resolve })
    })
  return { action, calls }
}

/** Drains the per-class save-queue `.then` chain + dispatch awaits between
 *  assertions, without timers (mirrors `use-queued-write.test`). */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function makeCharacter() {
  const row: CharacterRow = {
    id: "char-1",
    shortId: "char-1-short",
    ownerId: "user-1",
    campaignId: null,
    status: "finalized",
    builderStep: 0,
    name: "Test Character",
    pronouns: "they/them",
    portraitUrl: null,
    level: 1,
    pathChoice: "balanced",
    currentHP: 20,
    currentSP: 20,
    hitDiceRemaining: 0,
    skillDiceRemaining: 0,
    manualBonuses: {},
    virtueExpression: 0,
    virtueEmpathy: 0,
    virtueWisdom: 0,
    virtueFocus: 0,
    sparkLog: [],
    victories: 0,
    currency: 100,
    prismaCharges: 2,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: "arch-1",
    originCharacterArchetypeId: "arch-1",
    savedArchetypeRanks: 0,
    ancestryText: null,
    backgroundText: null,
    backstoryText: null,
    personalityTraits: null,
    hopes: null,
    dreams: null,
    fears: null,
    secrets: null,
    gainedTalents: [],
    notes: null,
    identityVersion: 0,
    vitalsVersion: 0,
    inventoryVersion: 0,
    progressionVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }
  return deriveHydratedCharacter({
    row,
    archetypeRows: [
      {
        id: "arch-1",
        characterId: "char-1",
        archetypeKey: "warrior",
        rank: 1,
        inheritanceSlots: [],
        mechanicState: null,
      },
    ],
    inventoryRows: [],
    knives: [],
    chains: [],
  })
}

function renderWrite() {
  const character = makeCharacter()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <CharacterProvider character={character}>{children}</CharacterProvider>
  )
  return renderHook(() => useCharacterWrite(), { wrapper })
}

describe("useCharacterWrite — background-write serialization (UNN-482)", () => {
  afterEach(() => {
    toastError.mockClear()
  })

  it("serializes a rapid same-class burst so each write reads its predecessor's bumped version", async () => {
    const { result } = renderWrite()
    const { action, calls } = makeControlledAction()

    // Three rapid taps before any resolves — the un-gated stepper spam case.
    act(() => {
      result.current.write({ surface: "pools", action })
      result.current.write({ surface: "pools", action })
      result.current.write({ surface: "pools", action })
    })
    await flush()

    // Only the first dispatched; the other two wait behind the vitals queue.
    expect(calls).toHaveLength(1)
    expect(calls[0]!.expectedVersion).toBe(0)

    act(() => calls[0]!.resolve(ok({ version: 1 })))
    await flush()

    // The second reads the version the first produced — not the stale seed both
    // would share without the queue (the dropped-write / stale-toast bug).
    expect(calls).toHaveLength(2)
    expect(calls[1]!.expectedVersion).toBe(1)

    act(() => calls[1]!.resolve(ok({ version: 2 })))
    await flush()

    expect(calls).toHaveLength(3)
    expect(calls[2]!.expectedVersion).toBe(2)

    act(() => calls[2]!.resolve(ok({ version: 3 })))
    await flush()

    // The whole burst landed with no stale-rejection toast.
    expect(toastError).not.toHaveBeenCalled()
  })

  it("runs independent classes in parallel (a vitals burst doesn't block a progression write)", async () => {
    const { result } = renderWrite()
    const vitals = makeControlledAction()
    const progression = makeControlledAction()

    act(() => {
      result.current.write({ surface: "pools", action: vitals.action })
      result.current.write({
        surface: "victories",
        action: progression.action,
      })
    })
    await flush()

    // Different classes → different queues → both in flight at once.
    expect(vitals.calls).toHaveLength(1)
    expect(progression.calls).toHaveLength(1)
  })

  it("keeps the chain flowing after a mid-burst hard-fail and surfaces one toast", async () => {
    const { result } = renderWrite()
    const { action, calls } = makeControlledAction()

    act(() => {
      result.current.write({ surface: "pools", action })
      result.current.write({ surface: "pools", action })
    })
    await flush()

    // First write hard-fails (a non-stale domain error — no retry, no bump).
    act(() => calls[0]!.resolve(err("invalid-input")))
    await flush()

    expect(toastError).toHaveBeenCalledTimes(1)

    // The failure didn't poison the queue — the second still dispatched, at the
    // unchanged version (the failed write never bumped the token).
    expect(calls).toHaveLength(2)
    expect(calls[1]!.expectedVersion).toBe(0)

    act(() => calls[1]!.resolve(ok({ version: 1 })))
    await flush()
    expect(toastError).toHaveBeenCalledTimes(1)
  })
})
