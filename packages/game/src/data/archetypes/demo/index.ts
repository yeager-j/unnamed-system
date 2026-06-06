import type { Archetype } from "@workspace/game/foundation/archetypes/schema"

/**
 * Demo-only Archetypes used to exercise the Lineage Atlas (UNN-239) before the
 * real higher-tier game data is authored. Merged into the runtime catalog
 * **only** when {@link INCLUDE_DEMO_ARCHETYPES} is on (local dev + Vercel
 * Preview), never in Production — see `./include.ts`.
 *
 * This is a throwaway Knight tree for visual/interaction testing only — it
 * reuses the shipped Knight's Skills and Talents (Inheritance Slots and
 * Mechanics are already proven elsewhere, so these carry no `mechanic`), and
 * the stat blocks just step up tier-over-tier. The shape under test is the
 * branching + prerequisite gating:
 *
 * ```
 *   Knight (I) ─┬─ Lancer (II)  ── Dragon Knight (III)
 *               └─ Paladin (II) ── Holy Avenger (III)
 * ```
 *
 * Every `skills` / `talents` reference must resolve to a real catalog entry —
 * the registry's `validate` runs on these too — which `satisfies Archetype`
 * checks at compile time. Demo keys are intentionally *not* part of the
 * {@link ArchetypeKey} union (runtime-only), so Origin selection and other
 * typed surfaces are unaffected.
 */

const lancer = {
  key: "demo-lancer",
  name: "Lancer",
  lineage: "knight",
  tier: "adept",
  prerequisites: [{ archetype: "knight", rank: 5 }],
  inheritanceSlots: 3,
  talents: ["lift", "culture"],
  mastery: { kind: "attribute", amount: 2, attribute: "strength" },
  attributes: { strength: 4, magic: -1, agility: 1, luck: 2 },
  affinities: { pierce: "resist", fire: "weak" },
  skills: [
    { rank: 1, skill: "skewer" },
    { rank: 2, skill: "storm-thrust" },
    { rank: 3, skill: "shield-arts" },
  ],
} satisfies Archetype

const paladin = {
  key: "demo-paladin",
  name: "Paladin",
  lineage: "knight",
  tier: "adept",
  prerequisites: [
    { archetype: "knight", rank: 5 },
    { archetype: "healer", rank: 5 },
  ],
  inheritanceSlots: 3,
  talents: ["history", "culture"],
  mastery: { kind: "hp", amount: 30 },
  attributes: { strength: 4, magic: 0, agility: 0, luck: 2 },
  affinities: { slash: "resist", light: "resist", dark: "weak" },
  skills: [
    { rank: 1, skill: "skewer" },
    { rank: 2, skill: "knights-proclamation" },
  ],
} satisfies Archetype

const dragonKnight = {
  key: "demo-dragon-knight",
  name: "Dragon Knight",
  lineage: "knight",
  tier: "elite",
  prerequisites: [{ archetype: "demo-lancer", rank: 5 }],
  inheritanceSlots: 4,
  talents: ["lift"],
  mastery: { kind: "attribute", amount: 3, attribute: "strength" },
  attributes: { strength: 6, magic: 0, agility: 2, luck: 1 },
  affinities: { pierce: "resist", fire: "resist", ice: "weak" },
  skills: [
    { rank: 1, skill: "storm-thrust" },
    { rank: 2, skill: "shield-arts" },
    { rank: 3, skill: "auto-rakukaja" },
  ],
  synthesisSkill: { rank: 5, skill: "hammer-of-justice" },
} satisfies Archetype

const holyAvenger = {
  key: "demo-holy-avenger",
  name: "Holy Avenger",
  lineage: "knight",
  tier: "elite",
  prerequisites: [{ archetype: "demo-paladin", rank: 5 }],
  inheritanceSlots: 4,
  talents: ["history"],
  mastery: { kind: "hp", amount: 40 },
  attributes: { strength: 6, magic: 1, agility: 0, luck: 2 },
  affinities: { slash: "resist", light: "resist", dark: "weak" },
  skills: [
    { rank: 1, skill: "knights-proclamation" },
    { rank: 2, skill: "shield-arts" },
    { rank: 3, skill: "auto-rakukaja" },
  ],
  synthesisSkill: { rank: 5, skill: "hammer-of-justice" },
} satisfies Archetype

export const DEMO_ARCHETYPES: Archetype[] = [
  lancer,
  paladin,
  dragonKnight,
  holyAvenger,
]
