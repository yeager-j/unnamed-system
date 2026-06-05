import { getEnemy } from "@/lib/game/enemies"

import type { CombatantSetup } from "./session"

/**
 * Resolves a setup combatant's *base* display name from its ref — a `pc` defers
 * to the injected name map (its name lives on the character row), an `enemy`
 * carries its name inline, and a `catalog-enemy` resolves through the hardcoded
 * catalog. The peer of {@link import("./console-view").combatantName} for the
 * pre-combat setup roster (which holds {@link CombatantSetup}s, not
 * {@link import("./session").Combatant}s). Falls back to the raw id/key so a
 * label never renders blank.
 */
function baseName(
  setup: CombatantSetup,
  pcNameById: Record<string, string>
): string {
  const ref = setup.ref
  switch (ref.kind) {
    case "pc":
      return pcNameById[ref.characterId] ?? ref.characterId
    case "enemy":
      return ref.statBlock.name
    case "catalog-enemy":
      return getEnemy(ref.enemyKey)?.name ?? ref.enemyKey
  }
}

/**
 * Display labels for a setup roster, disambiguating duplicate combatants by
 * appending an ordinal: a base name that appears once renders as-is, and
 * repeats become "Goblin", "Goblin 2", "Goblin 3" in roster order. This is the
 * "numbered combatants" rule (UNN-346) applied at the display layer — the
 * `catalog-enemy` ref stores no per-instance name, so the number is derived from
 * the roster, never persisted. Returns one label per setup, index-aligned to the
 * input.
 */
export function buildSetupCombatantLabels(
  setups: CombatantSetup[],
  pcNameById: Record<string, string>
): string[] {
  const totals = new Map<string, number>()
  for (const setup of setups) {
    const name = baseName(setup, pcNameById)
    totals.set(name, (totals.get(name) ?? 0) + 1)
  }

  const seen = new Map<string, number>()
  return setups.map((setup) => {
    const name = baseName(setup, pcNameById)
    if (totals.get(name) === 1) return name

    const ordinal = (seen.get(name) ?? 0) + 1
    seen.set(name, ordinal)
    return ordinal === 1 ? name : `${name} ${ordinal}`
  })
}
