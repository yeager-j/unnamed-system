import { describe, expect, it } from "vitest"

import { resolveEntity } from "@/domain/game-engine-v2"
import {
  SEED_CHARACTERS,
  seedCharacterToEntity,
} from "@/lib/__fixtures__/seed-characters"

import {
  entityFinalize,
  entityIdentity,
  entityIdentityArgs,
  entityProtocol,
  entityWrite,
  entityWriteArgs,
  type EntityCanonValue,
} from "./protocol"

const SEED_IDENTITY = {
  name: "Ortus",
  pronouns: "they/them",
  portraitUrl: null,
  notes: null,
}

function seedState(slug: string): EntityCanonValue {
  const entity = seedCharacterToEntity(
    SEED_CHARACTERS.find((c) => c.slug === slug)!
  )
  return {
    entity,
    resolved: resolveEntity(entity),
    identity: { ...SEED_IDENTITY },
  }
}

describe("entity protocol registration", () => {
  it("registers all three write species under one versioned protocol id", () => {
    expect(entityProtocol.id).toBe("showtime.entity.v1")
    expect(entityProtocol.mutationsByName["entity.write"]).toBe(entityWrite)
    expect(entityProtocol.mutationsByName["entity.identity"]).toBe(
      entityIdentity
    )
    expect(entityProtocol.mutationsByName["entity.finalize"]).toBe(
      entityFinalize
    )
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

describe("entity.finalize predictor", () => {
  it("keeps a valid draft unchanged while joining the ordered mutation queue", () => {
    const seeded = seedState("warrior")
    const state = {
      ...seeded,
      entity: {
        ...seeded.entity,
        components: {
          ...seeded.entity.components,
          virtues: {
            ranks: { expression: 2, empathy: 1, wisdom: 1, focus: 0 },
            sparkLog: [],
          },
        },
      },
    }
    const result = entityFinalize.predict(state, { entityId: state.entity.id })

    expect(result).toEqual({ ok: true, value: state })
  })

  it("refuses an incomplete visible draft before delivery", () => {
    const state = seedState("warrior")
    state.entity.components.archetypes = undefined

    const result = entityFinalize.predict(state, { entityId: state.entity.id })

    expect(result).toMatchObject({
      ok: false,
      error: "missing-finalize-requirement",
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

  it("carries the identity columns through untouched", () => {
    const state = seedState("warrior")
    const result = entityWrite.predict(state, {
      entityId: state.entity.id,
      write: { component: "vitals", op: "damage", amount: 1 },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.identity).toEqual(SEED_IDENTITY)
  })
})

describe("entity.identity wire (AC #2)", () => {
  it("carries one field per invocation and no expected revision", () => {
    const parsed = entityIdentityArgs.parse({
      entityId: "e1",
      write: { field: "name", value: "  Vela  " },
      expectedVersion: 7,
      pronouns: "she/her",
    })
    expect(parsed).toEqual({
      entityId: "e1",
      write: { field: "name", value: "Vela" },
    })
    expect(Object.keys(parsed).sort()).toEqual(["entityId", "write"])
  })

  it("rejects a write that names no field", () => {
    expect(
      entityIdentityArgs.safeParse({
        entityId: "e1",
        write: { name: "Vela", pronouns: "she/her" },
      }).success
    ).toBe(false)
  })
})

describe("entity.identity predictor", () => {
  it("replaces only the submitted column", () => {
    const state = seedState("warrior")

    const result = entityIdentity.predict(state, {
      entityId: state.entity.id,
      write: { field: "pronouns", value: "she/her" },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.identity).toEqual({
      ...SEED_IDENTITY,
      pronouns: "she/her",
    })
    // Pure: the input state is untouched, and the entity half is shared by
    // reference rather than re-derived — an identity write resolves nothing.
    expect(state.identity.pronouns).toBe("they/them")
    expect(result.value.entity).toBe(state.entity)
    expect(result.value.resolved).toBe(state.resolved)
  })

  it("canonicalizes a cleared optional column to null, as the authority does", () => {
    const state = seedState("warrior")

    const cleared = entityIdentity.predict(state, {
      entityId: state.entity.id,
      write: { field: "pronouns", value: "   " },
    })

    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.value.identity.pronouns).toBeNull()
  })
})
