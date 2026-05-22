import { expect, test } from "@playwright/test"

test("public character sheet renders for a seeded character", async ({
  page,
}) => {
  const response = await page.goto("/c/seed-warrior")
  expect(response?.ok()).toBeTruthy()
  await expect(page.getByRole("heading", { name: "Brann Holt" })).toBeVisible()

  // Header (persistent, above the tabs): level, active Archetype, Victories
  // progress, currency with unit, portrait placeholder.
  await expect(page.getByText(/Level 1 · Warrior/)).toBeVisible()
  await expect(page.getByText(/Victories 0\/7/)).toBeVisible()
  await expect(page.getByText("0 gp")).toBeVisible()
  await expect(page.getByText("BH")).toBeVisible()

  // Vitals: HP + SP each render a bar (Hit/Skill Dice and Prisma are
  // intentionally not surfaced in the header).
  await expect(page.getByRole("progressbar")).toHaveCount(2)
  await expect(page.getByText("HP", { exact: true })).toBeVisible()
  await expect(page.getByText("SP", { exact: true })).toBeVisible()

  // Attributes: in the persistent header (not a tab). Warrior R1 base, no
  // Mastery, longsword has no stat effects — the Archetype block, minus on Magic.
  const attributes = page.getByRole("region", { name: "Attributes" })
  await expect(attributes.getByText("Strength")).toBeVisible()
  await expect(attributes.getByText("+2")).toBeVisible()
  await expect(attributes.getByText("Magic")).toBeVisible()
  await expect(attributes.getByText("−1")).toBeVisible()

  // Combat is the default tab: Affinities is mounted. All 11 damage types
  // present; Almighty is never charted.
  const affinities = page.getByRole("region", { name: "Affinities" })
  for (const damageType of [
    "Slash",
    "Pierce",
    "Strike",
    "Fire",
    "Ice",
    "Wind",
    "Elec",
    "Aether",
    "Psy",
    "Light",
    "Dark",
  ]) {
    await expect(
      affinities.getByText(damageType, { exact: true })
    ).toBeVisible()
  }
  await expect(affinities.getByText("Almighty")).toHaveCount(0)

  // Virtues lives on the Explore tab — switch to it (Base UI unmounts inactive
  // panels by default). Empty Spark log ⇒ count 0/7 and no "×n" breakdown.
  await page.getByRole("tab", { name: "Explore" }).click()
  const virtues = page.getByRole("region", { name: "Virtues" })
  await expect(virtues.getByText(/Sparks:\s*0\s*\/\s*7/)).toBeVisible()
  await expect(virtues.getByText(/×/)).toHaveCount(0)
})

test("a Fallen, max-level character is marked Fallen and reads level 30", async ({
  page,
}) => {
  const response = await page.goto("/c/seed-fallen")
  expect(response?.ok()).toBeTruthy()
  await expect(
    page.getByRole("heading", { name: "Halvard Crowe" })
  ).toBeVisible()

  // AC: level reads the bare number, no "/ 30" progression implication.
  await expect(page.getByText(/Level 30 · Warrior/)).toBeVisible()
  await expect(page.getByText(/Victories 0\/7/)).toBeVisible()
  await expect(page.getByText(/30\s*\/\s*30/)).toHaveCount(0)

  // AC: visibly marked Fallen (text label, not just an empty bar) and HP 0/max.
  await expect(page.getByText("Fallen").first()).toBeVisible()
  await expect(page.getByText(/0 \/ \d+/).first()).toBeVisible()
})

test("Virtues Spark breakdown reflects the seeded log", async ({ page }) => {
  const response = await page.goto("/c/seed-mage")
  expect(response?.ok()).toBeTruthy()

  // Victories progress shows in the persistent header.
  await expect(page.getByText(/Victories 3\/7/)).toBeVisible()

  // Virtues is on the Explore tab. seed-mage log [wisdom, focus, wisdom,
  // expression]: 4 / 7, breakdown ordered count-desc then Virtue order.
  await page.getByRole("tab", { name: "Explore" }).click()
  const virtues = page.getByRole("region", { name: "Virtues" })
  await expect(virtues.getByText(/Sparks:\s*4\s*\/\s*7/)).toBeVisible()
  await expect(
    virtues.getByText("Wisdom ×2, Expression ×1, Focus ×1")
  ).toBeVisible()
})

test("Combat State reflects seeded ailment, conditions, flags, and exhaustion", async ({
  page,
}) => {
  // seed-mage seeds the most interesting combat state: Burn ailment, Attack
  // increased, Defense decreased, Hit/Evasion neutral, Concentrating on,
  // Charged off, Exhaustion 2.
  await page.goto("/c/seed-mage")
  const combat = page.getByRole("region", { name: "Combat State" })

  await expect(combat.getByText("Burn", { exact: true })).toBeVisible()
  await expect(
    combat.getByText("Loses 10% of max HP at the end of each turn.")
  ).toBeVisible()

  await expect(combat.getByText("Increased")).toBeVisible()
  await expect(combat.getByText("Decreased")).toBeVisible()
  await expect(combat.getByText("Neutral")).toBeVisible()

  await expect(combat.getByText("Concentrating")).toBeVisible()
  await expect(combat.getByText("Charged")).toHaveCount(0)

  // seed-mage carries a non-null partyComposition (Mage:2, Warlock:1) so the
  // read-only Party sub-block has data; both Lineages are listed with their
  // counts. Each entry is `<Label>` + tabular count, so we scope to the
  // <li> row to pin the count to its Lineage.
  const mageRow = combat.locator("li", { hasText: "Mage Lineage" })
  await expect(mageRow).toContainText("2")
  const warlockRow = combat.locator("li", { hasText: "Warlock Lineage" })
  await expect(warlockRow).toContainText("1")

  await expect(combat.getByText("Exhaustion")).toBeVisible()

  // seed-warrior has no ailments, all-neutral conditions, no flags, zero
  // Exhaustion, and a null partyComposition — the clean empty state.
  await page.goto("/c/seed-warrior")
  const empty = page.getByRole("region", { name: "Combat State" })
  await expect(empty.getByLabel("No ailment")).toBeVisible()
  await expect(empty.getByText("Neutral")).toHaveCount(3)
  await expect(empty.getByText("Charged")).toHaveCount(0)
  await expect(empty.getByText("Concentrating")).toHaveCount(0)
  await expect(empty.getByLabel("No party composition")).toBeVisible()
  await expect(empty.getByText("Exhaustion")).toBeVisible()
})

test("sheet tabs: default Combat, switching mirrors to ?tab=, deep-linkable", async ({
  page,
}) => {
  await page.goto("/c/seed-warrior")

  for (const name of ["Combat", "Explore", "Inventory", "Archetypes"]) {
    await expect(page.getByRole("tab", { name })).toBeVisible()
  }

  // Default tab is Combat: its trigger is selected and Affinities is mounted.
  await expect(page.getByRole("tab", { name: "Combat" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
  await expect(page.getByRole("region", { name: "Affinities" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Virtues" })).toHaveCount(0)

  // Switching mirrors to ?tab= and swaps the mounted panel.
  await page.getByRole("tab", { name: "Explore" }).click()
  await expect(page).toHaveURL(/\?tab=explore/)
  await expect(page.getByRole("region", { name: "Virtues" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Affinities" })).toHaveCount(0)

  // Deep link opens directly on the requested tab.
  await page.goto("/c/seed-warrior?tab=archetypes")
  await expect(page.getByRole("tab", { name: "Archetypes" })).toHaveAttribute(
    "aria-selected",
    "true"
  )
})

test("unknown shortId returns a 404 not-found page", async ({ page }) => {
  const response = await page.goto("/c/does-not-exist")
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole("heading", { name: "Character not found" })
  ).toBeVisible()
})
