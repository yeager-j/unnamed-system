import { describe, expect, it } from "vitest"

import { ENEMIES } from "@workspace/game/data/enemies/registry"
import { gameData } from "@workspace/game/data/game-data"
import { hydrateEnemySkills } from "@workspace/game/engine/enemies/hydrate-enemy-skills"

/**
 * Contract smoke (UNN-363): asserts `hydrateEnemySkills` resolves a *shipped*
 * enemy's Skills — both referenced `skillKeys` and authored `inlineSkills` —
 * against the real catalog. Folding/merge behavior is proven against fixtures in
 * `enemies/hydrate-enemy-skills.test.ts`; this only guards the seam (and that
 * every shipped enemy's `skillKeys` actually resolve).
 */
describe("hydrateEnemySkills — real catalog (smoke)", () => {
  it("hydrates a shipped enemy's referenced and inline Skills", () => {
    const enemy = ENEMIES.find((e) => e.skillKeys.length > 0)
    expect(enemy).toBeDefined()

    const skills = hydrateEnemySkills(enemy!, gameData)
    expect(skills).toHaveLength(
      enemy!.skillKeys.length + (enemy!.inlineSkills?.length ?? 0)
    )
  })
})
