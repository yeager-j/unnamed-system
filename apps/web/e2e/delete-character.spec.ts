import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"
import { deleteTarget } from "./fixtures/delete-target"

/**
 * UNN-181 — type-to-confirm deletion. Target is the dedicated
 * `delete-target` seed character (`Wren Halloway`, owned by DEV_USER) —
 * fixture lives at `e2e/fixtures/delete-target.ts`. It exists only for
 * this spec so the happy-path test can hard-delete the row without
 * flaking the read-only specs. `db:seed` re-inserts it at the start of
 * every E2E run.
 *
 * Tests run in serial mode and depend on each other in a deliberate order:
 * the cancel and disabled-button tests run first while the row still
 * exists; the happy-path test runs last and removes it.
 */

const CHARACTER_ID = deleteTarget.characterId
const CHARACTER_NAME = deleteTarget.seed.name
const CHARACTER_SHORT_ID = deleteTarget.seed.shortId

test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

async function openDeleteDialog(page: import("@playwright/test").Page) {
  await page.goto("/")
  const card = page
    .locator('[data-slot="item"]')
    .filter({ hasText: CHARACTER_NAME })
  await card
    .getByRole("button", { name: `Actions for ${CHARACTER_NAME}` })
    .click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.getByRole("alertdialog", {
      name: new RegExp(`Delete ${CHARACTER_NAME}`),
    })
  ).toBeVisible()
}

test.describe("delete character — guarded cases", () => {
  test("Esc closes the dialog without deleting", async ({ page }) => {
    await openDeleteDialog(page)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("alertdialog")).toHaveCount(0)

    const [row] = await getDb()
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, CHARACTER_ID))
      .limit(1)
    expect(row?.id).toBe(CHARACTER_ID)
  })

  test("Cancel button closes the dialog without deleting", async ({ page }) => {
    await openDeleteDialog(page)
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("Delete forever is disabled until the typed name matches", async ({
    page,
  }) => {
    await openDeleteDialog(page)
    const confirm = page.getByRole("button", { name: "Delete forever" })
    await expect(confirm).toBeDisabled()

    const input = page.getByRole("textbox", {
      name: `Type ${CHARACTER_NAME} to confirm`,
    })
    await input.fill("not the right name")
    await expect(confirm).toBeDisabled()

    await input.fill(CHARACTER_NAME)
    await expect(confirm).toBeEnabled()

    await page.keyboard.press("Escape")
  })
})

test.describe("delete character — happy path", () => {
  test("confirming removes the row, the roster card, and 404s the public URL", async ({
    page,
  }) => {
    await openDeleteDialog(page)
    await page
      .getByRole("textbox", { name: `Type ${CHARACTER_NAME} to confirm` })
      .fill(CHARACTER_NAME)
    await page.getByRole("button", { name: "Delete forever" }).click()

    // The card disappears from the roster after `router.refresh()` lands.
    await expect(
      page.locator('[data-slot="item"]').filter({ hasText: CHARACTER_NAME })
    ).toHaveCount(0)
    await expect(page.getByRole("alertdialog")).toHaveCount(0)

    // Persistence: row and dependent rows are gone (cascade).
    const surviving = await getDb()
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, CHARACTER_ID))
    expect(surviving).toHaveLength(0)

    // Public URL is 404 immediately.
    const response = await page.goto(`/c/${CHARACTER_SHORT_ID}`)
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole("heading", { name: "Character not found" })
    ).toBeVisible()
  })
})
