import { describe, expect, it } from "vitest"

import { resolveEntity } from "@/domain/game-engine-v2"
import {
  SEED_CHARACTERS,
  seedCharacterToEntity,
} from "@/lib/__fixtures__/seed-characters"

import {
  entityProtocol,
  entityWrite,
  entityWriteArgs,
  type EntityCanonValue,
} from "./protocol"

function seedState(slug: string): EntityCanonValue {
  const entity = seedCharacterToEntity(
    SEED_CHARACTERS.find((c) => c.slug === slug)!
  )
  return { entity, resolved: resolveEntity(entity) }
}

describe("entity protocol registration", () => {
  it("registers entity.write under a versioned protocol id", () => {
    expect(entityProtocol.id).toBe("showtime.entity.v1")
    expect(entityProtocol.mutationsByName["entity.write"]).toBe(entityWrite)
  })

  it("factories an invocation carrying only name + args", () => {
    const invocation = entityWrite({
      entityId: "e1",
      write: { component: "vitals", op: "damage", amount: 2 },
    })
    expect(invocation).toEqual({
      name: "entity.write",
      args: {
        entityId: "e1",
        write: { component: "vitals", op: "damage", amount: 2 },
      },
    })
  })
})

describe("entity.write wire (AC #5)", () => {
  it("carries no expected revision, lane, axis, actor, or storage-home", () => {
    // The args schema strips anything the client tries to smuggle onto the wire.
    const parsed = entityWriteArgs.parse({
      entityId: "e1",
      write: { component: "vitals", op: "damage", amount: 2 },
      expectedVersion: 7,
      lane: "vitals",
      axis: "entity/e1/vitals",
    })
    expect(parsed).toEqual({
      entityId: "e1",
      write: { component: "vitals", op: "damage", amount: 2 },
    })
    expect(Object.keys(parsed).sort()).toEqual(["entityId", "write"])
  })
})

describe("entity.write predictor", () => {
  it("folds a valid write through the shared Writer + resolve pipeline", () => {
    const state = seedState("warrior")
    const before = state.resolved.components.vitals?.currentHP

    const result = entityWrite.predict(state, {
      entityId: state.entity.id,
      write: { component: "vitals", op: "damage", amount: 2 },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const after = result.value.resolved.components.vitals?.currentHP
    expect(after).toBe((before ?? 0) - 2)
    // Pure: the input state is untouched.
    expect(state.resolved.components.vitals?.currentHP).toBe(before)
  })

  it("is deterministic over its visible state", () => {
    const state = seedState("warrior")
    const args = {
      entityId: state.entity.id,
      write: { component: "vitals", op: "damage", amount: 3 },
    } as const
    const a = entityWrite.predict(state, args)
    const b = entityWrite.predict(state, args)
    expect(a).toEqual(b)
  })
})
