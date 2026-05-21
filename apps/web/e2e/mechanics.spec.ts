import { expect, test } from "@playwright/test"

/**
 * End-to-end checks for the per-Archetype mechanic engine. These assertions
 * are deliberately outcome-focused — they verify the *values* the engine
 * produces (an Affinity becoming Resist, an Attack Roll bonus summing to a
 * specific number with attribution) — and avoid pinning the widget design
 * (pip counts, ladder positions, layout). The Combat-tab card visuals will
 * iterate; these tests should keep passing.
 *
 * Seed state the assertions rely on (see `lib/__fixtures__/seed-characters.ts`):
 *  - seed-warrior:  Perfection rank A (3) on active Warrior
 *  - seed-knight:   Valor 3 on active Knight
 *  - seed-healer:   Dawn Mode + two Illuminated enemies on active Healer
 *  - seed-mage:     Stains [fire, ice, null, null] on active Mage
 *  - seed-fallen:   Perfection rank S (4) on active Warrior
 */

test("Warrior at Perfection A + Strength +2 reads Cleave Attack Roll +5", async ({
  page,
}) => {
  await page.goto("/c/seed-warrior")

  // Open the Cleave Skill card. The breakdown line is what proves attribution:
  // base attribute Strength (+2) + Perfection (A) (+3) = +5 — the engine
  // resolved everything, the component just rendered the result.
  await page.getByRole("button", { name: /Cleave/ }).click()
  const card = page.getByRole("dialog")
  await expect(card).toContainText(/Attack Roll\s*\+\s*5/)
  await expect(card).toContainText("Strength")
  await expect(card).toContainText("Perfection (A)")
})

test("Warrior at Perfection S + Strength +2 reads Cleave Attack Roll +6", async ({
  page,
}) => {
  await page.goto("/c/seed-fallen")

  // Endpoint demo: rank S adds +4, sum is +6. Confirms the rank→bonus table
  // and that the engine path reaches the Skill card unchanged at the top end.
  await page.getByRole("button", { name: /Cleave/ }).click()
  const card = page.getByRole("dialog")
  await expect(card).toContainText(/Attack Roll\s*\+\s*6/)
  await expect(card).toContainText("Perfection (S)")
})

test("Knight at Valor 3 has Resist on every physical damage type", async ({
  page,
}) => {
  await page.goto("/c/seed-knight")

  // The Affinity chart is the engine's window on Effects. Knight's base chart
  // lists Slash as Resist already; Pierce and Strike are Neutral by default
  // — Valor's 3+ Effect lifts them to Resist via the same pipeline items and
  // passive Skills use.
  const affinities = page.getByRole("region", { name: "Affinities" })
  for (const damageType of ["Slash", "Pierce", "Strike"]) {
    const cell = affinities.locator("dl > div", { hasText: damageType })
    await expect(cell).toContainText("Resist")
  }
})

test("Healer's Path of Dawn surfaces the seeded Illuminated enemies", async ({
  page,
}) => {
  await page.goto("/c/seed-healer")

  // Loose content assertion — names and Dawn-mode indicator must be visible
  // somewhere in the mechanic region. Doesn't care whether the list is a
  // <ul>, a table, or rebuilt against the future initiative tracker.
  const mechanic = page.getByRole("region", { name: "Archetype Mechanic" })
  await expect(mechanic).toContainText("Charred Skeleton")
  await expect(mechanic).toContainText("Salt Wraith")
  await expect(mechanic).toContainText(/Dawn/)
})

test("Mage's Stains widget shows the seeded element tokens", async ({
  page,
}) => {
  await page.goto("/c/seed-mage")

  // Mage seed: Fire + Ice filled, two empty slots. Assertion is just that the
  // filled tokens render somewhere in the mechanic region — slot layout can
  // change without breaking this.
  const mechanic = page.getByRole("region", { name: "Archetype Mechanic" })
  await expect(mechanic).toContainText("Fire")
  await expect(mechanic).toContainText("Ice")
})
