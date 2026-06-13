import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createFrenzyTarget } from "./fixtures/frenzy-target"

/**
 * Owner-mode Frenzy widget on the Berserker's mechanic widget. Two surfaces
 * under test:
 *
 *  1. Engine integration — entering Frenzy Mode with Pain emits the "+Nd4
 *     Physical" damage Effect, which the engine folds inline into every
 *     Physical Skill's damage tiers (`1d6 + 2d4 + St`). The Strike Skill Bash
 *     is the witness: its card carries the bonus only while Frenzy is active.
 *  2. Control boundaries — the Pain stepper clamps at 0 and 5; Frenzy Mode is
 *     gated on having at least 1 Pain (toggle disabled at 0).
 *
 * Assertions poll the persisted state so they confirm the server write, not
 * just the optimistic UI. All tests share the one ephemeral target row, so the
 * block is `serial`.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createFrenzyTarget>>

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createFrenzyTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("owner Frenzy editing", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("Frenzy Mode is gated on Pain and folds +Nd4 into Skill damage tiers", async ({
    page,
  }) => {
    await page.goto(target.url)

    // At 0 Pain, Frenzy Mode cannot be entered.
    const toggle = page.getByRole("button", { name: "Frenzy Mode" })
    await expect(toggle).toBeDisabled()

    // Build 2 Pain, waiting for each write to commit before the next click.
    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Increase Pain" }).click()
      await expect.poll(target.getPain).toBe(i + 1)
    }

    // Enter Frenzy Mode now that there is Pain to spend.
    await expect(toggle).toBeEnabled()
    await toggle.click()
    await expect
      .poll(async () => (await target.getState()).frenzyMode)
      .toBe(true)

    // The Bash card now folds the +2d4 Frenzy bonus into its damage tiers.
    await page.getByRole("button", { name: /Bash/ }).first().click()
    await expect(page.getByText(/\+2d4 Frenzy \(Pain 2\)/)).toBeVisible()
  })

  test("Pain stepper clamps at 0 and 5", async ({ page }) => {
    await page.goto(target.url)

    // At 0: − disabled, + enabled.
    await expect(
      page.getByRole("button", { name: "Decrease Pain" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Increase Pain" })
    ).toBeEnabled()

    // One click off the floor re-enables −.
    await page.getByRole("button", { name: "Increase Pain" }).click()
    await expect.poll(target.getPain).toBe(1)
    await expect(
      page.getByRole("button", { name: "Decrease Pain" })
    ).toBeEnabled()

    // Jump to the ceiling via a DB poke + reload, then assert the max clamp.
    await target.setState({ kind: "frenzy", pain: 5, frenzyMode: false })
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Increase Pain" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Decrease Pain" })
    ).toBeEnabled()
  })
})
