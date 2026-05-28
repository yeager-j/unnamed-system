import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  getValorTargetValue,
  resetValorTarget,
  setValorTargetValue,
  valorTarget,
} from "./fixtures/valor-target"

/**
 * UNN-227: owner-mode Valor counter on the Knight's mechanic widget. Two
 * surfaces under test:
 *
 *  1. Engine integration — Valor crossing the 3+ threshold flips the
 *     Knight's Slash / Pierce / Strike affinities to Resist via the
 *     existing Affinity-effect pipeline. Pierce and Strike are the cleanest
 *     witnesses: Knight starts with Slash → Resist innately, but Pierce and
 *     Strike are Neutral until Valor's effect lands.
 *  2. Stepper boundaries — `−` disabled at 0, `+` disabled at 7, clicks
 *     decrement/increment in unit steps with the optimistic UI converging
 *     on the persisted server value.
 *
 * All tests share `valorTarget`'s row, so the describe block is `serial`.
 */

const CHARACTER_URL = valorTarget.url

test.describe.configure({ mode: "serial" })

test.describe("owner Valor editing", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetValorTarget()
  })

  test("incrementing to 3 flips Pierce and Strike to Resist via the engine", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    const affinities = page.getByRole("region", { name: "Affinities" })
    const affinityValue = (name: string) =>
      affinities
        .locator("dt", { hasText: new RegExp(`^${name}$`) })
        .locator("xpath=following-sibling::dd[1]")

    // Baseline: Knight's innate Slash → Resist is present, but Pierce and
    // Strike are Neutral (rendered as the em-dash placeholder).
    await expect(affinityValue("Slash")).toHaveText("Resist")
    await expect(affinityValue("Pierce")).toHaveText("—")
    await expect(affinityValue("Strike")).toHaveText("—")

    for (let i = 0; i < 3; i++) {
      await page.getByRole("button", { name: "Increase Valor" }).click()
      // Wait for each write to commit before the next click — the action
      // returns a new vitalsVersion and the page re-derives state on
      // revalidation; clicking again before that lands races on the token.
      await expect.poll(getValorTargetValue).toBe(i + 1)
    }

    expect(await getValorTargetValue()).toBe(3)

    // Pierce and Strike flipped to Resist via the engine effect; Slash
    // remains Resist (was already Resist innately).
    for (const damageType of ["Slash", "Pierce", "Strike"]) {
      await expect(affinityValue(damageType)).toHaveText("Resist")
    }
  })

  test("stepper clamps at 0 and 7", async ({ page }) => {
    await page.goto(CHARACTER_URL)

    // Starting at 0: − is disabled, + is enabled.
    await expect(
      page.getByRole("button", { name: "Decrease Valor" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Increase Valor" })
    ).toBeEnabled()

    // One click off the floor re-enables −.
    await page.getByRole("button", { name: "Increase Valor" }).click()
    await expect.poll(getValorTargetValue).toBe(1)
    await expect(
      page.getByRole("button", { name: "Decrease Valor" })
    ).toBeEnabled()

    // Jump to the ceiling via a DB poke and reload — burns 6 fewer clicks
    // and keeps the assertion focused on the max-clamp behavior.
    await setValorTargetValue(7)
    await page.reload()
    await expect(
      page.getByRole("button", { name: "Increase Valor" })
    ).toBeDisabled()
    await expect(
      page.getByRole("button", { name: "Decrease Valor" })
    ).toBeEnabled()

    // − still works at the ceiling.
    await page.getByRole("button", { name: "Decrease Valor" }).click()
    await expect.poll(getValorTargetValue).toBe(6)
  })
})
