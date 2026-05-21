import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Demonstrates the auth fixture (UNN-185 Part 2): specs that need an
 * authenticated session opt into the storage state written by `auth.setup.ts`
 * via `test.use({ storageState })`. The signed-in chrome (avatar + dropdown)
 * replaces the "Sign in with Google" CTA when the session cookie is honoured
 * by `auth()` on the server.
 *
 * Existing public-page specs (home, character-sheet, etc.) intentionally do
 * NOT opt in, so they keep running unauthenticated.
 */
test.use({ storageState: STORAGE_STATE })

test("signed-in chrome renders for the seeded dev user", async ({ page }) => {
  const response = await page.goto("/")
  expect(response?.ok()).toBeTruthy()

  await expect(
    page.getByRole("button", { name: "Open account menu" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Sign in with Google" })
  ).toHaveCount(0)
})
