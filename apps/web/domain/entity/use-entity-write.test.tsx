// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  defineCanon,
  revisionVector,
  type AcceptedStamp,
  type Canon,
} from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import type { CharacterProfile } from "@/domain/character/load"
import type { EntityCanonValue } from "@/domain/entity/commit/protocol"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { resolveEntity } from "@/domain/game-engine-v2"
import { applyEntityMutationAction } from "@/lib/actions/entity/mutations/apply"
import { entityAxisFor } from "@/lib/db/axes"

import {
  EntityWriteProvider,
  useEntityColumnSave,
  useEntityWrite,
  useIdentityWrite,
  useLoadedCharacter,
} from "./use-entity-write"

/**
 * The P2d provider's app-semantics suite (UNN-676): predictor-refusal
 * short-circuits, lifecycle→toast/callback error mapping, the predicted frame
 * (including the identity overlay), the wire envelope shape, and autosave
 * settle semantics. Queue order, replay, canonization coverage, ambiguous
 * retry, and invalidation handling are the package's contracts — proven in
 * `@workspace/headcanon`'s own suites, not re-tested through this binding.
 */

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }))

vi.mock("@/lib/actions/entity/mutations/apply", () => ({
  applyEntityMutationAction: vi.fn(),
}))
vi.mock("@/lib/realtime/axis-invalidations", () => ({
  axisInvalidations: {
    initialStatus: "disabled" as const,
    subscribe: () => () => {},
  },
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), dismiss: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  unstable_rethrow: () => {},
}))

const door = vi.mocked(applyEntityMutationAction)
const { toast } = await import("sonner")

const entity: Entity = {
  id: "char-1",
  components: { vitals: { base: 10, damage: 0 } },
}

const profile = {
  id: "char-1",
  shortId: "abc123",
  ownerId: "user-1",
  campaignId: null,
  status: "finalized" as const,
  builderStep: 5,
  name: "Test",
  portraitUrl: null,
  pronouns: null,
  notes: null,
} satisfies CharacterProfile

function canonAt(
  revisions: Partial<Record<"identity" | "vitals", number>> = {}
): Canon<EntityCanonValue> {
  return defineCanon({
    value: {
      entity,
      resolved: resolveEntity(entity),
      identity: {
        name: profile.name,
        pronouns: profile.pronouns,
        portraitUrl: profile.portraitUrl,
        notes: profile.notes,
      },
    },
    revisions: {
      [entityAxisFor.identity("char-1")]: revisions.identity ?? 1,
      [entityAxisFor.vitals("char-1")]: revisions.vitals ?? 1,
      [entityAxisFor.inventory("char-1")]: 1,
      [entityAxisFor.progression("char-1")]: 1,
    },
  })
}

function stampFor(revisions: Record<string, number>): AcceptedStamp {
  const parsed = revisionVector(revisions)
  if (!parsed.ok) throw new Error("invalid test stamp")
  return { revisions: parsed.value }
}

type DoorOutcome = Awaited<ReturnType<typeof applyEntityMutationAction>>

const accepted = (revisions: Record<string, number>): DoorOutcome =>
  ok({ kind: "accepted", stamp: stampFor(revisions) })
const rejected = (error: string): DoorOutcome =>
  ok({ kind: "rejected", error }) as DoorOutcome
const contention: DoorOutcome = err({
  code: "contention",
  mutationId: "m-1",
})

const damage: EntityWrite = { component: "vitals", op: "damage", amount: 1 }

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EntityWriteProvider profile={profile} canon={canonAt()}>
    {children}
  </EntityWriteProvider>
)

const flush = () => act(async () => {})

beforeEach(() => {
  door.mockReset()
  routerRefresh.mockReset()
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.dismiss).mockReset()
})

describe("useEntityWrite — dispatch over the predicted root", () => {
  it("short-circuits a local Writer refusal before any delivery", async () => {
    const missingSkillPool: EntityWrite = {
      component: "skillPool",
      op: "damage",
      amount: 1,
    }

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    const outcome = await act(async () =>
      result.current.dispatch(missingSkillPool)
    )

    expect(outcome).toEqual(err("capability-missing"))
    expect(door).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "That change can't apply to this character. Reload and try again."
    )
  })

  it("lets a refusal-specific handler suppress the default toast", async () => {
    const onError = vi.fn(() => true)
    const missingSkillPool: EntityWrite = {
      component: "skillPool",
      op: "damage",
      amount: 1,
    }

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () =>
      result.current.dispatch(missingSkillPool, { onError })
    )

    expect(onError).toHaveBeenCalledWith("capability-missing")
    expect(door).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("delivers an envelope carrying intent and identity but no expected revision", async () => {
    door.mockResolvedValueOnce(
      accepted({ [entityAxisFor.vitals("char-1")]: 2 })
    )
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => result.current.dispatch(damage, { onSuccess }))
    await flush()

    expect(door).toHaveBeenCalledTimes(1)
    const envelope = door.mock.calls[0]![0] as Record<string, unknown>
    expect(envelope).toEqual({
      protocol: "showtime.entity.v1",
      mutationId: expect.any(String),
      invocation: {
        name: "entity.write",
        args: { entityId: "char-1", write: damage },
      },
    })
    expect(JSON.stringify(envelope)).not.toContain("expectedVersion")
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("applies the prediction immediately and rolls it back on a typed rejection", async () => {
    let release!: (outcome: DoorOutcome) => void
    door.mockImplementationOnce(
      () => new Promise<DoorOutcome>((resolve) => (release = resolve))
    )

    const { result } = renderHook(
      () => ({ write: useEntityWrite(), frame: useLoadedCharacter() }),
      { wrapper }
    )
    await act(async () => result.current.write.dispatch(damage))

    // Predicted instantly: the same pure Writer the authority reruns.
    expect(result.current.frame.entity.components.vitals).toMatchObject({
      damage: 1,
    })

    await act(async () => release(rejected("entity-load-failed")))
    await flush()

    expect(result.current.frame.entity.components.vitals).toMatchObject({
      damage: 0,
    })
    expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again.")
  })

  it("maps an authority rejection through onError before the default toast", async () => {
    door.mockResolvedValueOnce(rejected("entity-load-failed"))
    const onError = vi.fn(() => true)

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => result.current.dispatch(damage, { onError }))
    await flush()

    expect(onError).toHaveBeenCalledWith("entity-load-failed")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("redelivers the same envelope after exhausted authority contention", async () => {
    vi.useFakeTimers()
    try {
      door
        .mockResolvedValueOnce(contention)
        .mockResolvedValueOnce(
          accepted({ [entityAxisFor.vitals("char-1")]: 2 })
        )
      const onSuccess = vi.fn()

      const { result } = renderHook(() => useEntityWrite(), { wrapper })
      await act(async () => result.current.dispatch(damage, { onSuccess }))
      await flush()
      expect(door).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })

      expect(door).toHaveBeenCalledTimes(2)
      const first = door.mock.calls[0]![0] as { mutationId: string }
      const second = door.mock.calls[1]![0] as { mutationId: string }
      expect(second.mutationId).toBe(first.mutationId)
      expect(onSuccess).toHaveBeenCalledTimes(1)
      expect(toast.error).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("returns the receipt so a caller can await acceptance and canonization", async () => {
    const vitalsAxis = entityAxisFor.vitals("char-1")
    door.mockResolvedValueOnce(accepted({ [vitalsAxis]: 2 }))

    let currentCanon = canonAt()
    const dynamicWrapper = ({ children }: { children: React.ReactNode }) => (
      <EntityWriteProvider profile={profile} canon={currentCanon}>
        {children}
      </EntityWriteProvider>
    )

    const { result, rerender } = renderHook(() => useEntityWrite(), {
      wrapper: dynamicWrapper,
    })

    const outcome = await act(async () => result.current.dispatch(damage))
    await flush()

    if (!outcome.ok) throw new Error("expected an accepted dispatch")
    const acceptance = await outcome.value.accepted
    expect(acceptance).toEqual(ok(stampFor({ [vitalsAxis]: 2 })))

    currentCanon = canonAt({ vitals: 2 })
    rerender()
    await flush()
    await expect(outcome.value.canonized).resolves.toEqual(ok(undefined))
  })

  it("settles a covered acceptance once a newer canon arrives", async () => {
    const vitalsAxis = entityAxisFor.vitals("char-1")
    door.mockResolvedValueOnce(accepted({ [vitalsAxis]: 2 }))

    let currentCanon = canonAt()
    const dynamicWrapper = ({ children }: { children: React.ReactNode }) => (
      <EntityWriteProvider profile={profile} canon={currentCanon}>
        {children}
      </EntityWriteProvider>
    )

    const { result, rerender } = renderHook(() => useEntityWrite(), {
      wrapper: dynamicWrapper,
    })

    await act(async () => result.current.dispatch(damage))
    await flush()

    // The covering canon canonizes the headcanon; no error surfaces.
    currentCanon = canonAt({ vitals: 2 })
    rerender()
    await flush()
    expect(toast.error).not.toHaveBeenCalled()
  })
})

describe("useIdentityWrite + the predicted identity overlay", () => {
  it("overlays a predicted identity write onto the frame's profile", async () => {
    let release!: (outcome: DoorOutcome) => void
    door.mockImplementationOnce(
      () => new Promise<DoorOutcome>((resolve) => (release = resolve))
    )

    const { result } = renderHook(
      () => ({ identity: useIdentityWrite(), frame: useLoadedCharacter() }),
      { wrapper }
    )
    await act(async () =>
      result.current.identity.dispatch({ field: "name", value: "Renamed" })
    )

    expect(result.current.frame.profile.name).toBe("Renamed")

    await act(async () =>
      release(accepted({ [entityAxisFor.identity("char-1")]: 2 }))
    )
  })
})

describe("useEntityColumnSave — autosave settle semantics", () => {
  function renderNameSave() {
    return renderHook(
      () => ({
        save: useEntityColumnSave({
          serverValue: profile.name,
          isEmpty: (next) => next.trim().length === 0,
          isEqual: (a, b) => a.trim() === b.trim(),
          makeWrite: (next) => ({ field: "name", value: next.trim() }),
        }),
        frame: useLoadedCharacter(),
      }),
      { wrapper }
    )
  }

  it("flushes one entity.identity mutation per settled edit", async () => {
    door.mockResolvedValueOnce(
      accepted({ [entityAxisFor.identity("char-1")]: 2 })
    )

    const { result } = renderNameSave()
    await act(async () => result.current.save.setValue("New Name"))
    await act(async () => result.current.save.flush())
    await flush()

    expect(door).toHaveBeenCalledTimes(1)
    const envelope = door.mock.calls[0]![0] as {
      invocation: { name: string; args: unknown }
    }
    expect(envelope.invocation).toEqual({
      name: "entity.identity",
      args: { entityId: "char-1", write: { field: "name", value: "New Name" } },
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("rolls the draft back and toasts when the authority rejects the save", async () => {
    door.mockResolvedValueOnce(rejected("entity-load-failed"))

    const { result } = renderNameSave()
    await act(async () => result.current.save.setValue("Doomed Name"))
    await act(async () => result.current.save.flush())
    await flush()

    expect(result.current.save.value).toBe(profile.name)
    expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again.")
  })
})
