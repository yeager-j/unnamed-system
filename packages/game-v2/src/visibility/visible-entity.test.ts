import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/encounter/ids"
import type { ParticipantViewComponents } from "@workspace/game-v2/encounter/participant-view"

import {
  affinityChart,
  attributeScores,
  dm,
  makeParticipantView,
  player,
  spectator,
} from "./__fixtures__/redaction"
import type { Viewer } from "./relationship"
import { visibleEntity } from "./visible-entity"

/** The resolved + instance read-units an enemy can carry — one of each so the fold
 *  is exercised over a public row, a stats (drop) row, and a drop-from-all row. */
const ENEMY_COMPONENTS: Partial<ParticipantViewComponents> = {
  identity: { name: "Goblin" },
  presentation: { portraitUrl: "https://img/goblin.png" },
  vitals: { maxHP: 20, currentHP: 12 },
  skillPool: { maxSP: 8, currentSP: 4 },
  position: { zoneId: "z1" },
  engagement: {
    status: "engaged",
    targetCombatantIds: [asParticipantId("p1")],
  },
  attributes: attributeScores({ strength: 14 }),
  affinities: affinityChart({ fire: "weak" }),
  skills: [],
  talents: [{ key: "ambush" }],
  resources: {
    maxHitDice: 2,
    currentHitDice: 1,
    maxSkillDice: 2,
    currentSkillDice: 1,
  },
  exhaustion: { level: 0, description: "Rested" },
  archetypes: {
    active: null,
    origin: null,
    savedArchetypeRanks: 0,
    activeLineage: null,
    roster: [],
  },
  pendingEffects: { attackRoll: [], damage: [] },
}

// `goblin-entity` is the ENTITY id (what the participant-view's `id` carries + what ownership keys on);
// a roster/participant id is a separate namespace exercised in snapshot.test.ts.
const enemyView = makeParticipantView({
  id: "goblin-entity",
  side: "enemies",
  components: ENEMY_COMPONENTS,
})

const PUBLIC_TO_ALL_KEYS = [
  "identity",
  "presentation",
  "vitals",
  "skillPool",
  "position",
  "engagement",
  "allegiance",
  "turnState",
  "ailments",
  "battleConditions",
  "conditionDurations",
  "counters",
] as const

const DROP_FROM_ALL_KEYS = [
  "skills",
  "talents",
  "resources",
  "exhaustion",
  "archetypes",
  "pendingEffects",
] as const

const STAT_KEYS = ["attributes", "affinities"] as const

describe("visibleEntity — the uniform redaction fold (CD11; ADR §2.6)", () => {
  it("keeps every public-to-all component for an opponent (incl. position + engagement)", () => {
    const c = visibleEntity(enemyView, player("players"))
    for (const key of PUBLIC_TO_ALL_KEYS) {
      expect(key in c).toBe(true)
      expect(c[key]).toEqual(enemyView.components[key])
    }
  })

  it("`drop` is structural key-ABSENCE, never null (the v1 RED-4 contract)", () => {
    const c = visibleEntity(enemyView, player("players"))
    for (const key of STAT_KEYS) {
      expect(key in c).toBe(false)
      expect(Object.prototype.hasOwnProperty.call(c, key)).toBe(false)
      expect(c[key]).toBeUndefined()
      // not present-as-null: `in` already proves absence; this guards a regression
      // that writes `null` (which would make `in` true).
      expect(c[key]).not.toBeNull()
    }
  })

  it("drops the stat rows for a spectator too (the tightening over v1)", () => {
    const c = visibleEntity(enemyView, spectator())
    expect("attributes" in c).toBe(false)
    expect("affinities" in c).toBe(false)
  })

  it.each([
    ["own (owner of the entity id)", player("players", ["goblin-entity"])],
    ["ally (same side)", player("enemies")],
    ["dm", dm()],
  ])("reveals the stat rows to %s", (_label, viewer: Viewer) => {
    const c = visibleEntity(enemyView, viewer)
    expect(c.attributes).toEqual(enemyView.components.attributes)
    expect(c.affinities).toEqual(enemyView.components.affinities)
  })

  it.each([
    ["own", player("players", ["goblin-entity"])],
    ["ally", player("enemies")],
    ["opponent", player("players")],
    ["spectator", spectator()],
    ["dm", dm()],
  ])(
    "drops the sheet-only read-units for EVERY relationship (%s)",
    (_l, viewer: Viewer) => {
      const c = visibleEntity(enemyView, viewer)
      for (const key of DROP_FROM_ALL_KEYS) {
        expect(key in c).toBe(false)
      }
    }
  )
})
