import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createPathOfDawnTarget } from "./fixtures/path-of-dawn-target"

/**
 * UNN-230: owner-mode Dawn Mode toggle on the Healer's Path of Dawn widget.
 * The toggle is the whole write surface — per-enemy Lumina tracking is out of
 * the app. Assertions poll the persisted flag so they confirm the server write,
 * not just the optimistic UI.
 *
 * Shares the one ephemeral target row, so the describe block is `serial`.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createPathOfDawnTarget>>

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createPathOfDawnTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("owner Dawn Mode toggle", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("toggles Dawn Mode on and back off", async ({ page }) => {
    await page.goto(target.url)

    const toggle = page.getByRole("button", { name: "Dawn Mode" })
    await expect(toggle).toHaveAttribute("aria-pressed", "false")

    await toggle.click()
    await expect.poll(target.getDawnMode).toBe(true)
    await expect(toggle).toHaveAttribute("aria-pressed", "true")

    await toggle.click()
    await expect.poll(target.getDawnMode).toBe(false)
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
  })
})
