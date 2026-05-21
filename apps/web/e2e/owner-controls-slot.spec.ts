import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"

/**
 * UNN-176: the header reserves an empty owner-mode affordance slot rendered
 * only when the viewer owns the sheet. Three cases must hold so downstream
 * tickets can drop controls in without re-implementing the check:
 *
 *  - signed-out → slot absent (crawlers / unauthenticated guests)
 *  - signed-in non-owner → slot absent (same surface as public)
 *  - signed-in owner → slot present
 *
 * The slot's only contract here is its `data-testid`; the visible "Owner
 * controls" placeholder text is incidental and may change as future tickets
 * fill it in.
 */

const OWNED_BY_SEED_USER = "/c/seed-warrior"
const OWNED_BY_DEV_USER = "/c/claude-1"

test.describe("signed-out viewer", () => {
  test("does not render the owner controls slot on a SEED_USER sheet", async ({
    page,
  }) => {
    const response = await page.goto(OWNED_BY_SEED_USER)
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByTestId("owner-controls-slot")).toHaveCount(0)
  })

  test("does not render the owner controls slot on a DEV_USER sheet", async ({
    page,
  }) => {
    const response = await page.goto(OWNED_BY_DEV_USER)
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByTestId("owner-controls-slot")).toHaveCount(0)
  })
})

test.describe("signed-in viewer", () => {
  test.use({ storageState: STORAGE_STATE })

  test("sees the owner controls slot on a sheet they own", async ({ page }) => {
    const response = await page.goto(OWNED_BY_DEV_USER)
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByTestId("owner-controls-slot")).toBeVisible()
  })

  test("does not see the owner controls slot on a sheet owned by someone else", async ({
    page,
  }) => {
    const response = await page.goto(OWNED_BY_SEED_USER)
    expect(response?.ok()).toBeTruthy()
    await expect(page.getByTestId("owner-controls-slot")).toHaveCount(0)
  })
})
