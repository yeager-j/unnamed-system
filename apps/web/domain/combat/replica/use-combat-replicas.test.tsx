// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { defaultOverlay } from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok } from "@workspace/result"

import type { ParticipantMeta } from "@/domain/combat/participant-meta"

import { useCombatReplicas } from "./use-combat-replicas"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

const loadCombatAcceptedAction = vi.fn()
const pushCombatDurableMutationAction = vi.fn()
const pushCombatSessionMutationAction = vi.fn()

vi.mock("@/lib/actions/combat/replica/snapshot", () => ({
  loadCombatAcceptedAction: (input: unknown) => loadCombatAcceptedAction(input),
}))
vi.mock("@/lib/actions/combat/replica/push", () => ({
  pushCombatDurableMutationAction: (input: unknown) =>
    pushCombatDurableMutationAction(input),
  pushCombatSessionMutationAction: (input: unknown) =>
    pushCombatSessionMutationAction(input),
}))

const pcParticipant = asParticipantId("p-pc")
const goblinParticipant = asParticipantId("p-goblin")

const meta: Record<string, ParticipantMeta> = {
  [pcParticipant]: {
    storage: "durable",
    characterId: "e1",
    characterShortId: "pc-short",
  },
  [goblinParticipant]: { storage: "inline" },
}

const damage = { component: "vitals", op: "damage", amount: 2 } as const

const durableAccepted = (through: number, vitals: number, damage = 0) => ({
  value: { components: { vitals: { base: 20, damage } } },
  through,
  cursor: { vitals },
})

const encounterAccepted = (
  through: number,
  version: number,
  damage = 0,
  status: "draft" | "live" = "live"
) => ({
  value: {
    status,
    session: {
      round: 1,
      currentActorId: null,
      advantage: null,
      firstSide: null,
      participants: [
        {
          id: goblinParticipant,
          entity: {
            storage: "inline" as const,
            entity: {
              id: "goblin-1",
              components: { vitals: { base: 8, damage } },
            },
          },
          overlay: defaultOverlay({ side: "enemies" }),
        },
      ],
    },
  },
  through,
  cursor: version,
})

function primeBatch(through = 0) {
  loadCombatAcceptedAction.mockResolvedValue(
    ok({
      encounter: encounterAccepted(through, 1),
      durable: { e1: durableAccepted(through, 1) },
    })
  )
}

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function renderReplicas(onEncounterUnavailable = vi.fn()) {
  const rendered = renderHook(
    (props: {
      meta: Record<string, ParticipantMeta>
      rosterIds: ReturnType<typeof asParticipantId>[]
    }) =>
      useCombatReplicas({
        encounterId: "enc1",
        participantMeta: props.meta,
        rosterIds: props.rosterIds,
        onEncounterUnavailable,
      }),
    {
      initialProps: {
        meta,
        rosterIds: [pcParticipant, goblinParticipant],
      },
    }
  )
  return { rendered, onEncounterUnavailable }
}

beforeEach(() => {
  loadCombatAcceptedAction.mockReset()
  pushCombatDurableMutationAction.mockReset().mockResolvedValue(ok(undefined))
  pushCombatSessionMutationAction
    .mockReset()
    .mockResolvedValue(ok({ version: 2 }))
  primeBatch()
})

describe("useCombatReplicas", () => {
  it("keeps encounter intents unavailable until the accepted projection is ready", async () => {
    let resolveBootstrap!: (value: ReturnType<typeof ok>) => void
    loadCombatAcceptedAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve
        })
    )
    const { rendered } = renderReplicas()

    expect(rendered.result.current.encounterIntentReady).toBe(false)

    await act(async () => {
      resolveBootstrap(
        ok({
          encounter: encounterAccepted(0, 1),
          durable: { e1: durableAccepted(0, 1) },
        }) as ReturnType<typeof ok>
      )
    })

    expect(rendered.result.current.encounterIntentReady).toBe(true)
  })

  it("bootstraps only the draft Encounter root for setup", async () => {
    loadCombatAcceptedAction.mockResolvedValue(
      ok({ encounter: encounterAccepted(0, 0, 0, "draft"), durable: {} })
    )
    const rendered = renderHook(() =>
      useCombatReplicas({
        encounterId: "enc1",
        participantMeta: meta,
        rosterIds: [pcParticipant, goblinParticipant],
        includeDurableRoots: false,
        onEncounterUnavailable: vi.fn(),
      })
    )
    await flush()

    const requests = loadCombatAcceptedAction.mock.calls.map(
      ([input]) => input as { encounter?: unknown; durable?: unknown[] }
    )
    expect(requests.some((request) => request.encounter !== undefined)).toBe(
      true
    )
    expect(
      requests.every((request) => (request.durable?.length ?? 0) === 0)
    ).toBe(true)
    expect(rendered.result.current.durableReplicaSnapshots.size).toBe(0)
    expect(rendered.result.current.encounterReplicaSnapshot?.value.status).toBe(
      "draft"
    )
  })

  it("bootstraps every root through ONE batched action call", async () => {
    const { rendered } = renderReplicas()
    await flush()

    // The bootstrap batches BOTH roots into one call (per sync pass —
    // StrictMode double-invokes it; the transports' catch-up pulls then
    // refetch single roots through the same door).
    const batchCalls = loadCombatAcceptedAction.mock.calls.filter((call) => {
      const input = call[0] as { encounter?: unknown; durable?: unknown[] }
      return input.encounter !== undefined && (input.durable?.length ?? 0) > 0
    })
    expect(batchCalls.length).toBeGreaterThan(0)
    for (const call of batchCalls) {
      const input = call[0] as { encounterId: string; durable: unknown[] }
      expect(input.encounterId).toBe("enc1")
      expect(input.durable).toHaveLength(1)
    }
    expect(rendered.result.current.handleOf(pcParticipant)).toBeDefined()
    expect(rendered.result.current.handleOf(goblinParticipant)).toBeDefined()
  })

  it("retries a timed-out shared bootstrap with fresh requests and identities", async () => {
    vi.useFakeTimers()
    let mounted: ReturnType<typeof renderReplicas>["rendered"] | undefined
    try {
      let holdInitialBatch = true
      loadCombatAcceptedAction.mockImplementation(
        (request: {
          encounter?: { clientId: string }
          durable?: { entityId: string; identity: { clientId: string } }[]
        }) => {
          if (
            holdInitialBatch &&
            request.encounter !== undefined &&
            (request.durable?.length ?? 0) > 0
          ) {
            holdInitialBatch = false
            return new Promise(() => {})
          }
          return Promise.resolve(
            ok({
              ...(request.encounter
                ? { encounter: encounterAccepted(0, 1) }
                : {}),
              durable: Object.fromEntries(
                (request.durable ?? []).map(({ entityId }) => [
                  entityId,
                  durableAccepted(0, 1),
                ])
              ),
            })
          )
        }
      )

      const { rendered } = renderReplicas()
      mounted = rendered
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_250)
      })

      const requests = loadCombatAcceptedAction.mock.calls.map(
        ([request]) =>
          request as {
            encounter?: { clientId: string }
            durable?: {
              entityId: string
              identity: { clientId: string }
            }[]
          }
      )
      const initial = requests.find(
        (request) =>
          request.encounter !== undefined && (request.durable?.length ?? 0) > 0
      )!
      const durableRetry = requests.find(
        (request) =>
          request.encounter === undefined && request.durable?.length === 1
      )
      const encounterRetry = requests.find(
        (request) =>
          request.encounter !== undefined &&
          (request.durable?.length ?? 0) === 0
      )

      expect(durableRetry).toBeDefined()
      expect(encounterRetry).toBeDefined()
      expect(durableRetry!.durable![0]!.identity.clientId).not.toBe(
        initial.durable![0]!.identity.clientId
      )
      expect(encounterRetry!.encounter!.clientId).not.toBe(
        initial.encounter!.clientId
      )
    } finally {
      mounted?.unmount()
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it("routes a durable participant's write onto its entity replica", async () => {
    const { rendered } = renderReplicas()
    await flush()

    await act(async () => {
      const receipt = rendered.result.current
        .handleOf(pcParticipant)!
        .mutate(damage)
      await receipt.remote
    })

    const input = pushCombatDurableMutationAction.mock.calls[0]![0] as {
      entityId: string
      envelope: { invocation: { name: string; args: unknown } }
    }
    expect(input.entityId).toBe("e1")
    expect(input.envelope.invocation.name).toBe("combat.entity.write")
    expect(input.envelope.invocation.args).toEqual(damage)
    expect(pushCombatSessionMutationAction).not.toHaveBeenCalled()
  })

  it("routes an inline participant's write onto the encounter replica with its roster address", async () => {
    const { rendered } = renderReplicas()
    await flush()

    await act(async () => {
      const receipt = rendered.result.current
        .handleOf(goblinParticipant)!
        .mutate(damage)
      const remote = await receipt.remote
      expect(remote).toEqual(ok({ version: 2 }))
    })

    const input = pushCombatSessionMutationAction.mock.calls[0]![0] as {
      envelope: { invocation: { name: string; args: unknown } }
    }
    expect(input.envelope.invocation.name).toBe("encounter.writeInline")
    expect(input.envelope.invocation.args).toEqual({
      participantId: goblinParticipant,
      write: damage,
    })
    expect(pushCombatDurableMutationAction).not.toHaveBeenCalled()
  })

  it("derives named session invocations from the current projection and composes rapid intents", async () => {
    const { rendered } = renderReplicas()
    await flush()

    act(() => {
      const first = rendered.result.current.mutateEncounter(
        {
          kind: "adjustCounter",
          participantId: goblinParticipant,
          counter: "lumina",
          delta: 1,
        },
        { roundComplete: false }
      )
      const second = rendered.result.current.mutateEncounter(
        {
          kind: "adjustCounter",
          participantId: goblinParticipant,
          counter: "lumina",
          delta: 1,
        },
        { roundComplete: false }
      )
      expect(first.ok).toBe(true)
      expect(second.ok).toBe(true)
    })

    expect(
      rendered.result.current.encounterReplicaSnapshot?.value.session
        .participants[0]?.overlay.counters.lumina
    ).toBe(2)
    await flush()
    const invocations = pushCombatSessionMutationAction.mock.calls.map(
      ([input]) =>
        (input as { envelope: { invocation: { name: string } } }).envelope
          .invocation.name
    )
    expect(invocations).toEqual([
      "encounter.adjustCounter",
      "encounter.adjustCounter",
    ])
  })

  it("publishes synchronous local projection and accumulates back-to-back writes once", async () => {
    const { rendered } = renderReplicas()
    await flush()

    act(() => {
      rendered.result.current.handleOf(pcParticipant)!.mutate(damage)
      rendered.result.current.handleOf(pcParticipant)!.mutate(damage)
    })

    expect(
      rendered.result.current.durableReplicaSnapshots.get("e1")?.value
        .components.vitals?.damage
    ).toBe(4)
  })

  it("rolls back the replica projection after terminal rejection", async () => {
    pushCombatDurableMutationAction.mockResolvedValue(
      err({ kind: "rejected", error: "forbidden" })
    )
    const { rendered } = renderReplicas()
    await flush()

    let remote!: Promise<unknown>
    act(() => {
      const receipt = rendered.result.current
        .handleOf(pcParticipant)!
        .mutate(damage)
      remote = receipt.remote
    })
    expect(
      rendered.result.current.durableReplicaSnapshots.get("e1")?.value
        .components.vitals?.damage
    ).toBe(2)
    await act(async () => {
      await remote
    })

    expect(
      rendered.result.current.durableReplicaSnapshots.get("e1")?.value
        .components.vitals?.damage
    ).toBe(0)
  })

  it("removes a replay-conflicted prediction before its terminal outcome arrives", async () => {
    let resolvePush!: (value: ReturnType<typeof err>) => void
    pushCombatDurableMutationAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePush = resolve
        })
    )
    const { rendered } = renderReplicas()
    await flush()

    let remote!: Promise<unknown>
    act(() => {
      remote = rendered.result.current
        .handleOf(pcParticipant)!
        .mutate(damage).remote
    })
    expect(
      rendered.result.current.durableReplicaSnapshots.get("e1")?.value
        .components.vitals?.damage
    ).toBe(2)

    loadCombatAcceptedAction.mockResolvedValue(
      ok({
        durable: {
          e1: {
            value: { components: {} },
            through: 0,
            cursor: { vitals: 2 },
          },
        },
      })
    )
    act(() => rendered.result.current.onPcPing("e1", {}))
    await flush()

    const conflicted = rendered.result.current.durableReplicaSnapshots.get("e1")
    expect(conflicted?.value.components.vitals).toBeUndefined()
    expect(conflicted?.conflicts).toHaveLength(1)

    await act(async () => {
      resolvePush(err({ kind: "rejected", error: "capability-missing" }))
      await remote
    })
  })

  it("drops an expired projection until a fresh identity becomes ready", async () => {
    const { rendered } = renderReplicas()
    await flush()

    let resolveBootstrap!: (value: ReturnType<typeof ok>) => void
    loadCombatAcceptedAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve
        })
    )
    pushCombatDurableMutationAction.mockResolvedValueOnce(
      err({ kind: "unknown-client", received: 1 })
    )

    let remote!: Promise<unknown>
    act(() => {
      remote = rendered.result.current
        .handleOf(pcParticipant)!
        .mutate(damage).remote
    })
    await act(async () => {
      await remote
    })

    expect(rendered.result.current.durableReplicaSnapshots.has("e1")).toBe(
      false
    )

    await act(async () => {
      resolveBootstrap(
        ok({ durable: { e1: durableAccepted(0, 1, 0) } }) as ReturnType<
          typeof ok
        >
      )
    })
    await flush()

    expect(
      rendered.result.current.durableReplicaSnapshots.get("e1")?.value
        .components.vitals?.damage
    ).toBe(0)
  })

  it("exposes channel keys from meta and none for inline participants", async () => {
    const { rendered } = renderReplicas()
    expect(rendered.result.current.pcChannels).toEqual([
      { characterId: "e1", shortId: "pc-short" },
    ])
    await flush()
    expect(rendered.result.current.handleOf(goblinParticipant)!.channel).toBe(
      null
    )
  })

  it("publishes an accepted advance without requesting a route refresh", async () => {
    const { rendered, onEncounterUnavailable } = renderReplicas()
    await flush()
    expect(onEncounterUnavailable).not.toHaveBeenCalled()

    loadCombatAcceptedAction.mockResolvedValue(
      ok({ durable: { e1: durableAccepted(1, 3, 5) } })
    )
    await act(async () => {
      rendered.result.current.onPcPing("e1", {})
    })
    await flush()
    expect(
      rendered.result.current.durableReplicaSnapshots.get("e1")?.value
        .components.vitals?.damage
    ).toBe(5)
    expect(onEncounterUnavailable).not.toHaveBeenCalled()
  })

  it("publishes the bootstrap projections without a route refresh", async () => {
    const { rendered, onEncounterUnavailable } = renderReplicas()
    await flush()
    expect(rendered.result.current.encounterReplicaSnapshot).not.toBeNull()
    expect(rendered.result.current.durableReplicaSnapshots.has("e1")).toBe(true)
    expect(onEncounterUnavailable).not.toHaveBeenCalled()
  })

  it("keeps ready controllers across an unchanged parent rerender", async () => {
    const { rendered } = renderReplicas()
    await flush()
    const bootstrapCalls = loadCombatAcceptedAction.mock.calls.length

    rendered.rerender({
      meta: { ...meta },
      rosterIds: [pcParticipant, goblinParticipant],
    })
    await flush()

    expect(loadCombatAcceptedAction).toHaveBeenCalledTimes(bootstrapCalls)
    expect(rendered.result.current.handleOf(pcParticipant)).toBeDefined()
  })

  it("refreshes after terminal encounter unavailability is published", async () => {
    loadCombatAcceptedAction.mockResolvedValue(err("encounter-not-live"))
    const { onEncounterUnavailable } = renderReplicas()

    await flush()

    expect(onEncounterUnavailable).toHaveBeenCalled()
  })

  it("disposes a removed durable participant's replica and refuses its handle", async () => {
    const { rendered } = renderReplicas()
    await flush()
    expect(rendered.result.current.handleOf(pcParticipant)).toBeDefined()

    rendered.rerender({
      meta: { [goblinParticipant]: { storage: "inline" } },
      rosterIds: [goblinParticipant],
    })
    await flush()

    expect(rendered.result.current.handleOf(pcParticipant)).toBeUndefined()
    expect(rendered.result.current.handleOf(goblinParticipant)).toBeDefined()
    expect(rendered.result.current.durableReplicaSnapshots.has("e1")).toBe(
      false
    )
  })

  it("removes a participant handle from the active roster before loader meta catches up", async () => {
    const { rendered } = renderReplicas()
    await flush()

    rendered.rerender({ meta, rosterIds: [goblinParticipant] })
    await flush()

    expect(rendered.result.current.handleOf(pcParticipant)).toBeUndefined()
    expect(rendered.result.current.durableReplicaSnapshots.has("e1")).toBe(
      false
    )
  })

  it("bootstraps a late joiner without touching existing replicas", async () => {
    const { rendered } = renderReplicas()
    await flush()
    const callsAfterMount = loadCombatAcceptedAction.mock.calls.length

    loadCombatAcceptedAction.mockResolvedValue(
      ok({ durable: { e2: durableAccepted(0, 1) } })
    )
    const joiner = asParticipantId("p-late")
    rendered.rerender({
      meta: {
        ...meta,
        [joiner]: {
          storage: "durable",
          characterId: "e2",
          characterShortId: "late-short",
        },
      },
      rosterIds: [pcParticipant, goblinParticipant, joiner],
    })
    await flush()

    // The joiner's bootstrap (and its transport's catch-up pull) fetch only
    // the NEW root — no re-registration, no touching existing replicas.
    const lateCalls = loadCombatAcceptedAction.mock.calls.slice(callsAfterMount)
    expect(lateCalls.length).toBeGreaterThan(0)
    for (const call of lateCalls) {
      const input = call[0] as {
        encounter?: unknown
        durable?: { entityId: string }[]
      }
      expect(input.encounter).toBeUndefined()
      expect(input.durable?.map((entry) => entry.entityId)).toEqual(["e2"])
    }
    expect(rendered.result.current.handleOf(joiner)).toBeDefined()
  })
})
