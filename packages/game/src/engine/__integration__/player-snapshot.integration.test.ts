import { describe, expect, it } from "vitest"

import {
  enemyStatblocks,
  makeConnection,
  makeEncounter,
  makeGeometry,
  makeZone,
} from "@workspace/game/engine/__fixtures__/encounter"
import { makeEnemy } from "@workspace/game/engine/__fixtures__/enemies"
import { makeTestGameData } from "@workspace/game/engine/__fixtures__/game-data"
import { projectPlayerSnapshot } from "@workspace/game/engine/encounter/player-snapshot"
import type { PcCombatantDetail } from "@workspace/game/engine/encounter/roster-view"
import { type MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation/encounter/session"

function pc(characterId: string, zoneId = ""): CombatantSetup {
  return { side: "players", ref: { kind: "pc", characterId }, zoneId }
}

function catalogEnemy(enemyKey: string, zoneId = ""): CombatantSetup {
  return { side: "enemies", ref: { kind: "catalog-enemy", enemyKey }, zoneId }
}

function inlineEnemy(zoneId = ""): CombatantSetup {
  return {
    side: "enemies",
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Brigand",
        maxHP: 20,
        currentHP: 12,
        maxSP: 8,
        currentSP: 5,
        attributes: { strength: 2, magic: 0, agility: 1, luck: 0 },
      },
    },
    zoneId,
  }
}

const ARIA: PcCombatantDetail = {
  id: "char-aria",
  name: "Aria",
  pronouns: "she/her",
  portraitUrl: null,
  level: 4,
  currentHP: 18,
  maxHP: 30,
  currentSP: 6,
  maxSP: 12,
  attributes: { strength: 3, magic: 5, agility: 2, luck: 1 },
  affinityChart: { fire: "weak" } as PcCombatantDetail["affinityChart"],
  activeArchetypeKey: null,
  className: null,
  skills: [],
  activeMechanic: null,
  vitalsVersion: 0,
}

function encounter(session: CombatSession, status: "draft" | "live" | "ended") {
  return {
    name: "Ambush at the Bridge",
    status,
    campaignShortId: "camp-1",
    version: 4,
    instanceVersion: 2,
    session,
  }
}

/** A fixture catalog whose "goblin" carries a name, a definition max HP, and
 *  attributes/affinities — all assigned here — so the redaction tests prove the
 *  projection *drops* enemy attributes/affinities it was handed, not that it
 *  never had them. The real-catalog redaction smoke lives in `__contract__`. */
const GOBLIN = makeEnemy({
  key: "goblin",
  name: "Goblin",
  maxHP: 16,
  attributes: { strength: 1, magic: -1, agility: 2, luck: 0 },
  affinities: { fire: "weak" },
})
const CATALOG = makeTestGameData({ enemies: [GOBLIN] })

/** Projects with the resolved enemy statblocks for the encounter's own roster —
 *  the redaction tests pass the fixture goblin's data in, proving the projection
 *  drops it rather than never having it. The redacted position/engagement now
 *  comes from the Map Instance. */
const snap = (
  enc: Parameters<typeof projectPlayerSnapshot>[0],
  instance: MapInstanceState,
  pcDetailById: Parameters<typeof projectPlayerSnapshot>[2]
) =>
  projectPlayerSnapshot(
    enc,
    instance,
    pcDetailById,
    enemyStatblocks(enc.session.combatants, CATALOG)
  )

describe("projectPlayerSnapshot", () => {
  it("redacts enemy attributes and affinities entirely (UNN-324)", () => {
    const { session, instance } = makeEncounter([
      pc("char-aria"),
      catalogEnemy("goblin"),
    ])

    const snapshot = snap(encounter(session, "live"), instance, {
      "char-aria": ARIA,
    })

    const enemy = snapshot.combatants.find((c) => c.kind === "enemy")!
    expect("attributes" in enemy).toBe(false)
    expect("affinities" in enemy).toBe(false)
    // The source definition carries both — proving the absence is redaction.
    expect(GOBLIN.attributes).toBeDefined()
    expect(GOBLIN.affinities).toBeDefined()
  })

  it("surfaces an enemy's counters (Illuminated is public, not redacted)", () => {
    const { session, instance } = makeEncounter([catalogEnemy("goblin")])
    const withCounters: CombatSession = {
      ...session,
      combatants: session.combatants.map((c) => ({
        ...c,
        counters: { lumina: 2 },
      })),
    }

    const enemy = snap(
      encounter(withCounters, "live"),
      instance,
      {}
    ).combatants.find((c) => c.kind === "enemy")!
    expect(enemy.counters).toEqual({ lumina: 2 })
  })

  it("keeps PC HP, SP, and attributes fully visible (UNN-324)", () => {
    const { session, instance } = makeEncounter([pc("char-aria")])

    const snapshot = snap(encounter(session, "live"), instance, {
      "char-aria": ARIA,
    })

    const player = snapshot.combatants.find((c) => c.kind === "pc")!
    expect(player).toMatchObject({
      kind: "pc",
      hp: { current: 18, max: 30 },
      sp: { current: 6, max: 12 },
      attributes: { strength: 3, magic: 5, agility: 2, luck: 1 },
    })
  })

  it("defaults a PC's pools and attributes to zero when its detail is missing", () => {
    const { session, instance } = makeEncounter([pc("char-ghost")])

    const [player] = snap(encounter(session, "live"), instance, {}).combatants

    expect(player).toMatchObject({
      kind: "pc",
      hp: { current: 0, max: 0 },
      sp: { current: 0, max: 0 },
      attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    })
  })

  it("resolves a catalog enemy's HP to its definition max and gives it no SP", () => {
    const { session, instance } = makeEncounter([catalogEnemy("goblin")])

    const [enemy] = snap(encounter(session, "live"), instance, {}).combatants
    expect(enemy).toMatchObject({
      kind: "enemy",
      name: "Goblin",
      hp: { current: GOBLIN.maxHP, max: GOBLIN.maxHP },
      sp: null,
    })
  })

  it("carries an inline enemy's working HP and SP off its stat block", () => {
    const { session, instance } = makeEncounter([inlineEnemy()])

    const [enemy] = snap(encounter(session, "live"), instance, {}).combatants
    expect(enemy).toMatchObject({
      kind: "enemy",
      name: "Brigand",
      hp: { current: 12, max: 20 },
      sp: { current: 5, max: 8 },
    })
  })

  it("lists combatants in session order with acted + current flags", () => {
    const { session, instance } = makeEncounter([
      pc("char-aria"),
      catalogEnemy("goblin"),
    ])
    const patched: CombatSession = {
      ...session,
      currentActorId: "c-0",
      combatants: session.combatants.map((combatant, index) =>
        index === 1 ? { ...combatant, hasActedThisRound: true } : combatant
      ),
    }

    const snapshot = snap(encounter(patched, "live"), instance, {
      "char-aria": ARIA,
    })

    expect(snapshot.combatants.map((c) => c.id)).toEqual(["c-0", "c-1"])
    expect(snapshot.combatants[0]).toMatchObject({
      isCurrent: true,
      hasActed: false,
    })
    expect(snapshot.combatants[1]).toMatchObject({
      isCurrent: false,
      hasActed: true,
    })
  })

  it("resolves engagement target ids to names; Free combatants list none", () => {
    // c-0 (Aria) engaged with c-1 (Goblin) on the Instance; the Goblin is Free.
    const { session, instance } = makeEncounter([
      {
        ...pc("char-aria"),
        engagement: { status: "engaged", targetCombatantIds: ["c-1"] },
      },
      catalogEnemy("goblin"),
    ])

    const { combatants } = snap(encounter(session, "live"), instance, {
      "char-aria": ARIA,
    })

    expect(combatants[0]!.engagedWith).toEqual(["Goblin"])
    expect(combatants[1]!.engagedWith).toEqual([])
  })

  it("resolves the current actor's name + side, or null when none is acting", () => {
    const { session, instance } = makeEncounter([pc("char-aria")])

    const live: CombatSession = { ...session, currentActorId: "c-0" }
    expect(
      snap(encounter(live, "live"), instance, { "char-aria": ARIA })
        .currentActor
    ).toEqual({ id: "c-0", name: "Aria", side: "players" })

    expect(
      snap(encounter(session, "live"), instance, { "char-aria": ARIA })
        .currentActor
    ).toBeNull()
  })

  it("passes through status, name, round, and the ordered zone list", () => {
    const { session, instance } = makeEncounter([pc("char-aria", "z1")], {
      geometry: makeGeometry([
        makeZone("z1", { name: "Bridge", dmNotes: "the trap is here" }),
        makeZone("z2", { name: "Riverbank" }),
      ]),
    })
    const round3: CombatSession = { ...session, round: 3 }

    const snapshot = snap(encounter(round3, "ended"), instance, {
      "char-aria": ARIA,
    })

    expect(snapshot.status).toBe("ended")
    expect(snapshot.name).toBe("Ambush at the Bridge")
    expect(snapshot.campaignShortId).toBe("camp-1")
    expect(snapshot.version).toBe(4)
    expect(snapshot.instanceVersion).toBe(2)
    expect(snapshot.round).toBe(3)
    expect(snapshot.zones.map((z) => z.id)).toEqual(["z1", "z2"])
    // Redaction: the public snapshot projects each zone to { id, name } only —
    // the DM-private dmNotes (and description/position) never cross the wire.
    expect(snapshot.zones[0]).toEqual({ id: "z1", name: "Bridge" })
    expect(snapshot.zones[0]).not.toHaveProperty("dmNotes")
  })

  it("passes through the Instance's Zone Enchantment (observable, not redacted)", () => {
    const { session, instance } = makeEncounter([pc("char-aria", "z1")], {
      geometry: makeGeometry([makeZone("z1", { name: "Bridge" })]),
      enchantment: { zoneId: "z1", type: "requiem", forte: 2 },
    })

    const snapshot = snap(encounter(session, "live"), instance, {
      "char-aria": ARIA,
    })

    expect(snapshot.enchantment).toEqual({
      zoneId: "z1",
      type: "requiem",
      forte: 2,
    })
  })

  // UNN-467: combat runs on the delve's own (fogged) Instance, and the public
  // encounter snapshot must not become a side door around the dungeon fog.
  describe("fog redaction on a delve Instance (UNN-467)", () => {
    // A two-zone delve: z1 revealed (the party + the fight), z2 still in fog.
    const foggedGeometry = makeGeometry(
      [
        makeZone("z1", { name: "Antechamber" }),
        makeZone("z2", { name: "Hidden Vault", dmNotes: "the prize" }),
      ],
      [makeConnection("c12", "z1", "z2")]
    )
    const fogged = {
      revealedZoneIds: ["z1"],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    }

    it("drops undiscovered Zones and the graph edges into them", () => {
      const { session, instance } = makeEncounter(
        [pc("char-aria", "z1"), catalogEnemy("goblin", "z2")],
        { geometry: foggedGeometry, reveal: fogged }
      )

      const snapshot = snap(encounter(session, "live"), instance, {
        "char-aria": ARIA,
      })

      expect(snapshot.zones.map((z) => z.id)).toEqual(["z1"])
      // z1's only edge leads into fog, so it lists no neighbor and the hidden
      // z2 never appears as a key — its id can't leak.
      expect(snapshot.adjacency).toEqual({ z1: [] })
    })

    it("clears the zoneId of any combatant (enemy or PC) in an unrevealed Zone", () => {
      const { session, instance } = makeEncounter(
        [pc("char-aria", "z2"), catalogEnemy("goblin", "z2")],
        { geometry: foggedGeometry, reveal: fogged }
      )

      const { combatants } = snap(encounter(session, "live"), instance, {
        "char-aria": ARIA,
      })

      expect(combatants.find((c) => c.kind === "pc")!.zoneId).toBe("")
      expect(combatants.find((c) => c.kind === "enemy")!.zoneId).toBe("")
    })

    it("keeps a combatant's real zoneId when it stands in a revealed Zone", () => {
      const { session, instance } = makeEncounter([pc("char-aria", "z1")], {
        geometry: foggedGeometry,
        reveal: fogged,
      })

      const [player] = snap(encounter(session, "live"), instance, {
        "char-aria": ARIA,
      }).combatants
      expect(player!.zoneId).toBe("z1")
    })

    it("withholds an Enchantment that sits in an unrevealed Zone", () => {
      const { session, instance } = makeEncounter([pc("char-aria", "z1")], {
        geometry: foggedGeometry,
        reveal: fogged,
        enchantment: { zoneId: "z2", type: "requiem", forte: 2 },
      })

      expect(
        snap(encounter(session, "live"), instance, { "char-aria": ARIA })
          .enchantment
      ).toBeNull()
    })

    it("does NOT redact a standalone encounter (empty reveal) — the whole map stays visible", () => {
      const { session, instance } = makeEncounter(
        [pc("char-aria", "z1"), catalogEnemy("goblin", "z2")],
        { geometry: foggedGeometry } // default reveal is empty ⇒ not a delve
      )

      const snapshot = snap(encounter(session, "live"), instance, {
        "char-aria": ARIA,
      })

      expect(snapshot.zones.map((z) => z.id)).toEqual(["z1", "z2"])
      expect(snapshot.adjacency).toEqual({ z1: ["z2"], z2: ["z1"] })
      expect(snapshot.combatants.find((c) => c.kind === "enemy")!.zoneId).toBe(
        "z2"
      )
    })
  })
})
