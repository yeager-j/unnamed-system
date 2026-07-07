/**
 * One-off generator for the formula-rendering pin fixture (UNN-557 item 5;
 * UNN-548 item 4's procedure). Runs v1's ACTUAL render paths over the FULL v1
 * skill catalog and writes the rendered strings to
 * `packages/game-v2/src/catalog/skills/__fixtures__/formula-rendering.fixture.ts`,
 * so the byte-identity test can outlive v1's deletion (S4) importing only v2 +
 * the fixture.
 *
 * Three renderings per tier formula, each through v1's own functions:
 *  - `raw` — un-hydrated (`hydrateFormula` untouched-attribute form is just the
 *    authored string, so raw IS the authored string)
 *  - `hydrated` — `hydrateFormula` against the fixed AttributeScores below
 *  - `withBonuses` — a documented Frenzy dice bonus (`+3d4`) and a flat zone
 *    bonus (`+2`) folded via v1's `foldDamageBonusesIntoFormula`, then hydrated
 *
 * Flat magnitudes record `raw` + `hydrated`. ⚠️ Field audit (hand-checked, no
 * find-replace): v1 stores a no-roll damage magnitude on `skill.damage` (a
 * string) and a heal magnitude on `skill.formula`; v2 stores both on
 * `skill.formula` (v2's `skill.damage` is the typed spec).
 *
 * Usage: `npx tsx scripts/generate-formula-fixture.ts` from `apps/web`.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { SKILLS } from "@workspace/game/data/skills/registry"
import {
  foldDamageBonusesIntoFormula,
  hydrateFormula,
} from "@workspace/game/engine"

const scriptDir = dirname(fileURLToPath(import.meta.url))

/** The pinned hydration scores — asymmetric so `st-or-ma` provably picks Magic. */
const FIXTURE_ATTRIBUTES = { strength: 2, magic: 4, agility: 1, luck: 0 }

/** The documented bonus pair: Frenzy's dice bonus + a flat zone bonus. */
const FIXTURE_BONUSES = [
  { source: "Frenzy (Pain 3)", label: "+3d4" },
  { source: "Zone", label: "+2" },
]

interface TierEntry {
  skill: string
  band: string
  raw: string
  hydrated: string
  withBonuses: string
}

interface FlatEntry {
  skill: string
  raw: string
  hydrated: string
}

const tiers: TierEntry[] = []
const flats: FlatEntry[] = []

for (const skill of [...SKILLS].sort((a, b) => a.key.localeCompare(b.key))) {
  const attackRoll = (
    skill as {
      attackRoll?: { tiers: Array<{ band: string; formula?: string }> }
    }
  ).attackRoll
  for (const tier of attackRoll?.tiers ?? []) {
    if (!tier.formula) continue
    tiers.push({
      skill: skill.key,
      band: tier.band,
      raw: tier.formula,
      hydrated: hydrateFormula(tier.formula, FIXTURE_ATTRIBUTES),
      withBonuses: hydrateFormula(
        foldDamageBonusesIntoFormula(tier.formula, FIXTURE_BONUSES),
        FIXTURE_ATTRIBUTES
      ),
    })
  }

  // v1 field audit: no-roll damage magnitude = `damage` (string); heal
  // magnitude = `formula`. Exactly one can apply per v1 skill kind.
  const flat =
    typeof (skill as { damage?: unknown }).damage === "string"
      ? ((skill as { damage: string }).damage as string)
      : typeof (skill as { formula?: unknown }).formula === "string"
        ? ((skill as { formula: string }).formula as string)
        : null
  if (flat) {
    flats.push({
      skill: skill.key,
      raw: flat,
      hydrated: hydrateFormula(flat, FIXTURE_ATTRIBUTES),
    })
  }
}

const outPath = resolve(
  scriptDir,
  "../../../packages/game-v2/src/catalog/skills/__fixtures__/formula-rendering.fixture.ts"
)

const banner = `/**
 * PINNED v1 formula renderings (UNN-557 item 5) — GENERATED, do not edit.
 *
 * Produced by \`apps/web/scripts/generate-formula-fixture.ts\` running v1's
 * \`hydrateFormula\` + \`foldDamageBonusesIntoFormula\` over the full v1 skill
 * catalog. Once v1 is deleted (S4) this fixture IS the oracle: the
 * byte-identity test imports only v2 + this file. Regenerate only while v1
 * still exists, and only if the v1 catalog itself changes.
 *
 * Hydration scores: strength 2, magic 4, agility 1, luck 0 (asymmetric so
 * \`st-or-ma\` provably resolves to Magic). Bonus pair for \`withBonuses\`:
 * Frenzy \`+3d4\` (dice) and a flat zone \`+2\`, folded after the base term.
 */

export const FIXTURE_ATTRIBUTES = ${JSON.stringify(FIXTURE_ATTRIBUTES)} as const
`

const body = `
export interface PinnedTierRendering {
  skill: string
  band: string
  raw: string
  hydrated: string
  withBonuses: string
}

export interface PinnedFlatRendering {
  skill: string
  raw: string
  hydrated: string
}

export const PINNED_TIER_RENDERINGS: readonly PinnedTierRendering[] = ${JSON.stringify(tiers, null, 2)}

export const PINNED_FLAT_RENDERINGS: readonly PinnedFlatRendering[] = ${JSON.stringify(flats, null, 2)}
`

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, banner + body)
console.log(
  `wrote ${tiers.length} tier + ${flats.length} flat renderings to ${outPath}`
)
