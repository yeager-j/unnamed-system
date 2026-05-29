import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  getPathOfDawnTargetDawnMode,
  pathOfDawnTarget,
  resetPathOfDawnTarget,
} from "./fixtures/path-of-dawn-target"

/**
 * UNN-230: owner-mode Dawn Mode toggle on the Healer's Path of Dawn widget.
 * The toggle is the whole write surface — per-enemy Lumina tracking is out of
 * the app. Assertions poll the persisted flag so they confirm the server write,
 * not just the optimistic UI.
 *
 * Shares `pathOfDawnTarget`'s row, so the describe block is `serial`.
 */

const CHARACTER_URL = pathOfDawnTarget.url

test.describe.configure({ mode: "serial" })

test.describe("owner Dawn Mode toggle", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetPathOfDawnTarget()
  })

  test("toggles Dawn Mode on and back off", async ({ page }) => {
    await page.goto(CHARACTER_URL)

    const toggle = page.getByRole("button", { name: "Dawn Mode" })
    await expect(toggle).toHaveAttribute("aria-pressed", "false")

    await toggle.click()
    await expect.poll(getPathOfDawnTargetDawnMode).toBe(true)
    await expect(toggle).toHaveAttribute("aria-pressed", "true")

    await toggle.click()
    await expect.poll(getPathOfDawnTargetDawnMode).toBe(false)
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
  })
})
