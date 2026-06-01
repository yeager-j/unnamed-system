import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import {
  atlasTarget,
  getAtlasTargetArchetypes,
  getAtlasTargetSavedRanks,
  resetAtlasTarget,
  setAtlasTargetSavedRanks,
} from "./fixtures/atlas-target"

/**
 * UNN-239: the Lineage Atlas — unlock + rank up Archetypes by spending Saved
 * Archetype Ranks. Covers the AC:
 *
 *  1. Entry point — a permanent Atlas link on the owner's Archetypes tab.
 *  2. Unlock — confirm flow inserts the Archetype, flips the card to owned, and
 *     decrements the sidebar count + Saved-Ranks counter (optimistic + persisted).
 *  3. Rank up to Mastery — Warrior at Rank 4 ranks up to 5 and reads "Mastered".
 *  4. No Saved Ranks — the action button is disabled, everything else browsable.
 *  5. Panel dismissal via Esc.
 *  6. Unlocked-only filter — narrows the sidebar/trees to unlocked Lineages.
 *
 * Plus UNN-276's public read-only view: a signed-out visitor renders the Atlas
 * map with no owner controls (separate, non-serial describe at the bottom).
 *
 * The owner tests spend Ranks / mutate the roster, so that block is serial and
 * resets the target to its seed board before each.
 */

const ATLAS_URL = `${atlasTarget.url}/archetypes/atlas`

test.describe.configure({ mode: "serial" })

test.describe("Lineage Atlas owner flows", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetAtlasTarget()
  })

  test("Archetypes tab links permanently to the Atlas", async ({ page }) => {
    await page.goto(`${atlasTarget.url}?tab=archetypes`)
    await expect(
      page.getByRole("link", { name: "Open Lineage Atlas" })
    ).toBeVisible()
  })

  test("unlocks an un-owned Archetype, updating card, sidebar, and counter", async ({
    page,
  }) => {
    await page.goto(ATLAS_URL)

    const sidebar = page.getByRole("navigation", { name: "Lineages" })
    await sidebar.getByRole("button", { name: /^Mage/ }).click()

    const tree = page.getByRole("group", { name: "Mage Lineage tree" })
    await tree.getByRole("button", { name: /^Mage/ }).click()

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Unlock" })
      .click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Unlock" })
      .click()
    await page.keyboard.press("Escape")

    await expect(tree.getByRole("button", { name: /^Mage/ })).toContainText(
      "Rank 1/5"
    )
    await expect(sidebar.getByRole("button", { name: /^Mage/ })).toContainText(
      "1/1"
    )

    await expect
      .poll(async () =>
        (await getAtlasTargetArchetypes()).some(
          (a) => a.archetypeKey === "mage"
        )
      )
      .toBe(true)
    expect(await getAtlasTargetSavedRanks()).toBe(2)
  })

  test("ranks up an owned Archetype into Mastery", async ({ page }) => {
    await page.goto(ATLAS_URL)

    const tree = page.getByRole("group", { name: "Warrior Lineage tree" })
    await tree.getByRole("button", { name: /^Warrior/ }).click()

    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Rank up" })
      .click()
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Rank up" })
      .click()

    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Mastered" })
    ).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(tree.getByRole("button", { name: /^Warrior/ })).toContainText(
      "Mastered"
    )

    await expect
      .poll(
        async () =>
          (await getAtlasTargetArchetypes()).find(
            (a) => a.archetypeKey === "warrior"
          )?.rank
      )
      .toBe(5)
    expect(await getAtlasTargetSavedRanks()).toBe(2)
  })

  test("disables the action with no Saved Ranks but stays browsable", async ({
    page,
  }) => {
    await setAtlasTargetSavedRanks(0)
    await page.goto(ATLAS_URL)

    await page
      .getByRole("navigation", { name: "Lineages" })
      .getByRole("button", { name: /^Mage/ })
      .click()
    await page
      .getByRole("group", { name: "Mage Lineage tree" })
      .getByRole("button", { name: /^Mage/ })
      .click()

    await expect(
      page.getByRole("dialog").getByRole("button", { name: "Unlock" })
    ).toBeDisabled()
  })

  test("dismisses the detail panel with Escape", async ({ page }) => {
    await page.goto(ATLAS_URL)

    const panel = page.getByRole("dialog")
    await page
      .getByRole("group", { name: "Warrior Lineage tree" })
      .getByRole("button", { name: /^Warrior/ })
      .click()
    await expect(panel).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(panel).toHaveCount(0)
  })

  test("the Unlocked only filter narrows the trees to unlocked Lineages", async ({
    page,
  }) => {
    await page.goto(ATLAS_URL)

    const sidebar = page.getByRole("navigation", { name: "Lineages" })
    // Off: every Lineage is listed, including the still-locked siblings.
    await expect(sidebar.getByRole("button", { name: /^Mage/ })).toBeVisible()

    await page.getByRole("switch", { name: "Unlocked only" }).click()

    // On: only the Lineage with an unlocked Archetype (Warrior) survives.
    await expect(
      sidebar.getByRole("button", { name: /^Warrior/ })
    ).toBeVisible()
    await expect(sidebar.getByRole("button", { name: /^Mage/ })).toHaveCount(0)
    await expect(
      page.getByRole("group", { name: "Warrior Lineage tree" })
    ).toBeVisible()
  })
})

test.describe("Lineage Atlas public read-only view", () => {
  test("a signed-out visitor sees a read-only Atlas without owner controls", async ({
    page,
  }) => {
    await page.goto(ATLAS_URL)

    // No redirect — the Atlas renders the map for everyone (UNN-276).
    await expect(page).toHaveURL(/\/archetypes\/atlas$/)
    await expect(
      page.getByRole("navigation", { name: "Lineages" })
    ).toBeVisible()
    const tree = page.getByRole("group", { name: "Warrior Lineage tree" })
    await expect(tree).toBeVisible()

    // The owner-only planning chrome is gone: no recommendations rail, no
    // Saved-Ranks strip.
    await expect(
      page.getByRole("region", { name: "Recommendations" })
    ).toHaveCount(0)
    await expect(page.getByText(/Ranks? to spend/)).toHaveCount(0)

    // The detail panel opens read-only — no Unlock / Rank up spend action.
    await tree.getByRole("button", { name: /^Warrior/ }).click()
    const panel = page.getByRole("dialog")
    await expect(panel).toBeVisible()
    await expect(
      panel.getByRole("button", { name: /Rank up|Unlock/ })
    ).toHaveCount(0)
  })
})
