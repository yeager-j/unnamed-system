import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { defaultOverlay, type SessionShell } from "@workspace/game-v2/encounter"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"

import type { CombatEntityWrite } from "../../entity/commit/write.schema"
import { applyEntityWrite } from "../../entity/commit/writers"
import {
  adjustEncounterCounter,
  combatDurableMutations,
  createEncounterSessionInvocation,
  draftEncounterCombatant,
  encounterMutations,
  endEncounterTurn,
  pickCombatComponents,
  writeCombatEntity,
  writeEncounterInline,
  type CombatDurableState,
  type EncounterReplicaState,
} from "./mutations"

const vitals = { base: 20, damage: 4 }
const skillPool = { base: 10, spSpent: 2 }

const durableState: CombatDurableState = { components: { vitals, skillPool } }

function shellWith(participants: SessionShell["participants"]): SessionShell {
  return {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants,
  }
}

function inlineShellParticipant(
  id: string,
  components: Record<string, unknown>
) {
  return {
    id: asParticipantId(id),
    entity: {
      storage: "inline" as const,
      entity: { id: `${id}-entity`, components },
    },
    overlay: defaultOverlay({ side: "enemies" as const }),
  }
}

const goblin = inlineShellParticipant("p-goblin", {
  vitals: { base: 8, damage: 0 },
})
const ogre = inlineShellParticipant("p-ogre", {
  vitals: { base: 30, damage: 5 },
})
const durablePc = {
  id: asParticipantId("p-pc"),
  entity: { storage: "durable" as const, entityId: "pc-1" },
  overlay: defaultOverlay({ side: "players" as const }),
}

const liveState: EncounterReplicaState = {
  status: "live",
  session: shellWith([durablePc, goblin, ogre]),
}

const damage = (amount: number) =>
  ({ component: "vitals", op: "damage", amount }) as const

function applyEncounter(
  state: EncounterReplicaState,
  participantId: string,
  write: CombatEntityWrite,
  phase: "optimistic" | "rebase" = "optimistic"
) {
  const invocation = writeEncounterInline({
    participantId: participantId as ParticipantId,
    write,
  })
  const definition = encounterMutations.get(invocation.name)!
  return definition.apply(state, invocation.args, { phase })
}

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

describe("writeEncounterInline (storage-native encounter root)", () => {
  it("applies to exactly the addressed inline participant, preserving order and scalars", () => {
    const applied = applyEncounter(liveState, "p-goblin", damage(2))
    expect(applied.ok).toBe(true)
    if (!applied.ok) return

    expect(applied.value.status).toBe("live")
    expect(
      applied.value.session.participants.map((participant) => participant.id)
    ).toEqual(["p-pc", "p-goblin", "p-ogre"])
    const [pc, hitGoblin, sameOgre] = applied.value.session.participants
    expect(pc).toBe(liveState.session.participants[0])
    expect(sameOgre).toBe(liveState.session.participants[2])
    expect(
      hitGoblin?.entity.storage === "inline"
        ? hitGoblin.entity.entity.components["vitals"]
        : undefined
    ).toEqual({ base: 8, damage: 2 })
    expect(applied.value.session.round).toBe(1)
  })

  it("preserves non-combat inline components untouched by the write", () => {
    const scribe = inlineShellParticipant("p-scribe", {
      vitals: { base: 6, damage: 0 },
      presentation: { portraitUrl: "https://blob.example/scribe.png" },
    })
    const state: EncounterReplicaState = {
      status: "live",
      session: shellWith([scribe]),
    }
    const applied = applyEncounter(state, "p-scribe", damage(1))
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    const shell = applied.value.session.participants[0]
    expect(
      shell?.entity.storage === "inline"
        ? shell.entity.entity.components["presentation"]
        : undefined
    ).toEqual({ portraitUrl: "https://blob.example/scribe.png" })
  })

  it("refuses an unknown participant — the roster-change rebase conflict", () => {
    const applied = applyEncounter(liveState, "p-vanished", damage(2), "rebase")
    expect(applied).toEqual({ ok: false, error: "participant-not-found" })
  })

  it("refuses a durable-addressed write — the home is the stored locator's fact", () => {
    const applied = applyEncounter(liveState, "p-pc", damage(2))
    expect(applied).toEqual({ ok: false, error: "participant-not-inline" })
  })

  it.each(["draft", "ended"] as const)(
    "refuses when the encounter is %s — liveness decided in the apply",
    (status) => {
      const applied = applyEncounter(
        { ...liveState, status },
        "p-goblin",
        damage(2)
      )
      expect(applied).toEqual({ ok: false, error: "encounter-not-live" })
    }
  )

  it("surfaces the Writer's refusal verbatim", () => {
    const bare = inlineShellParticipant("p-bare", {})
    const state: EncounterReplicaState = {
      status: "live",
      session: shellWith([bare]),
    }
    const applied = applyEncounter(state, "p-bare", damage(1))
    expect(applied).toEqual({ ok: false, error: "capability-missing" })
  })

  it("does not admit the durable mutation name", () => {
    const decoded = encounterMutations.decode({
      name: "combat.entity.write",
      args: damage(1),
    })
    expect(decoded.ok).toBe(false)
  })

  it("does not admit the retired inline wire name", () => {
    const decoded = encounterMutations.decode({
      name: "combat.session.write",
      args: {
        participantId: "p-goblin",
        write: damage(1),
      },
    })
    expect(decoded.ok).toBe(false)
  })
})

describe("Encounter session intent mutations", () => {
  it("exposes a stable named invocation for every migrated event family", () => {
    const events = [
      { kind: "draftCombatant", participantId: goblin.id },
      { kind: "setSide", participantId: goblin.id, side: "players" },
      { kind: "setCurrentActor", participantId: goblin.id },
      { kind: "setActed", participantId: goblin.id, hasActed: true },
      { kind: "setRound", round: 2 },
      {
        kind: "adjustBattleConditionAxis",
        participantId: goblin.id,
        axis: "attack",
        action: "increase",
      },
      {
        kind: "setBattleConditionFlag",
        participantId: goblin.id,
        flag: "charged",
        value: true,
      },
      { kind: "setAilment", participantId: goblin.id, ailment: "burn" },
      { kind: "clearAilment", participantId: goblin.id, ailment: "burn" },
      {
        kind: "adjustCounter",
        participantId: goblin.id,
        counter: "lumina",
        delta: 1,
      },
      { kind: "clearCounter", participantId: goblin.id, counter: "lumina" },
      {
        kind: "adjustActionEconomy",
        participantId: goblin.id,
        action: "move",
        delta: 1,
      },
    ] as const

    const names = events.map((event) => {
      const invocation = createEncounterSessionInvocation(liveState, event, {
        roundComplete: false,
      })
      expect(invocation.ok).toBe(true)
      return invocation.ok ? invocation.value.name : ""
    })

    expect(names).toEqual([
      "encounter.draftCombatant",
      "encounter.setSide",
      "encounter.setCurrentActor",
      "encounter.setActed",
      "encounter.setRound",
      "encounter.adjustBattleConditionAxis",
      "encounter.setBattleConditionFlag",
      "encounter.setAilment",
      "encounter.clearAilment",
      "encounter.adjustCounter",
      "encounter.clearCounter",
      "encounter.adjustActionEconomy",
    ])
  })

  it("preserves root identity for an accepted desired-value no-op", () => {
    const invocation = createEncounterSessionInvocation(
      liveState,
      { kind: "setSide", participantId: goblin.id, side: "enemies" },
      { roundComplete: false }
    )
    expect(invocation.ok).toBe(true)
    if (!invocation.ok) return
    const definition = encounterMutations.get(invocation.value.name)!
    const applied = definition.apply(liveState, invocation.value.args, {
      phase: "optimistic",
    })
    expect(applied).toEqual({ ok: true, value: liveState })
  })

  it("composes additive invocations and replays them over a newer base", () => {
    const invocation = adjustEncounterCounter({
      participantId: goblin.id,
      counter: "lumina",
      delta: 2,
    })
    const definition = encounterMutations.get(invocation.name)!
    const first = definition.apply(liveState, invocation.args, {
      phase: "optimistic",
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const second = definition.apply(first.value, invocation.args, {
      phase: "optimistic",
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    const replayed = definition.apply(
      {
        ...liveState,
        session: { ...liveState.session, round: 4 },
      },
      invocation.args,
      { phase: "rebase" }
    )
    expect(replayed.ok).toBe(true)
    expect(second.value.session.participants[1]?.overlay.counters.lumina).toBe(
      4
    )
    expect(replayed.ok && replayed.value.session.round).toBe(4)
  })

  it("refuses turn and draft intent when the observed frame changed", () => {
    const active = {
      ...liveState,
      session: { ...liveState.session, currentActorId: goblin.id },
    }
    const end = endEncounterTurn({
      expected: {
        round: 1,
        currentActorId: goblin.id,
        actorId: goblin.id,
        turnsTakenThisRound: 0,
      },
    })
    const endDefinition = encounterMutations.get(end.name)!
    expect(
      endDefinition.apply(
        { ...active, session: { ...active.session, round: 2 } },
        end.args,
        { phase: "rebase" }
      )
    ).toEqual({ ok: false, error: "turn-frame-changed" })

    const draft = draftEncounterCombatant({
      participantId: goblin.id,
      expected: {
        round: 1,
        currentActorId: null,
        side: "enemies",
        turnsTakenThisRound: 0,
      },
    })
    const draftDefinition = encounterMutations.get(draft.name)!
    expect(
      draftDefinition.apply(
        { ...liveState, session: { ...liveState.session, round: 2 } },
        draft.args,
        { phase: "rebase" }
      )
    ).toEqual({ ok: false, error: "draft-no-longer-valid" })
  })

  it("allows setSide in draft but refuses every intent after end", () => {
    const side = createEncounterSessionInvocation(
      { ...liveState, status: "draft" },
      { kind: "setSide", participantId: goblin.id, side: "players" },
      { roundComplete: false }
    )
    expect(side.ok).toBe(true)
    if (!side.ok) return
    const definition = encounterMutations.get(side.value.name)!
    expect(
      definition.apply({ ...liveState, status: "draft" }, side.value.args, {
        phase: "optimistic",
      }).ok
    ).toBe(true)
    expect(
      definition.apply({ ...liveState, status: "ended" }, side.value.args, {
        phase: "rebase",
      })
    ).toEqual({ ok: false, error: "encounter-ended" })
  })
})

function writerApply(
  state: EncounterReplicaState,
  participantId: ParticipantId,
  write: CombatEntityWrite
) {
  const addressed = state.session.participants.find(
    (participant) => participant.id === participantId
  )
  if (addressed?.entity.storage !== "inline") {
    throw new Error("writer comparison expects an inline participant")
  }
  const validated = applyEntityWrite(addressed.entity.entity.components, write)
  if (!validated.ok) return validated
  return {
    ok: true as const,
    value: {
      ...addressed.entity.entity.components,
      ...validated.value,
    },
  }
}

describe("writeEncounterInline applies the shared Writer contract", () => {
  const participantId = asParticipantId("p-target")

  const arbitraryComponents = fc.record(
    {
      vitals: fc.record({
        base: fc.integer({ min: 1, max: 60 }),
        damage: fc.integer({ min: -20, max: 80 }),
      }),
      skillPool: fc.record({
        base: fc.integer({ min: 1, max: 30 }),
        spSpent: fc.integer({ min: 0, max: 40 }),
      }),
    },
    { requiredKeys: [] }
  )

  const arbitraryPoolWrite: fc.Arbitrary<CombatEntityWrite> = fc.record({
    component: fc.constantFrom("vitals" as const, "skillPool" as const),
    op: fc.constantFrom("damage" as const, "heal" as const, "setMax" as const),
    amount: fc.integer({ min: 1, max: 30 }),
  })

  function stateOf(components: Record<string, unknown>): EncounterReplicaState {
    return {
      status: "live",
      session: shellWith([
        inlineShellParticipant("p-target", components),
        goblin,
      ]),
    }
  }

  it("pool writes: identical outcome over arbitrary components (incl. capability absence)", () => {
    fc.assert(
      fc.property(
        arbitraryComponents,
        arbitraryPoolWrite,
        (components, write) => {
          const state = stateOf(components)
          const applied = applyEncounter(state, "p-target", write)
          const legacy = writerApply(state, participantId, write)

          expect(applied.ok).toBe(legacy.ok)
          if (!applied.ok || !legacy.ok) {
            expect(
              applied.ok ? undefined : (applied as { error: unknown }).error
            ).toEqual(legacy.ok ? undefined : legacy.error)
            return
          }
          const shell = applied.value.session.participants[0]
          expect(
            shell?.entity.storage === "inline"
              ? shell.entity.entity.components
              : undefined
          ).toEqual(legacy.value)
        }
      )
    )
  })

  it.each<CombatEntityWrite>([
    { component: "resources", op: "usePrisma" },
    {
      component: "mechanics",
      mechanic: "perfection",
      transition: { op: "adjust", delta: 1 },
    },
  ])("non-pool family %j: identical outcome", (write) => {
    const components = {
      resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 1 },
      mechanics: { states: { perfection: { kind: "perfection", rank: 2 } } },
    }
    const state = stateOf(components)
    const applied = applyEncounter(state, "p-target", write)
    const legacy = writerApply(state, participantId, write)

    expect(applied.ok).toBe(true)
    expect(legacy.ok).toBe(true)
    if (!applied.ok || !legacy.ok) return
    const shell = applied.value.session.participants[0]
    expect(
      shell?.entity.storage === "inline"
        ? shell.entity.entity.components
        : undefined
    ).toEqual(legacy.value)
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
