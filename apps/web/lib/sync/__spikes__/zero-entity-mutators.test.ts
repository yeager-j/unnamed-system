import { describe, expect, it } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"

import { entityMutators } from "./zero-entity-mutators"
import { createMockZeroHarness } from "./zero-mock"

const entity: Entity = {
  id: "character-1",
  components: { vitals: { base: 10, damage: 0 } },
}

const damage = (amount: number) =>
  entityMutators.entity.write({
    entityId: entity.id,
    write: { component: "vitals", op: "damage", amount },
  })

const damageTaken = (current: Entity): number =>
  current.components.vitals?.damage ?? 0

describe("Zero-shaped entity mutator spike (UNN-638)", () => {
  it("keeps mutation identity, versions, and queue selection out of caller code", async () => {
    const harness = createMockZeroHarness({
      clientID: "tab-a",
      initialState: entity,
      mutators: entityMutators,
    })

    const mutation = harness.zero.mutate(damage(2))

    expect(await mutation.client).toEqual({ type: "success" })
    expect(damageTaken(harness.zero.read())).toBe(2)
    expect(harness.pendingEnvelopes()).toEqual([
      {
        clientID: "tab-a",
        id: 1,
        name: "entity.write",
        args: {
          entityId: "character-1",
          write: { component: "vitals", op: "damage", amount: 2 },
        },
      },
    ])
  })

  it("applies a redelivered mutation exactly once", async () => {
    const harness = createMockZeroHarness({
      clientID: "tab-a",
      initialState: entity,
      mutators: entityMutators,
    })
    const mutation = harness.zero.mutate(damage(2))
    await mutation.client

    expect(await harness.processNext()).toEqual({ type: "success" })
    expect(await mutation.server).toEqual({ type: "success" })
    expect(damageTaken(harness.readServer())).toBe(2)

    expect(await harness.redeliver(1)).toEqual({ type: "success" })
    expect(damageTaken(harness.readServer())).toBe(2)
  })

  it("serializes back-to-back local mutators behind the interface", async () => {
    const harness = createMockZeroHarness({
      clientID: "tab-a",
      initialState: entity,
      mutators: entityMutators,
    })

    const first = harness.zero.mutate(damage(2))
    const second = harness.zero.mutate(damage(3))

    expect(await first.client).toEqual({ type: "success" })
    expect(await second.client).toEqual({ type: "success" })
    expect(damageTaken(harness.zero.read())).toBe(5)
    expect(harness.pendingEnvelopes().map(({ id }) => id)).toEqual([1, 2])
  })

  it("rebases a pending Writer over an external authoritative change", async () => {
    const harness = createMockZeroHarness({
      clientID: "tab-a",
      initialState: entity,
      mutators: entityMutators,
    })
    const mutation = harness.zero.mutate(damage(2))
    await mutation.client
    expect(damageTaken(harness.zero.read())).toBe(2)

    expect(await harness.commitExternal(damage(3))).toEqual({
      type: "success",
    })
    await harness.publish()

    expect(damageTaken(harness.readServer())).toBe(3)
    expect(damageTaken(harness.zero.read())).toBe(5)

    await harness.processNext()
    expect(await mutation.server).toEqual({ type: "success" })
    expect(damageTaken(harness.readServer())).toBe(5)

    await harness.publish()
    expect(damageTaken(harness.zero.read())).toBe(5)
    expect(harness.pendingEnvelopes()).toEqual([])
  })

  it("rolls back a refused optimistic mutation before it reaches the outbox", async () => {
    const withoutVitals: Entity = { id: entity.id, components: {} }
    const harness = createMockZeroHarness({
      clientID: "tab-a",
      initialState: withoutVitals,
      mutators: entityMutators,
    })

    const mutation = harness.zero.mutate(damage(1))

    expect(await mutation.client).toEqual({
      type: "error",
      error: { type: "app", message: "capability-missing" },
    })
    expect(await mutation.server).toEqual({
      type: "error",
      error: { type: "app", message: "capability-missing" },
    })
    expect(harness.zero.read()).toEqual(withoutVitals)
    expect(harness.pendingEnvelopes()).toEqual([])
  })
})
