import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"
import { createDeleteTarget } from "./fixtures/delete-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * UNN-181 — type-to-confirm deletion. Target is an ephemeral, factory-minted
 * character (`Wren Halloway`, owned by the dev user) that exists only for this
 * spec, so the happy-path test can hard-delete the row without flaking the
 * read-only specs.
 *
 * Tests run in serial mode and depend on each other in a deliberate order: the
 * cancel and disabled-button tests run first while the row still exists; the
 * happy-path test runs last and removes it. `afterAll` cleanup is a no-op by
 * then.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createDeleteTarget>>

test.describe.configure({ mode: "serial" })
test.use({ storageState: STORAGE_STATE })

test.beforeAll(async () => {
  target = await createDeleteTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

async function openDeleteDialog(page: import("@playwright/test").Page) {
  await page.goto("/")
  const card = page
    .locator('[data-slot="item"]')
    .filter({ hasText: target.name })
  await card.getByRole("button", { name: `Actions for ${target.name}` }).click()
  await page.getByRole("menuitem", { name: "Delete" }).click()
  await expect(
    page.getByRole("alertdialog", {
      name: new RegExp(`Delete ${target.name}`),
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
      .where(eq(characters.id, target.id))
      .limit(1)
    expect(row?.id).toBe(target.id)
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
      name: `Type ${target.name} to confirm`,
    })
    await input.fill("not the right name")
    await expect(confirm).toBeDisabled()

    await input.fill(target.name)
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
      .getByRole("textbox", { name: `Type ${target.name} to confirm` })
      .fill(target.name)
    await page.getByRole("button", { name: "Delete forever" }).click()

    // The card disappears from the roster after `router.refresh()` lands.
    await expect(
      page.locator('[data-slot="item"]').filter({ hasText: target.name })
    ).toHaveCount(0)
    await expect(page.getByRole("alertdialog")).toHaveCount(0)

    // Persistence: row and dependent rows are gone (cascade).
    const surviving = await getDb()
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.id, target.id))
    expect(surviving).toHaveLength(0)

    // Public URL is 404 immediately.
    const response = await page.goto(`/c/${target.shortId}`)
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole("heading", { name: "Character not found" })
    ).toBeVisible()
  })
})
