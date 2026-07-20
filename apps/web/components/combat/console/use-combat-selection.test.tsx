// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { makeParticipant, type Session } from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"

import type { CurrentActorView } from "@/domain/combat/view/console-view"
import { resolveSession } from "@/domain/game-engine-v2"

import type { ConsoleDispatchEvent } from "./use-combat-console"
import { useCombatSelection } from "./use-combat-selection"

const goblinId = asParticipantId("p-goblin")

const session: Session = {
  round: 1,
  currentActorId: null,
  advantage: null,
  firstSide: null,
  participants: [
    makeParticipant(
      {
        id: "e-goblin",
        components: {
          identity: { name: "Goblin" },
          vitals: { base: 20, damage: 0 },
        },
      },
      goblinId,
      { side: "enemies" }
    ),
  ],
}

const instance: MapInstanceState = {
  geometry: {
    pages: { default: { id: "default", name: "Page 1" } },
    zones: {},
    connections: {},
  },
  occupancy: {},
  enchantment: null,
  reveal: {
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  },
  generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
  lastMovedTokenKey: null,
}

const actor = (hasActed: boolean): CurrentActorView => ({
  id: goblinId,
  name: "Goblin",
  side: "enemies",
  hasActed,
})

function renderSelection(currentActor: CurrentActorView | null) {
  const dispatched: ConsoleDispatchEvent[] = []
  const rendered = renderHook(() =>
    useCombatSelection({
      session,
      resolved: resolveSession(session, instance),
      instance,
      participantMeta: { [goblinId]: { storage: "inline" } },
      combatantSheetSliceById: {},
      currentActor,
      dispatch: (event) => dispatched.push(event),
    })
  )
  return { rendered, dispatched }
}

describe("useCombatSelection — phase", () => {
  it("is drafting with no current actor", () => {
    const { rendered } = renderSelection(null)
    expect(rendered.result.current.phase).toBe("drafting")
  })

  it("is active while the current actor hasn't acted", () => {
    const { rendered } = renderSelection(actor(false))
    expect(rendered.result.current.phase).toBe("active")
  })

  it("is drafting after the actor acted with no modal open", () => {
    const { rendered } = renderSelection(actor(true))
    expect(rendered.result.current.phase).toBe("drafting")
  })
})

describe("useCombatSelection — end of turn", () => {
  it("onEndTurn dispatches endTurn and opens the modal (resolving)", () => {
    const { rendered, dispatched } = renderSelection(actor(true))

    act(() => rendered.result.current.onEndTurn())

    expect(dispatched).toEqual([{ kind: "endTurn" }])
    expect(rendered.result.current.phase).toBe("resolving")
    expect(rendered.result.current.endOfTurnOpen).toBe(true)

    act(() => rendered.result.current.closeEndOfTurn())
    expect(rendered.result.current.endOfTurnOpen).toBe(false)
    expect(rendered.result.current.phase).toBe("drafting")
  })

  it("the modal never reads open while the phase isn't resolving", () => {
    // An actor who hasn't acted keeps the phase active even with the modal
    // flag set — endOfTurnOpen stays gated on the derived phase.
    const { rendered } = renderSelection(actor(false))
    act(() => rendered.result.current.onEndTurn())
    expect(rendered.result.current.phase).toBe("active")
    expect(rendered.result.current.endOfTurnOpen).toBe(false)
  })
})

describe("useCombatSelection — drawer selection", () => {
  it("selectedDetail is null with nothing selected, populated after a select, null again on close", () => {
    const { rendered } = renderSelection(null)
    expect(rendered.result.current.selectedDetail).toBeNull()

    act(() => rendered.result.current.selectCombatant(goblinId))
    expect(rendered.result.current.selectedDetail?.header.name).toBe("Goblin")

    act(() => rendered.result.current.selectCombatant(null))
    expect(rendered.result.current.selectedDetail).toBeNull()
  })

  it("an unknown id resolves to null (removed while selected)", () => {
    const { rendered } = renderSelection(null)
    act(() => rendered.result.current.selectCombatant(asParticipantId("ghost")))
    expect(rendered.result.current.selectedDetail).toBeNull()
  })
})
