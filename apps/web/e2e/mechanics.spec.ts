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
 *  - seed-healer:   Dawn Mode on, active Healer
 *  - seed-mage:     Stains [fire, ice, null, null] on active Mage Rank 5;
 *                   partyComposition { mage: 2, warlock: 1 }; equips
 *                   Warlock's Pact (grants Ailment Boost) + Shadow Charm
 *                   (grants Evil Touch)
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

test("Warrior at Perfection S + Slash Boost + Strength +2 reads Cleave Attack Roll +8", async ({
  page,
}) => {
  await page.goto("/c/seed-fallen")

  // Endpoint demo: Strength (+2) + Perfection S (+4) + Slash Boost (+2) = +8.
  // Slash Boost is Warrior Rank 5; seed-fallen is Rank 5 so the passive is
  // active and its damageType filter matches Cleave's Slash damage. Confirms
  // both the rank→bonus table and the per-Skill filter pipeline reach the
  // Skill card with attribution intact.
  await page.getByRole("button", { name: /Cleave/ }).click()
  const card = page.getByRole("dialog")
  await expect(card).toContainText(/Attack Roll\s*\+\s*8/)
  await expect(card).toContainText("Perfection (S)")
  await expect(card).toContainText("Slash Boost")
})

test("Mage at Rank 5 with 2 Mage allies reads Bufu Attack Roll with Magic Circle +2", async ({
  page,
}) => {
  await page.goto("/c/seed-mage")

  // Bufu is Ice + Magical: Magic Circle's `deliveries: ["magical"]` filter
  // matches, and its perPartyLineage scaler resolves against partyComposition
  // `{ mage: 2 }` (includesSelf=true) for +2. Calliope's Magic is +4
  // (Mage base +2, manual +1, Runed Cane +1) — total Attack Roll +6.
  await page.getByRole("button", { name: /Bufu/ }).click()
  const card = page.getByRole("dialog")
  await expect(card).toContainText(/Attack Roll\s*\+\s*6/)
  await expect(card).toContainText("Magic")
  await expect(card).toContainText("Magic Circle")
})

test("Magic Circle is filtered out on Physical-delivery Attack Rolls", async ({
  page,
}) => {
  await page.goto("/c/seed-mage")

  // The Runed Cane intrinsic attack is Strike + Physical, attribute Strength.
  // Magic Circle's `deliveries: ["magical"]` filter should reject it, leaving
  // only the rolling Attribute as a contributor — Mage Strength is −1, so the
  // total reads "Attack Roll − 1" with no Magic Circle source anywhere on the
  // card. (The breakdown line itself is suppressed when only the Attribute
  // contributes — a single-source readout is already complete in the header.)
  await page.getByRole("button", { name: /Runed Cane/ }).click()
  const card = page.getByRole("dialog")
  await expect(card).toContainText(/Attack Roll\s*−\s*1/)
  await expect(card.getByText("Magic Circle")).toHaveCount(0)
})

test("Mage with Warlock's Pact reads Evil Touch Attack Roll with Ailment Boost +2", async ({
  page,
}) => {
  await page.goto("/c/seed-mage")

  // Evil Touch is an Ailment Skill (kind: "ailment", rolls on Luck). Ailment
  // Boost's `skillKinds: ["ailment"]` filter matches, and its perPartyLineage
  // scaler resolves against `{ warlock: 1 }` for +2. Calliope's Luck is +1,
  // so the readout is Luck (+1) + Ailment Boost (+2) = +3 — proving the
  // skillKinds filter plus a Skill-granted-via-accessory passive (Warlock's
  // Pact grants Ailment Boost) both reach the Skill card.
  await page.getByRole("button", { name: /Evil Touch/ }).click()
  const card = page.getByRole("dialog")
  await expect(card).toContainText(/Attack Roll\s*\+\s*3/)
  await expect(card).toContainText("Luck")
  await expect(card).toContainText("Ailment Boost")
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

test("Healer's Path of Dawn surfaces the Dawn Mode indicator", async ({
  page,
}) => {
  await page.goto("/c/seed-healer")

  // Read-only viewer (signed out): the widget is just the Dawn Mode indicator.
  // Doesn't care whether it renders as a badge or a (disabled) toggle.
  const mechanic = page.getByRole("region", { name: "Archetype Mechanic" })
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
