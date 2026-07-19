import { describe, expect, it } from "vitest"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { applyEntityWrite } from "../../entity/commit/writers"
import {
  combatDurableMutations,
  combatInlineMutations,
  pickCombatComponents,
  writeCombatEntity,
  writeCombatInline,
  type CombatDurableState,
  type CombatInlineState,
} from "./mutations"

const vitals = { base: 20, damage: 4 }
const skillPool = { base: 10, spSpent: 2 }

const durableState: CombatDurableState = { components: { vitals, skillPool } }

const inlineState: CombatInlineState = {
  participants: {
    "p-goblin": { vitals: { base: 8, damage: 0 } },
    "p-ogre": { vitals: { base: 30, damage: 5 } },
  },
}

const damage = (amount: number) =>
  ({ component: "vitals", op: "damage", amount }) as const

describe("writeCombatEntity (durable root)", () => {
  it("applies through the same Writer the authority commits with", () => {
    const invocation = writeCombatEntity(damage(3))
    const definition = combatDurableMutations.get(invocation.name)!
    const applied = definition.apply(durableState, invocation.args, {
      phase: "optimistic",
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return

    const expected = applyEntityWrite(durableState.components, damage(3))
    expect(applied.value.components.vitals).toEqual(
      expected.ok ? expected.value.vitals : undefined
    )
    expect(applied.value.components.skillPool).toEqual(skillPool)
  })

  it("surfaces the Writer's refusal verbatim", () => {
    const invocation = writeCombatEntity(damage(3))
    const definition = combatDurableMutations.get(invocation.name)!
    const applied = definition.apply({ components: {} }, invocation.args, {
      phase: "rebase",
    })
    expect(applied).toEqual({ ok: false, error: "capability-missing" })
  })

  it("decodes only the combat subset — a character-only arm is refused at the registry", () => {
    const decoded = combatDurableMutations.decode({
      name: "combat.entity.write",
      args: { component: "rest", op: "fullRest" },
    })
    expect(decoded.ok).toBe(false)
  })

  it("does not admit the owner door's mutation names", () => {
    const decoded = combatDurableMutations.decode({
      name: "entity.write",
      args: damage(1),
    })
    expect(decoded.ok).toBe(false)
  })
})

describe("writeCombatInline (collection-valued root)", () => {
  it("applies to exactly the addressed participant", () => {
    const invocation = writeCombatInline({
      participantId: "p-goblin" as ParticipantId,
      write: damage(2),
    })
    const definition = combatInlineMutations.get(invocation.name)!
    const applied = definition.apply(inlineState, invocation.args, {
      phase: "optimistic",
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.value.participants["p-goblin"]?.vitals).toEqual({
      base: 8,
      damage: 2,
    })
    expect(applied.value.participants["p-ogre"]).toEqual(
      inlineState.participants["p-ogre"]
    )
  })

  it("refuses an unknown participant — the roster-change rebase conflict", () => {
    const invocation = writeCombatInline({
      participantId: "p-vanished" as ParticipantId,
      write: damage(2),
    })
    const definition = combatInlineMutations.get(invocation.name)!
    const applied = definition.apply(inlineState, invocation.args, {
      phase: "rebase",
    })
    expect(applied).toEqual({ ok: false, error: "participant-not-found" })
  })

  it("does not admit the durable mutation name", () => {
    const decoded = combatInlineMutations.decode({
      name: "combat.entity.write",
      args: damage(1),
    })
    expect(decoded.ok).toBe(false)
  })
})

describe("pickCombatComponents (the structural redaction)", () => {
  it("keeps exactly the combat-writable components and drops the rest structurally", () => {
    const picked = pickCombatComponents({
      vitals,
      skillPool,
      narrative: { openDoors: [] } as never,
      equipment: { items: [], currency: 9 } as never,
    })
    expect(picked).toEqual({ vitals, skillPool })
    expect("narrative" in picked).toBe(false)
    expect("equipment" in picked).toBe(false)
  })

  it("absent components stay structurally absent, never undefined-valued", () => {
    const picked = pickCombatComponents({ vitals })
    expect("skillPool" in picked).toBe(false)
    expect("mechanics" in picked).toBe(false)
  })
})
