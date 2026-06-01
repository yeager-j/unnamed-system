import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  combatStateTarget,
  getCombatStateTargetState,
  resetCombatStateTarget,
  setCombatStateTargetState,
} from "./fixtures/combat-state-target"

/**
 * UNN-226: owner-mode Combat State editing on the Combat tab. Covers the
 * five surfaces the ticket added — Ailment picker, Battle Condition axis
 * selects, Charged / Concentrating toggles, Exhaustion +/- stepper, and the
 * header-right Clear button — plus the cross-cutting gating (public sheet
 * shows none of the controls). All tests target the dedicated
 * `combatStateTarget` row so the other write specs can race with these
 * freely.
 */

const CHARACTER_URL = combatStateTarget.url

test.describe.configure({ mode: "serial" })

test.describe("Combat State gating", () => {
  test("signed-out viewer does not see any owner controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await resetCombatStateTarget()
      await setCombatStateTargetState({
        ailments: ["burn"],
        exhaustion: 2,
      })
      await page.goto(CHARACTER_URL)
      await expect(
        page.getByRole("heading", { name: combatStateTarget.seed.name })
      ).toBeVisible()

      // Owner controls absent
      await expect(
        page.getByRole("button", { name: "Clear", exact: true })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Set ailment" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Edit ailments" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Increase exhaustion" })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Decrease exhaustion" })
      ).toHaveCount(0)

      // Read-only content still rendered
      await expect(page.getByText("Burn", { exact: true })).toBeVisible()
      await expect(page.getByText("Level: 2", { exact: true })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})

test.describe("owner Combat State editing", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetCombatStateTarget()
  })

  test("set an ailment via the picker and persist it", async ({ page }) => {
    await page.goto(CHARACTER_URL)

    await page.getByRole("button", { name: "Set ailment" }).click()
    await page.getByRole("button", { name: /^Burn/ }).click()
    // Close the popover so the network request settles.
    await page.keyboard.press("Escape")
    await page.waitForLoadState("networkidle")

    const after = await getCombatStateTargetState()
    expect(after.ailments).toEqual(["burn"])

    await expect(page.getByText("Burn", { exact: true })).toBeVisible()
  })

  test("Downed coexists with another ailment in the picker", async ({
    page,
  }) => {
    // Seed Downed via a DB poke so the popover only needs one in-session
    // click to add Freeze on top of it. Two optimistic writes in a single
    // popover session detach the row elements between renders and flake
    // here; the picker's coexistence behavior is what we want to verify,
    // not that two consecutive popover clicks both land.
    await setCombatStateTargetState({ ailments: ["downed"] })
    await page.goto(CHARACTER_URL)

    await page.getByRole("button", { name: "Edit ailments" }).click()
    await page.getByRole("button", { name: /^Freeze/ }).click()
    await page.keyboard.press("Escape")
    await page.waitForLoadState("networkidle")

    const after = await getCombatStateTargetState()
    expect(after.ailments).toContain("downed")
    expect(after.ailments).toContain("freeze")
    expect(after.ailments).toHaveLength(2)
  })

  test("toggling a battle condition axis persists and re-renders", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    await page
      .getByRole("combobox", { name: "Attack battle condition" })
      .click()
    await page.getByRole("option", { name: /Increased/ }).click()
    await page.waitForLoadState("networkidle")

    const after = await getCombatStateTargetState()
    expect(after.battleConditions?.attack).toBe("increased")
    expect(after.battleConditions?.defense).toBe("neutral")
    expect(after.battleConditions?.hitEvasion).toBe("neutral")

    await expect(
      page.getByRole("combobox", { name: "Attack battle condition" })
    ).toContainText("Increased")
  })

  test("Charged and Concentrating toggles flip independently", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    await page.getByRole("button", { name: "Charged", exact: true }).click()
    // Poll DB until the first write commits — networkidle alone fires before
    // the action's revalidation cycle has settled and would let click 2
    // dispatch before the server has the new vitalsVersion.
    await expect
      .poll(
        async () =>
          (await getCombatStateTargetState()).battleConditions?.charged
      )
      .toBe(true)

    await page
      .getByRole("button", { name: "Concentrating", exact: true })
      .click()
    await expect
      .poll(
        async () =>
          (await getCombatStateTargetState()).battleConditions?.concentrating
      )
      .toBe(true)

    const after = await getCombatStateTargetState()
    expect(after.battleConditions?.charged).toBe(true)
    expect(after.battleConditions?.concentrating).toBe(true)
  })

  test("Exhaustion stepper clamps at 0 and persists +1", async ({ page }) => {
    await page.goto(CHARACTER_URL)

    // − is disabled at the 0 starting state.
    await expect(
      page.getByRole("button", { name: "Decrease exhaustion" })
    ).toBeDisabled()

    await page.getByRole("button", { name: "Increase exhaustion" }).click()
    await page.waitForLoadState("networkidle")

    const after = await getCombatStateTargetState()
    expect(after.exhaustion).toBe(1)
    await expect(page.getByText("Level: 1", { exact: true })).toBeVisible()

    // − is now enabled.
    await expect(
      page.getByRole("button", { name: "Decrease exhaustion" })
    ).toBeEnabled()
  })

  test("Clear wipes ailments + battle conditions but leaves Exhaustion alone", async ({
    page,
  }) => {
    await setCombatStateTargetState({
      ailments: ["burn"],
      battleConditions: {
        attack: "increased",
        defense: "decreased",
        hitEvasion: "neutral",
        charged: true,
        concentrating: true,
      },
      exhaustion: 2,
    })
    await page.goto(CHARACTER_URL)

    await page.getByRole("button", { name: "Clear", exact: true }).click()
    await page.waitForLoadState("networkidle")

    const after = await getCombatStateTargetState()
    expect(after.ailments).toEqual([])
    expect(after.battleConditions?.attack).toBe("neutral")
    expect(after.battleConditions?.defense).toBe("neutral")
    expect(after.battleConditions?.hitEvasion).toBe("neutral")
    expect(after.battleConditions?.charged).toBe(false)
    expect(after.battleConditions?.concentrating).toBe(false)
    // Exhaustion is dungeoneering state; Clear deliberately leaves it.
    expect(after.exhaustion).toBe(2)
    await expect(page.getByText("Level: 2", { exact: true })).toBeVisible()
  })

  test("Clear button is disabled when there is nothing to clear", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)
    await expect(
      page.getByRole("button", { name: "Clear", exact: true })
    ).toBeDisabled()
  })
})
