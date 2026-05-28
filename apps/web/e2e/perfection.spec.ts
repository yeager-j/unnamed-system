import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  getPerfectionTargetRank,
  perfectionTarget,
  resetPerfectionTarget,
  setPerfectionTargetRank,
} from "./fixtures/perfection-target"

/**
 * UNN-228: owner-mode Perfection counter on the Warrior's mechanic widget.
 * Two surfaces under test:
 *
 *  1. Engine integration — stepping Perfection up adds +N to the Warrior's
 *     Attack Rolls through the existing `attackRoll` Effect. The Cleave
 *     Skill card is the canonical witness (mirrors `mechanics.spec.ts`):
 *     Strength (+2) + Perfection (B) (+2) = Cleave Attack Roll +4.
 *  2. Stepper + Reset boundaries — `−` disabled at D, `+` disabled at S,
 *     Reset jumps any non-D rank straight back to D in one click.
 *
 * All tests share `perfectionTarget`'s row, so the describe block is `serial`.
 */

const CHARACTER_URL = perfectionTarget.url

test.describe.configure({ mode: "serial" })

test.describe("owner Perfection editing", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetPerfectionTarget()
  })

  test("stepping up to B feeds Perfection (B) +2 into Cleave's Attack Roll", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    for (let i = 0; i < 2; i++) {
      await page.getByRole("button", { name: "Increase Perfection" }).click()
      // Wait for each write to commit before the next click so the
      // optimistic frame and the persisted vitalsVersion stay in lockstep.
      await expect.poll(getPerfectionTargetRank).toBe(i + 1)
    }

    expect(await getPerfectionTargetRank()).toBe(2)

    // Open Cleave's Skill card and assert the engine's resolved Attack Roll
    // includes the Perfection contribution with attribution intact.
    await page.getByRole("button", { name: /Cleave/ }).click()
    const card = page.getByRole("dialog")
    await expect(card).toContainText(/Attack Roll\s*\+\s*4/)
    await expect(card).toContainText("Strength")
    await expect(card).toContainText("Perfection (B)")
  })

  test("stepper clamps at D and S; Reset jumps back to D", async ({ page }) => {
    await page.goto(CHARACTER_URL)

    // Starting at D: − and Reset disabled, + enabled.
    await expect(
      page.getByRole("button", { name: "Decrease Perfection" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Reset Perfection to D" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Increase Perfection" })
    ).toBeEnabled()

    // Jump to S via a DB poke and reload — burns 4 fewer clicks and keeps
    // the assertion focused on the clamp + reset behavior.
    await setPerfectionTargetRank(4)
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Increase Perfection" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Decrease Perfection" })
    ).toBeEnabled()

    // Reset jumps straight back to D in one click; both the persisted rank
    // and the − button re-disable.
    await page.getByRole("button", { name: "Reset Perfection to D" }).click()
    await expect.poll(getPerfectionTargetRank).toBe(0)
    await expect(
      page.getByRole("button", { name: "Decrease Perfection" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Reset Perfection to D" })
    ).toBeDisabled()
  })
})
