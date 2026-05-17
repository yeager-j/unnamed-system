import { test, expect } from "@playwright/test"

test("index page loads", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.ok()).toBeTruthy()
  await expect(
    page.getByRole("heading", { name: "Project ready!" })
  ).toBeVisible()
})
