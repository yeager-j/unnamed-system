import { describe, expect, it } from "vitest"

import { participantWith, sessionOf } from "./__fixtures__/session"
import { createReduceEncounter, type EncounterState } from "./reduce-encounter"
import type { CombatEvent } from "./session-event"

/** A marker instance — opaque to `reduceEncounter`, so we assert it is carried by
 *  reference identity rather than rebuilt. */
const instance = { token: "opaque-spatial-state" }

const stateOf = (
  ...args: Parameters<typeof sessionOf>
): EncounterState<typeof instance> => ({
  session: sessionOf(...args),
  instance,
})

const reduceEncounter = createReduceEncounter(() => "minted")

describe("createReduceEncounter (CD16 wrapper)", () => {
  it("routes a combat event to the session reducer, carrying the instance untouched", () => {
    const state = stateOf([participantWith({ id: "p1" })], { round: 1 })
    const event: CombatEvent = { kind: "setRound", round: 5 }
    const next = reduceEncounter(state, event)
    expect(next.session.round).toBe(5)
    // The opaque instance is carried by reference — the wrapper never reads it.
    expect(next.instance).toBe(instance)
  })

  it("preserves same-ref on a no-op event (the whole EncounterState reference)", () => {
    const state = stateOf([participantWith({ id: "p1" })])
    // draftCombatant on an unknown id is a session no-op (same session ref) — the
    // wrapper must propagate that to the same EncounterState ref, not re-wrap.
    const next = reduceEncounter(state, {
      kind: "draftCombatant",
      participantId: "ghost",
    })
    expect(next).toBe(state)
  })

  it("leaves mapInstanceId untouched (the session reducer is spatial-blind, R24.5)", () => {
    const state = stateOf([participantWith({ id: "p1" })], {
      mapInstanceId: "map-7",
    })
    const next = reduceEncounter(state, { kind: "advanceRound" })
    expect(next.session.mapInstanceId).toBe("map-7")
  })
})
