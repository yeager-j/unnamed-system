import type { CatalogVocab } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import {
  makeArmor,
  makeItemLookups,
  makePassiveSkill,
  makeWeapon,
} from "@workspace/game-v2/items/__fixtures__/catalog"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import {
  makeArchetype,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * A small **referentially real** catalog for the engine's law suites, and the
 * {@link CatalogVocab} that names it. The engine may not value-import `catalog/`
 * (the `depcheck.mjs` ports-not-catalog gate), and it shouldn't want to: a law
 * about the *fold* has no business depending on balance data.
 *
 * Between them, the entries cover every branch `resolve` can take on a reference
 * that exists — an archetype with a mechanic and inheritance slots, an archetype
 * without, an equippable weapon that grants a passive Skill, a Skill carrying
 * always-on effects. The complementary tier is `HOSTILE_VOCAB`, where nothing
 * resolves.
 */
const BOOST: Skill = makePassiveSkill({
  key: "slash-boost",
  name: "Slash Boost",
  effects: [
    { type: "attribute", target: "strength", amount: 2 },
    { type: "affinity", damageTypes: ["fire"], affinity: "resist" },
  ],
})

const GRANTED: Skill = makePassiveSkill({ key: "granted", name: "Granted" })

const SKILLS = [BOOST, GRANTED]

const ITEMS = [
  makeWeapon({ key: "iron-sword", name: "Iron Sword" }),
  makeArmor({
    key: "plate",
    name: "Plate",
    effects: [
      { type: "attribute", target: "hp", amount: 5 },
      { type: "skill", skillKey: "granted" },
    ],
  }),
]

const ARCHETYPES = {
  knight: makeArchetype({
    key: "knight",
    name: "Knight",
    lineage: "knight",
    mechanic: "valor",
    inheritanceSlots: 2,
    attributes: { strength: 4, magic: 1, agility: 2, luck: 1 },
    affinities: { fire: "weak", ice: "resist" },
    mastery: { kind: "attribute", amount: 2, attribute: "strength" },
    skills: [{ skill: "slash-boost", rank: 1 }],
  }),
  mage: makeArchetype({
    key: "mage",
    name: "Mage",
    lineage: "mage",
    mechanic: "stains",
    attributes: { strength: 1, magic: 4, agility: 1, luck: 2 },
  }),
  wanderer: makeArchetype({ key: "wanderer", name: "Wanderer" }),
}

export const LAW_GAME_DATA: GameData = {
  ...makeTestGameData(ARCHETYPES),
  ...makeItemLookups({ items: ITEMS, skills: SKILLS }),
  allItems: () => ITEMS,
}

export const LAW_VOCAB: CatalogVocab = {
  archetypeKeys: Object.keys(ARCHETYPES),
  skillKeys: SKILLS.map((skill) => skill.key),
  itemKeys: ITEMS.map((item) => item.key),
  talentKeys: ["athlete", "linguist"],
  inlineSkills: [makePassiveSkill({ key: "inline-passive" })],
}
