// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

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

const durableAccepted = (through: number, vitals: number) => ({
  value: { components: { vitals: { base: 20, damage: 0 } } },
  through,
  cursor: { vitals },
})

const inlineAccepted = (through: number, version: number) => ({
  value: {
    participants: { [goblinParticipant]: { vitals: { base: 8, damage: 0 } } },
  },
  through,
  cursor: version,
})

function primeBatch(through = 0) {
  loadCombatAcceptedAction.mockResolvedValue(
    ok({
      inline: inlineAccepted(through, 1),
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

function renderReplicas(onExternalChange = vi.fn()) {
  const rendered = renderHook(
    (props: { meta: Record<string, ParticipantMeta> }) =>
      useCombatReplicas({
        encounterId: "enc1",
        participantMeta: props.meta,
        rosterIds: [pcParticipant, goblinParticipant],
        onExternalChange,
      }),
    { initialProps: { meta } }
  )
  return { rendered, onExternalChange }
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
  it("bootstraps every root through ONE batched action call", async () => {
    const { rendered } = renderReplicas()
    await flush()

    // The bootstrap batches BOTH roots into one call (per sync pass —
    // StrictMode double-invokes it; the transports' catch-up pulls then
    // refetch single roots through the same door).
    const batchCalls = loadCombatAcceptedAction.mock.calls.filter((call) => {
      const input = call[0] as { inline?: unknown; durable?: unknown[] }
      return input.inline !== undefined && (input.durable?.length ?? 0) > 0
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
          inline?: { clientId: string }
          durable?: { entityId: string; identity: { clientId: string } }[]
        }) => {
          if (
            holdInitialBatch &&
            request.inline !== undefined &&
            (request.durable?.length ?? 0) > 0
          ) {
            holdInitialBatch = false
            return new Promise(() => {})
          }
          return Promise.resolve(
            ok({
              ...(request.inline ? { inline: inlineAccepted(0, 1) } : {}),
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
            inline?: { clientId: string }
            durable?: {
              entityId: string
              identity: { clientId: string }
            }[]
          }
      )
      const initial = requests.find(
        (request) =>
          request.inline !== undefined && (request.durable?.length ?? 0) > 0
      )!
      const durableRetry = requests.find(
        (request) =>
          request.inline === undefined && request.durable?.length === 1
      )
      const inlineRetry = requests.find(
        (request) =>
          request.inline !== undefined && (request.durable?.length ?? 0) === 0
      )

      expect(durableRetry).toBeDefined()
      expect(inlineRetry).toBeDefined()
      expect(durableRetry!.durable![0]!.identity.clientId).not.toBe(
        initial.durable![0]!.identity.clientId
      )
      expect(inlineRetry!.inline!.clientId).not.toBe(initial.inline!.clientId)
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

  it("routes an inline participant's write onto the session replica with its roster address", async () => {
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
    expect(input.envelope.invocation.name).toBe("combat.session.write")
    expect(input.envelope.invocation.args).toEqual({
      participantId: goblinParticipant,
      write: damage,
    })
    expect(pushCombatDurableMutationAction).not.toHaveBeenCalled()
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

  it("refreshes on an accepted advance whose watermark ALSO advanced", async () => {
    const { rendered, onExternalChange } = renderReplicas()
    await flush()
    expect(onExternalChange).not.toHaveBeenCalled()

    // The case the old watermark rule got wrong. `through` advancing says our
    // own mutation was incorporated; it says NOTHING about whether the same
    // accepted tuple also carries another identity's change — and here it
    // does (the cursor jumped two versions, not one). Suppressing the refresh
    // left the console's separate RSC container on a frame that predates the
    // other writer, with no later event to correct it.
    loadCombatAcceptedAction.mockResolvedValue(
      ok({ durable: { e1: durableAccepted(1, 3) } })
    )
    await act(async () => {
      rendered.result.current.onPcPing("e1", {})
    })
    await flush()
    expect(onExternalChange).toHaveBeenCalledTimes(1)
  })

  it("refreshes on an accepted advance whose watermark held", async () => {
    const { rendered, onExternalChange } = renderReplicas()
    await flush()

    loadCombatAcceptedAction.mockResolvedValue(
      ok({ durable: { e1: durableAccepted(0, 2) } })
    )
    await act(async () => {
      rendered.result.current.onPcPing("e1", {})
    })
    await flush()
    expect(onExternalChange).toHaveBeenCalledTimes(1)
  })

  it("stays quiet at mount — the bootstrap tuple is not an advance", async () => {
    const { onExternalChange } = renderReplicas()
    await flush()
    // The accepted floor arrives as the replica's `initial`, never as a
    // snapshot event, and the transport's causal gate drops the catch-up
    // pull as a duplicate. Unconditional refresh therefore costs nothing at
    // mount — the bound that makes dropping the watermark rule affordable.
    expect(onExternalChange).not.toHaveBeenCalled()
  })

  it("refreshes after terminal encounter unavailability is published", async () => {
    loadCombatAcceptedAction.mockResolvedValue(err("encounter-not-live"))
    const { onExternalChange } = renderReplicas()

    await flush()

    expect(onExternalChange).toHaveBeenCalled()
  })

  it("disposes a removed durable participant's replica and refuses its handle", async () => {
    const { rendered } = renderReplicas()
    await flush()
    expect(rendered.result.current.handleOf(pcParticipant)).toBeDefined()

    rendered.rerender({
      meta: { [goblinParticipant]: { storage: "inline" } },
    })
    await flush()

    expect(rendered.result.current.handleOf(pcParticipant)).toBeUndefined()
    expect(rendered.result.current.handleOf(goblinParticipant)).toBeDefined()
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
    })
    await flush()

    // The joiner's bootstrap (and its transport's catch-up pull) fetch only
    // the NEW root — no re-registration, no touching existing replicas.
    const lateCalls = loadCombatAcceptedAction.mock.calls.slice(callsAfterMount)
    expect(lateCalls.length).toBeGreaterThan(0)
    for (const call of lateCalls) {
      const input = call[0] as {
        inline?: unknown
        durable?: { entityId: string }[]
      }
      expect(input.inline).toBeUndefined()
      expect(input.durable?.map((entry) => entry.entityId)).toEqual(["e2"])
    }
    expect(rendered.result.current.handleOf(joiner)).toBeDefined()
  })
})
