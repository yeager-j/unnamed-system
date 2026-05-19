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

  // Vitals: HP + SP each render a bar; Prisma shows current / max.
  await expect(page.getByRole("progressbar")).toHaveCount(2)
  await expect(page.getByText("HP")).toBeVisible()
  await expect(page.getByText("SP")).toBeVisible()
  await expect(page.locator('dt:has-text("Prisma") ~ dd')).toHaveText("2 / 2")

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

test("unknown shortId returns a 404 not-found page", async ({ page }) => {
  const response = await page.goto("/c/does-not-exist")
  expect(response?.status()).toBe(404)
  await expect(
    page.getByRole("heading", { name: "Character not found" })
  ).toBeVisible()
})
