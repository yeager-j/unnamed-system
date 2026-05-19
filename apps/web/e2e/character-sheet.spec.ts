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
  await expect(
    page.getByRole("heading", { name: "Brann Holt" })
  ).toBeVisible()

  // AC: no console errors or React hydration warnings on a fresh seed sheet.
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
