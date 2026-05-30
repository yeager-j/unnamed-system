import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  archetypeSwitchTarget,
  getActiveArchetypeId,
  resetArchetypeSwitchTarget,
  switchTargetArchetypeId,
} from "./fixtures/archetype-switch-target"

/**
 * UNN-238: the owner-mode "Switch Active Archetype" control in the sheet
 * header. Covers the three things the AC turns on:
 *
 *  1. Engine integration — switching the active Archetype re-derives the
 *     whole sheet. Warrior → Mage flips Magic (−1 → +2), Ice affinity
 *     (Neutral → Resist), and the Mechanic widget (Perfection → Stains), and
 *     the new `activeArchetypeId` persists.
 *  2. The picker surface — searchable, grouped by Lineage, with the active
 *     Archetype marked selected and the non-enforced Respite reminder shown.
 *  3. Read-only gating — a signed-out viewer sees the Archetype name as plain
 *     text, with no switch affordance.
 *
 * Tests 1–2 share `archetypeSwitchTarget`'s row (test 1 writes), so the block
 * is serial and resets the active Archetype to Warrior before each.
 */

const CHARACTER_URL = archetypeSwitchTarget.url

const SWITCHER_NAME = "Switch active Archetype"

test.describe.configure({ mode: "serial" })

test.describe("owner active-Archetype switching", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetArchetypeSwitchTarget()
  })

  test("switching to Mage re-derives attributes, affinities, and the mechanic, and persists", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    const switcher = page.getByRole("combobox", { name: SWITCHER_NAME })
    const attributes = page.getByRole("region", { name: "Attributes" })
    const affinities = page.getByRole("region", { name: "Affinities" })
    const mechanic = page.getByRole("region", { name: "Archetype Mechanic" })
    const statValue = (region: typeof attributes, name: string) =>
      region
        .locator("dt", { hasText: new RegExp(`^${name}$`) })
        .locator("xpath=following-sibling::dd[1]")

    // Baseline: Warrior is active and drives the derived state.
    await expect(switcher).toContainText("Warrior")
    await expect(statValue(attributes, "Magic")).toHaveText("−1")
    await expect(statValue(affinities, "Ice")).toHaveText("—")
    await expect(mechanic).toContainText("Perfection")

    await switcher.click()
    await page.getByRole("option", { name: /Mage/ }).click()

    // Optimistic + revalidated: the header and every derived surface follow
    // the new active Archetype.
    await expect(switcher).toContainText("Mage")
    await expect(statValue(attributes, "Magic")).toHaveText("+2")
    await expect(statValue(affinities, "Ice")).toHaveText("Resist")
    await expect(mechanic).toContainText("Stains")

    // And the switch persisted to `activeArchetypeId`.
    await expect
      .poll(getActiveArchetypeId)
      .toBe(switchTargetArchetypeId("mage"))
  })

  test("picker is searchable, grouped by Lineage, and marks the active Archetype", async ({
    page,
  }) => {
    await page.goto(CHARACTER_URL)

    await page.getByRole("combobox", { name: SWITCHER_NAME }).click()

    // The non-enforced reminder rides alongside the picker.
    await expect(
      page.getByText("You may only switch Archetypes during a Respite.")
    ).toBeVisible()

    // Every unlocked Archetype is listed under its Lineage heading, with the
    // Tier · Rank · Mechanic detail line.
    await expect(
      page.getByRole("group", { name: "Warrior Lineage" })
    ).toBeVisible()
    await expect(
      page.getByRole("group", { name: "Mage Lineage" })
    ).toBeVisible()
    await expect(
      page.getByRole("group", { name: "Knight Lineage" })
    ).toBeVisible()
    await expect(
      page.getByRole("option", { name: /Mage.*Initiate · Rank 1\/5 · Stains/ })
    ).toBeVisible()

    // The active Archetype is the selected value.
    await expect(page.getByRole("option", { name: /Warrior/ })).toHaveAttribute(
      "aria-selected",
      "true"
    )

    // Typeahead filters the grouped list down to the match.
    await page
      .getByRole("combobox", { name: "Search Archetypes…" })
      .fill("knight")
    await expect(page.getByRole("option", { name: /Knight/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /Warrior/ })).toHaveCount(0)
    await expect(page.getByRole("option", { name: /Mage/ })).toHaveCount(0)
    await expect(
      page.getByRole("group", { name: "Warrior Lineage" })
    ).toHaveCount(0)
  })

  test("signed-out viewer sees the Archetype name but no switcher", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await page.goto(CHARACTER_URL)

      // The identity line still names the active Archetype…
      await expect(
        page.getByText(/Level 5 · Warrior · Victories/)
      ).toBeVisible()
      // …but the owner-only switch affordance is absent.
      await expect(
        page.getByRole("combobox", { name: SWITCHER_NAME })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
