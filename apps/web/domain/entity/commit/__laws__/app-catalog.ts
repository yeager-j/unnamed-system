import type { CatalogVocab } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import { allArchetypes } from "@workspace/game-v2/catalog/archetypes"
import { allItems } from "@workspace/game-v2/catalog/items"
import { SKILLS } from "@workspace/game-v2/catalog/skills"
import { TALENT_KEYS } from "@workspace/game-v2/talents/vocab"

/**
 * The **real** catalog's keys, as an arbitraries vocabulary.
 *
 * The isomorphism law must use them, not a fixture: the entity Writers reach for
 * the shipped catalog directly (`getArchetype` through the composition root,
 * `getItem`/`getEquippableItem` in the inventory arm), because the hardcoded
 * catalog is identical on both sides of the wire. A write naming a fixture
 * archetype would be refused by every Writer that consults it, and the law would
 * pass by proving nothing.
 */
export const APP_VOCAB: CatalogVocab = {
  archetypeKeys: allArchetypes().map((archetype) => archetype.key),
  skillKeys: SKILLS.map((skill) => skill.key),
  itemKeys: allItems().map((item) => item.key),
  talentKeys: [...TALENT_KEYS],
  inlineSkills: [],
}
