import { test, expect } from "@playwright/test"

test("public character sheet renders for a seeded character", async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  const response = await page.goto("/c/seed-warrior")
  expect(response?.ok()).toBeTruthy()
  await expect(page.getByRole("heading", { name: "Brann Holt" })).toBeVisible()

  // Header: level, active Archetype, currency with unit, portrait placeholder.
  await expect(page.getByText(/Level 1 · Warrior/)).toBeVisible()
  await expect(page.getByText("0 gp")).toBeVisible()
  await expect(page.getByText("BH")).toBeVisible()

  // Vitals: HP + SP each render a bar (Hit/Skill Dice and Prisma are
  // intentionally not surfaced in the header).
  await expect(page.getByRole("progressbar")).toHaveCount(2)
  await expect(page.getByText("HP")).toBeVisible()
  await expect(page.getByText("SP")).toBeVisible()

  // Attributes: Warrior R1 base, no Mastery, longsword has no stat effects —
  // displayed scores are the Archetype block with a true minus on Magic.
  const attributes = page.getByRole("region", { name: "Attributes" })
  await expect(attributes.getByText("Strength")).toBeVisible()
  await expect(attributes.getByText("+2")).toBeVisible()
  await expect(attributes.getByText("Magic")).toBeVisible()
  await expect(attributes.getByText("−1")).toBeVisible()

  // Virtues: ranks render and, with an empty Spark log, the count shows 0 / 7
  // and the per-Virtue breakdown line is suppressed (no "×n" anywhere).
  const virtues = page.getByRole("region", { name: "Virtues" })
  await expect(virtues.getByText(/Sparks:\s*0\s*\/\s*7/)).toBeVisible()
  await expect(virtues.getByText(/×/)).toHaveCount(0)

  // Affinities: all 11 damage types present; Almighty is never charted.
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

  // AC: no console errors or React hydration warnings on a fresh seed sheet.
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test("a Fallen, max-level character is marked Fallen and reads level 30", async ({
  page,
}) => {
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))

  const response = await page.goto("/c/seed-fallen")
  expect(response?.ok()).toBeTruthy()
  await expect(
    page.getByRole("heading", { name: "Halvard Crowe" })
  ).toBeVisible()

  // AC: level reads the bare number, no "/ 30" progression implication.
  await expect(page.getByText(/Level 30 · Warrior/)).toBeVisible()
  await expect(page.getByText(/30\s*\/\s*30/)).toHaveCount(0)

  // AC: visibly marked Fallen (text label, not just an empty bar) and HP 0/max.
  await expect(page.getByText("Fallen").first()).toBeVisible()
  await expect(page.getByText(/0 \/ \d+/).first()).toBeVisible()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test("Virtues Spark breakdown reflects the seeded log", async ({ page }) => {
  const response = await page.goto("/c/seed-mage")
  expect(response?.ok()).toBeTruthy()

  // seed-mage log is [wisdom, focus, wisdom, expression]: 4 / 7, and the
  // breakdown is ordered count-desc then Virtue order.
  const virtues = page.getByRole("region", { name: "Virtues" })
  await expect(virtues.getByText(/Sparks:\s*4\s*\/\s*7/)).toBeVisible()
  await expect(
    virtues.getByText("Wisdom ×2, Expression ×1, Focus ×1")
  ).toBeVisible()
})

test("unknown shortId returns a 404 not-found page", async ({ page }) => {
  const response = await page.goto("/c/does-not-exist")
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole("heading", { name: "Character not found" })
  ).toBeVisible()
})
