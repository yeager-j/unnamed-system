// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { err, ok, type Result } from "@workspace/result"

import type { CharacterProfile, LoadedCharacter } from "@/domain/character/load"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { resolveEntity } from "@/domain/game-engine-v2"
import { applyEntityWriteAction } from "@/lib/actions/entity/apply-entity-write"
import type { EntityCommit } from "@/lib/actions/entity/entity-row-store"
import { getEntityClassVersionAction } from "@/lib/actions/entity/versions"

import {
  EntityWriteProvider,
  useEntityAutoSave,
  useEntityIdentityQueue,
  useEntityWrite,
} from "./use-entity-write"

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }))

/** The provider's channel subscription, captured by the hook mock so tests can
 *  feed pings/reconnects as if Ably delivered them. */
interface CapturedChannel {
  domain: string
  shortId: string
  onPing: (data: unknown) => void
  onReconnect?: () => void
}
const { capturedChannel } = vi.hoisted(() => ({
  capturedChannel: { current: null as CapturedChannel | null },
}))

vi.mock("@/lib/actions/entity/apply-entity-write", () => ({
  applyEntityWriteAction: vi.fn(),
}))
vi.mock("@/lib/sync/use-realtime-channel", () => ({
  useRealtimeChannel: (args: CapturedChannel) => {
    capturedChannel.current = args
  },
}))
vi.mock("@/lib/actions/entity/versions", () => ({
  getEntityClassVersionAction: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}))

const writeAction = vi.mocked(applyEntityWriteAction)
const versionAction = vi.mocked(getEntityClassVersionAction)
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
  versions: { identity: 1, vitals: 1, inventory: 1, progression: 1 },
} satisfies CharacterProfile

const loaded: LoadedCharacter = {
  profile,
  entity,
  resolved: resolveEntity(entity),
}

const commit = (version: number): Result<EntityCommit, never> =>
  ok({
    version,
    shortId: "abc123",
    versionClass: "vitals",
    status: "finalized",
  })

const damage: EntityWrite = { component: "vitals", op: "damage", amount: 1 }
const talents: EntityWrite = {
  component: "talents",
  op: "setGained",
  keys: ["sneak"],
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EntityWriteProvider loaded={loaded}>{children}</EntityWriteProvider>
)

const flush = () => act(async () => {})

beforeEach(() => {
  writeAction.mockReset()
  versionAction.mockReset()
  routerRefresh.mockReset()
  vi.mocked(toast.error).mockReset()
  capturedChannel.current = null
})

describe("useEntityWrite — one-shot stale-retry (UNN-568)", () => {
  it("short-circuits a local Writer refusal before any network request", async () => {
    const missingSkillPool: EntityWrite = {
      component: "skillPool",
      op: "damage",
      amount: 1,
    }

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => result.current.dispatch(missingSkillPool))

    expect(writeAction).not.toHaveBeenCalled()
    expect(versionAction).not.toHaveBeenCalled()
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
    expect(writeAction).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("silently retries a cross-writer stale with the refetched class token", async () => {
    writeAction
      .mockResolvedValueOnce(err("stale"))
      .mockResolvedValueOnce(commit(6))
    versionAction.mockResolvedValue(ok({ version: 5 }))
    const onSuccess = vi.fn()

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(damage, { onSuccess })
    })
    await flush()

    expect(writeAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expectedVersion: 1 })
    )
    expect(versionAction).toHaveBeenCalledWith({
      entityId: "char-1",
      versionClass: "vitals",
    })
    expect(writeAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedVersion: 5 })
    )
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ version: 6 })
    )
    expect(toast.error).not.toHaveBeenCalled()
    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it("a stale that survives the retry is a real conflict: toast + refresh", async () => {
    writeAction.mockResolvedValue(err("stale"))
    versionAction.mockResolvedValue(ok({ version: 5 }))

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(damage)
    })
    await flush()

    expect(writeAction).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledWith(
      "This character changed elsewhere — refreshing."
    )
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it("serializes same-class writes so the second reads the bumped token", async () => {
    writeAction
      .mockResolvedValueOnce(commit(2))
      .mockResolvedValueOnce(commit(3))

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(damage)
      result.current.dispatch(damage)
    })
    await flush()

    expect(writeAction).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ expectedVersion: 1 })
    )
    expect(writeAction).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expectedVersion: 2 })
    )
  })

  it("keeps class queues isolated — an in-flight identity write never blocks a vitals write", async () => {
    let releaseIdentity!: (value: Result<EntityCommit, never>) => void
    writeAction.mockImplementation((input) =>
      input.write.component === "talents"
        ? new Promise((resolve) => {
            releaseIdentity = resolve
          })
        : Promise.resolve(commit(2))
    )

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(talents) // identity class — parked in flight
      result.current.dispatch(damage) // vitals class — its own spine
    })
    await flush()

    // The vitals write dispatched (and committed) while identity is parked.
    expect(writeAction).toHaveBeenCalledTimes(2)
    expect(writeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        write: damage,
      })
    )

    await act(async () => releaseIdentity(commit(2)))
  })
})

describe("EntityWriteProvider — cross-writer reconcile channel (UNN-569)", () => {
  const ping = (data: unknown) =>
    act(() => capturedChannel.current!.onPing(data))

  it("subscribes to the character channel by the profile's shortId", () => {
    renderHook(() => useEntityWrite(), { wrapper })
    expect(capturedChannel.current).toMatchObject({
      domain: "character",
      shortId: "abc123",
    })
  })

  it("a genuinely fresher ping refreshes and forwards the class token to the next write", async () => {
    writeAction.mockResolvedValueOnce(commit(8))

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    ping({ kind: "entity", versions: { vitals: 7 } })
    expect(routerRefresh).toHaveBeenCalledTimes(1)

    await act(async () => {
      result.current.dispatch(damage)
    })
    await flush()

    // The dispatch read the pinged token — no stale round-trip.
    expect(writeAction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 7 })
    )
    expect(versionAction).not.toHaveBeenCalled()
  })

  it("suppresses echoes and junk: nothing fresher never refreshes", () => {
    renderHook(() => useEntityWrite(), { wrapper })
    ping({ kind: "entity", versions: { vitals: 1 } }) // equal to the known token
    ping({ kind: "entity", versions: { bogus: 99 } }) // foreign key
    ping("junk") // malformed payload
    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it("ignores v1 characters-row pings — the other family's counters must not poison the entity refs", async () => {
    writeAction.mockResolvedValueOnce(commit(2))

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    // A v1 write bumps the characters row's counter far above the entity
    // row's; forwarding it would strand the forward-only ref above the true
    // entity version and every later write would send a too-high token.
    ping({ kind: "character", versions: { identity: 40 } })
    ping({ versions: { identity: 40 } }) // untagged legacy: ambiguous, dropped
    expect(routerRefresh).not.toHaveBeenCalled()

    await act(async () => {
      result.current.dispatch(talents) // identity class
    })
    await flush()

    // The identity write still reads the untouched entity token.
    expect(writeAction).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1 })
    )
  })

  it("an echo of this tab's own committed write does not refresh", async () => {
    writeAction.mockResolvedValueOnce(commit(2))

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(damage)
    })
    await flush()

    ping({ kind: "entity", versions: { vitals: 2 } })
    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it("refreshes once a dropped connection comes back", () => {
    renderHook(() => useEntityWrite(), { wrapper })
    act(() => capturedChannel.current!.onReconnect?.())
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })
})

describe("useEntityAutoSave — the shared class spine (UNN-568)", () => {
  it("serializes an identity lifecycle action behind a parked identity auto-save", async () => {
    let releaseSave!: (value: Result<EntityCommit, never>) => void
    writeAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseSave = resolve
        })
    )
    const finalize = vi.fn(async (expectedVersion: number) =>
      ok({ shortId: "abc123", version: expectedVersion + 1 })
    )

    const { result } = renderHook(
      () => ({
        autoSave: useEntityAutoSave({
          serverValue: "old",
          makeWrite: (value) => ({
            component: "narrative",
            op: "setField",
            field: "ancestry",
            value,
          }),
        }),
        identity: useEntityIdentityQueue(),
      }),
      { wrapper }
    )

    await act(async () => result.current.autoSave.setValue("new"))
    await act(async () => result.current.autoSave.flush())

    let finalized!: ReturnType<typeof finalize>
    act(() => {
      finalized = result.current.identity.enqueueOnce(finalize)
    })
    expect(finalize).not.toHaveBeenCalled()

    await act(async () => releaseSave(commit(4)))
    await act(async () => finalized)

    expect(finalize).toHaveBeenCalledWith(4)
  })

  it("does not retry a stale identity lifecycle action against unseen state", async () => {
    const finalize = vi.fn(async () => err("stale"))
    versionAction.mockResolvedValue(ok({ version: 7 }))

    const { result } = renderHook(() => useEntityIdentityQueue(), { wrapper })
    let finalized!: ReturnType<typeof finalize>
    act(() => {
      finalized = result.current.enqueueOnce(finalize)
    })
    await act(async () => finalized)

    expect(finalize).toHaveBeenCalledOnce()
    expect(finalize).toHaveBeenCalledWith(1)
    expect(versionAction).not.toHaveBeenCalled()
  })

  it("a click write chains behind an in-flight debounced save on the same class and reads its bumped token", async () => {
    let releaseSave!: (value: Result<EntityCommit, never>) => void
    writeAction.mockImplementation((input) => {
      const write = input.write as EntityWrite
      if (write.component === "narrative") {
        return new Promise((resolve) => {
          releaseSave = resolve
        })
      }
      return Promise.resolve(commit(9))
    })

    const { result } = renderHook(
      () => ({
        autoSave: useEntityAutoSave({
          serverValue: "old",
          makeWrite: (value) => ({
            component: "narrative",
            op: "setField",
            field: "ancestry",
            value,
          }),
        }),
        write: useEntityWrite(),
      }),
      { wrapper }
    )

    // Kick the debounced save (identity class) and park it in flight. The
    // draft state must commit before flush reads it, so two acts.
    await act(async () => {
      result.current.autoSave.setValue("new")
    })
    await act(async () => {
      result.current.autoSave.flush()
    })
    expect(writeAction).toHaveBeenCalledTimes(1)

    // A click write in the same class chains behind it on the shared spine.
    await act(async () => {
      result.current.write.dispatch(talents)
    })
    expect(writeAction).toHaveBeenCalledTimes(1)

    // Releasing the save bumps the identity token; the click write follows
    // with the fresh token — never the stale pre-save value.
    await act(async () => releaseSave(commit(4)))
    await flush()

    expect(writeAction).toHaveBeenCalledTimes(2)
    expect(writeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 4, write: talents })
    )
  })

  it("a debounced save's surviving stale refreshes the route (cross-tab strand guard)", async () => {
    writeAction.mockResolvedValue(err("stale"))
    versionAction.mockResolvedValue(ok({ version: 7 }))

    const { result } = renderHook(
      () =>
        useEntityAutoSave({
          serverValue: "old",
          makeWrite: (value) => ({
            component: "narrative",
            op: "setField",
            field: "ancestry",
            value,
          }),
        }),
      { wrapper }
    )

    await act(async () => {
      result.current.setValue("new")
    })
    await act(async () => {
      result.current.flush()
    })
    await flush()

    // Retried once (stale → refetch 7 → retry), then surfaced + refreshed.
    expect(writeAction).toHaveBeenCalledTimes(2)
    expect(writeAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 7 })
    )
    expect(routerRefresh).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalled()
  })
})
