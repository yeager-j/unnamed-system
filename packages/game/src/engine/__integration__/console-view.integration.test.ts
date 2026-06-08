import { describe, expect, it } from "vitest"

import { enemyStatblocks } from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import {
  buildConsoleView,
  combatantName,
  type PcInfo,
} from "@workspace/game/engine/encounter/console-view"
import { createCombatSession } from "@workspace/game/engine/encounter/session-factory"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

function sequentialIds() {
  let n = 0
  return () => `combatant-${n++}`
}

const STAT_BLOCK = {
  name: "Practice Dummy",
  maxHP: 20,
  currentHP: 20,
  maxSP: 0,
  currentSP: 0,
  attributes: { strength: 1, magic: 0, agility: 1, luck: 1 },
}

/** combatant-0 PC player, combatant-1 inline enemy, combatant-2 catalog goblin. */
const SETUP: CombatantSetup[] = [
  { side: "players", ref: { kind: "pc", characterId: "char-1" }, zoneId: "z" },
  {
    side: "enemies",
    ref: { kind: "enemy", statBlock: STAT_BLOCK },
    zoneId: "z",
  },
  {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "z",
  },
]

const PC_INFO: Record<string, PcInfo> = {
  "char-1": { name: "Brannis", currentHP: 30 },
}

/** A fixture catalog whose "goblin" carries the name the resolver reads — an
 *  opaque id assigned here, not the shipped creature. */
const CATALOG = makeTestGameData({
  enemies: [makeEnemy({ key: "goblin", name: "Goblin" })],
})

const ENEMY_SB = enemyStatblocks(SETUP, CATALOG)

function build(): CombatSession {
  return {
    ...createCombatSession(SETUP, sequentialIds()),
    advantage: "neutral",
    firstSide: "players",
  }
}

describe("combatantName", () => {
  it("resolves a PC name from the injected vitals map", () => {
    const session = build()
    expect(combatantName(session.combatants[0]!, PC_INFO, ENEMY_SB)).toBe(
      "Brannis"
    )
  })

  it("falls back to the characterId when the PC is missing from the map", () => {
    const session = build()
    expect(combatantName(session.combatants[0]!, {}, ENEMY_SB)).toBe("char-1")
  })

  it("reads an inline enemy's name off its stat block", () => {
    const session = build()
    expect(combatantName(session.combatants[1]!, PC_INFO, ENEMY_SB)).toBe(
      "Practice Dummy"
    )
  })

  it("resolves a catalog enemy through the injected catalog", () => {
    const session = build()
    expect(combatantName(session.combatants[2]!, PC_INFO, ENEMY_SB)).toBe(
      "Goblin"
    )
  })

  it("falls back to the raw key for an unknown catalog enemy", () => {
    const session = {
      ...createCombatSession(
        [
          {
            side: "enemies",
            ref: { kind: "catalog-enemy", enemyKey: "not-a-real-enemy" },
            zoneId: "z",
          },
        ],
        sequentialIds()
      ),
      advantage: "neutral" as const,
      firstSide: "players" as const,
    }
    expect(combatantName(session.combatants[0]!, PC_INFO, ENEMY_SB)).toBe(
      "not-a-real-enemy"
    )
  })
})

describe("buildConsoleView", () => {
  it("names every combatant and reports no current actor before a draft", () => {
    const view = buildConsoleView(build(), PC_INFO, ENEMY_SB)

    expect(view.rows.map((r) => r.name)).toEqual([
      "Brannis",
      "Practice Dummy",
      "Goblin",
    ])
    expect(view.currentActor).toBeNull()
    expect(view.draftingSide).toBe("players")
  })

  it("flags the current actor and the eligible draft picks", () => {
    const session = { ...build(), currentActorId: "combatant-0" }
    const view = buildConsoleView(session, PC_INFO, ENEMY_SB)

    expect(view.currentActor).toMatchObject({
      id: "combatant-0",
      name: "Brannis",
      side: "players",
      hasActed: false,
    })
    const current = view.rows.find((r) => r.id === "combatant-0")!
    expect(current.isCurrent).toBe(true)
    // A non-current combatant is not flagged current.
    expect(view.rows.find((r) => r.id === "combatant-1")!.isCurrent).toBe(false)
    // Picks remain, so the round is not yet complete.
    expect(view.roundComplete).toBe(false)
    // Players lead and only the PC is on that side, so it is the lone candidate.
    expect(view.rows.filter((r) => r.isEligible).map((r) => r.id)).toEqual([
      "combatant-0",
    ])
  })

  it("marks a low-HP PC Fallen and excludes it from the draft", () => {
    const session = build()
    const view = buildConsoleView(
      session,
      { "char-1": { name: "Brannis", currentHP: 0 } },
      ENEMY_SB
    )

    const pc = view.rows.find((r) => r.id === "combatant-0")!
    expect(pc.isFallen).toBe(true)
    expect(pc.isEligible).toBe(false)
    // With the only player Fallen, the enemies draft next.
    expect(view.draftingSide).toBe("enemies")
  })

  it("keeps a Downed combatant draft-eligible so it can recover on draft", () => {
    const base = build()
    const session: CombatSession = {
      ...base,
      combatants: base.combatants.map((c) =>
        c.id === "combatant-0" ? { ...c, ailments: ["downed"] } : c
      ),
    }
    const view = buildConsoleView(session, PC_INFO, ENEMY_SB)

    // Players lead and the Downed PC is on that side — still a valid pick. The
    // draft slice clears Downed on draft (rulebook: "recover at the start of
    // your turn"); only Fallen are skipped.
    const downed = view.rows.find((r) => r.id === "combatant-0")!
    expect(downed.isFallen).toBe(false)
    expect(downed.isEligible).toBe(true)
  })

  it("reports the round complete once everyone eligible has acted", () => {
    const base = build()
    const session: CombatSession = {
      ...base,
      combatants: base.combatants.map((c) => ({
        ...c,
        hasActedThisRound: true,
      })),
    }
    const view = buildConsoleView(session, PC_INFO, ENEMY_SB)

    expect(view.roundComplete).toBe(true)
  })
})
