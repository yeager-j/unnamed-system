import { describe, expect, it } from "vitest"

import {
  participantWith,
  sessionOf,
} from "@workspace/game-v2/encounter/__fixtures__/session"
import type { ParticipantView } from "@workspace/game-v2/encounter/participant-view"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import {
  affinityChart,
  attributeScores,
  dm,
  makeParticipantView,
  player,
  spectator,
} from "./__fixtures__/redaction"
import type { Viewer } from "./relationship"
import {
  projectEncounterSnapshot,
  type EncounterSnapshotMeta,
  type VisibleCombatant,
} from "./snapshot"

/**
 * RELEASE GATE (security-critical, D14). The watch snapshot is signed-out-visible:
 * an enemy's `attributes`/`affinities` must be **structurally absent** from the
 * wire for any viewer who is not own/ally/dm, while observable state (`portraitUrl`)
 * must survive for everyone. Seeds are deliberately populated WITH the stats so the
 * tests prove they are *dropped*, not merely never set, and use **realistic ids**:
 * the participantView carries an ENTITY id distinct from the participant/roster id, ownership
 * keys on the ENTITY id, and `combatants[].id` is the roster id. Folds the real
 * `projectEncounterSnapshot` end to end (not just `visibleEntity`).
 */

const META: EncounterSnapshotMeta = {
  status: "live",
  name: "Goblin Ambush",
  campaignShortId: "camp123",
  version: 1,
}

const ENEMY_ENTITY_ID = "goblin-entity"
const ENEMY_PORTRAIT = "https://img/goblin.png"
const PC_ENTITY_ID = "iris-entity"
const PC_PORTRAIT = "https://img/iris.png"

/**
 * Projects a one-combatant encounter and returns that combatant. `participantId`
 * (roster) is intentionally distinct from `participantView.id` (entity) so ownership-by-entity
 * and roster-keyed output are both exercised honestly.
 */
function redact(
  participantId: string,
  participantView: ParticipantView,
  side: CombatSide,
  viewer: Viewer
): VisibleCombatant {
  const session = sessionOf([participantWith({ id: participantId, side })])
  const snapshot = projectEncounterSnapshot(
    session,
    new Map([[asParticipantId(participantId), participantView]]),
    viewer,
    META
  )
  return snapshot.combatants[0]!
}

const enemyView = makeParticipantView({
  id: ENEMY_ENTITY_ID,
  side: "enemies",
  components: {
    identity: { name: "Goblin" },
    presentation: { portraitUrl: ENEMY_PORTRAIT },
    attributes: attributeScores({ strength: 14 }),
    affinities: affinityChart({ fire: "weak" }),
    vitals: { maxHP: 20, currentHP: 12 },
  },
})

const redactEnemy = (viewer: Viewer) =>
  redact("e1", enemyView, "enemies", viewer)

describe("RELEASE GATE — enemy stats never leak to the wire (RED-4; CD11)", () => {
  it("combatants[].id is the roster id (e1), never the entity id (goblin-entity)", () => {
    const combatant = redactEnemy(spectator())
    expect(combatant.id).toBe("e1")
  })

  it.each<[string, Viewer, boolean]>([
    ["opponent", player("players"), false],
    ["spectator", spectator(), false],
    ["ally", player("enemies"), true],
    ["owner (owns the entity id)", player("enemies", [ENEMY_ENTITY_ID]), true],
    ["dm", dm(), true],
  ])("%s sees attributes/affinities = %s", (_label, viewer, visible) => {
    const c = redactEnemy(viewer).components
    expect("attributes" in c).toBe(visible)
    expect("affinities" in c).toBe(visible)
    if (visible) {
      expect(c.attributes).toEqual(enemyView.components.attributes)
      expect(c.affinities).toEqual(enemyView.components.affinities)
    }
  })

  it("opponent: the seeded stats are STRUCTURALLY absent, not present-as-null", () => {
    const c = redactEnemy(player("players")).components
    expect("attributes" in c).toBe(false)
    expect(c.attributes).toBeUndefined()
    expect(c.attributes).not.toBeNull()
    expect("affinities" in c).toBe(false)
    expect(c.affinities).toBeUndefined()
  })

  it.each<[string, Viewer]>([
    ["opponent", player("players")],
    ["spectator", spectator()],
    ["ally", player("enemies")],
    ["owner", player("enemies", [ENEMY_ENTITY_ID])],
    ["dm", dm()],
  ])("portraitUrl survives redaction for %s", (_label, viewer) => {
    expect(redactEnemy(viewer).components.presentation?.portraitUrl).toBe(
      ENEMY_PORTRAIT
    )
  })
})

describe("RELEASE GATE — charmed PC: ownership (capability), not kind (CD11)", () => {
  // A PC fighting on the `enemies` side — the exact case v1's kind-keyed redaction
  // could not express. Roster id "pc1"; entity id distinct; seeded with stats + art.
  const charmedPc = makeParticipantView({
    id: PC_ENTITY_ID,
    side: "enemies",
    components: {
      identity: { name: "Iris" },
      presentation: { portraitUrl: PC_PORTRAIT },
      attributes: attributeScores(),
    },
  })
  const redactPc = (viewer: Viewer) =>
    redact("pc1", charmedPc, "enemies", viewer)

  it("its controller (owns the entity id) reads `own` → attributes visible", () => {
    const combatant = redactPc(player("players", [PC_ENTITY_ID]))
    expect(combatant.id).toBe("pc1") // still the roster id on the wire
    expect("attributes" in combatant.components).toBe(true)
    expect(combatant.components.presentation?.portraitUrl).toBe(PC_PORTRAIT)
  })

  it("its old party (same side, does NOT own the entity id) reads `opponent` → attributes dropped", () => {
    const c = redactPc(player("players")).components
    expect("attributes" in c).toBe(false)
    // observable art is still public, even to the old party.
    expect(c.presentation?.portraitUrl).toBe(PC_PORTRAIT)
  })
})
