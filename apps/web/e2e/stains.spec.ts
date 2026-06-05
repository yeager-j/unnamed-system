import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createStainsTarget } from "./fixtures/stains-target"

/**
 * UNN-229: owner-mode Stains controls on the Mage's mechanic widget. Each tile
 * is a per-slot popover — an empty slot offers the five elements to fill it, a
 * full one offers a replacement (the "add when full → pick which to replace"
 * gesture) plus Remove — and a one-click Clear empties all four.
 *
 * The slot index is the per-field write key, so the assertions poll the
 * persisted tokens (not just the optimistic UI) to confirm the server merged
 * the single slot it was handed.
 *
 * All tests share the one ephemeral target row, so the block is `serial`.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createStainsTarget>>

const slotButton = (n: number) => new RegExp(`^Stain slot ${n},`)

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createStainsTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("owner Stains editing", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("picks an element to fill an empty slot", async ({ page }) => {
    await page.goto(target.url)

    await page.getByRole("button", { name: slotButton(1) }).click()
    await page.getByRole("button", { name: "Fire", exact: true }).click()

    await expect.poll(target.getTokens).toEqual(["fire", null, null, null])
    await expect(
      page.getByRole("button", {
        name: "Stain slot 1, Fire — change or remove",
      })
    ).toBeVisible()
  })

  test("replaces a Stain when all four slots are full", async ({ page }) => {
    await target.setTokens(["fire", "ice", "elec", "wind"])
    await page.goto(target.url)

    // No empty slots remain, so adding is replacing: open the Fire slot and
    // choose Light in its place.
    await page
      .getByRole("button", { name: "Stain slot 1, Fire — change or remove" })
      .click()
    await page.getByRole("button", { name: "Light", exact: true }).click()

    await expect
      .poll(target.getTokens)
      .toEqual(["light", "ice", "elec", "wind"])
  })

  test("removes a Stain", async ({ page }) => {
    await target.setTokens(["fire", "ice", null, null])
    await page.goto(target.url)

    await page
      .getByRole("button", { name: "Stain slot 2, Ice — change or remove" })
      .click()
    await page.getByRole("button", { name: "Remove Stain" }).click()

    await expect.poll(target.getTokens).toEqual(["fire", null, null, null])
  })

  test("clears all Stains and disables Clear when empty", async ({ page }) => {
    await target.setTokens(["fire", "ice", "elec", "wind"])
    await page.goto(target.url)

    const clear = page.getByRole("button", { name: "Clear all Stains" })
    await expect(clear).toBeEnabled()

    await clear.click()

    await expect.poll(target.getTokens).toEqual([null, null, null, null])
    await expect(clear).toBeDisabled()
  })
})
