import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createInheritanceSlotsTarget } from "./fixtures/inheritance-slots-target"

/**
 * UNN-241: owner-mode Inheritance Slot configuration (PRD §7.8). Covers the AC:
 *
 *  1. The grouped picker — sources are the *other* unlocked Archetypes, Skills
 *     are gated to the source's current Rank, Synthesis Skills are excluded, and
 *     an "Empty slot" clear option is present.
 *  2. Persistence + engine interplay — selecting a Skill writes the owning
 *     Archetype's `inheritanceSlots` and (because Warrior is active) threads the
 *     inherited Skill into the Combat-tab Skills list; clearing removes it.
 *  3. Read-only gating — a signed-out viewer sees the slot's contents but no
 *     edit affordance.
 *
 * Tests 1–2 write the Warrior row, so the block is serial and resets the slots
 * to empty before each.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createInheritanceSlotsTarget>>

const archetypesUrl = () => `${target.url}?tab=archetypes`

const EDIT_SLOT_1 = "Edit Inheritance Slot 1"

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createInheritanceSlotsTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("owner Inheritance Slot configuration", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("picker groups sources, gates by Rank, and excludes Synthesis", async ({
    page,
  }) => {
    await page.goto(archetypesUrl())

    await page.getByRole("combobox", { name: EDIT_SLOT_1 }).click()

    // Mage (Rank 2) offers its Rank 1–2 Skills; Knight (Rank 1) only its Rank 1.
    await expect(page.getByRole("option", { name: /Agi/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /Bufu/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /Skewer/ })).toBeVisible()
    // The "Empty slot" clear option is always available.
    await expect(page.getByRole("option", { name: "Empty slot" })).toBeVisible()

    // Over-Rank Skills (Mage Rank 3 Zio), the owner's own Skills (Warrior
    // Cleave), and Synthesis Skills (Mage's Elemental Apocalypse) are excluded.
    await expect(page.getByRole("option", { name: /Zio/ })).toHaveCount(0)
    await expect(page.getByRole("option", { name: /Cleave/ })).toHaveCount(0)
    await expect(
      page.getByRole("option", { name: /Elemental Apocalypse/ })
    ).toHaveCount(0)
  })

  test("configuring a slot persists it and threads the Skill into Combat", async ({
    page,
  }) => {
    await page.goto(archetypesUrl())

    await page.getByRole("combobox", { name: EDIT_SLOT_1 }).click()
    await page.getByRole("option", { name: /Agi/ }).click()

    // The slot now names its source Archetype and renders the inherited Skill.
    await expect(page.getByText(/from Mage/)).toBeVisible()

    // It persisted to the Warrior row's `inheritanceSlots`.
    await expect.poll(target.getWarriorSlots).toEqual([
      {
        slotIndex: 0,
        sourceCharacterArchetypeId: target.archetypeRowId("mage"),
        skillKey: "agi",
      },
    ])

    // And — Warrior being active — the engine threads it into the Skills list.
    await page.getByRole("tab", { name: "Combat" }).click()
    await expect(
      page
        .getByRole("region", { name: "Skills" })
        .getByRole("button", { name: /Agi/ })
    ).toBeVisible()
  })

  test("clearing a slot drops the inherited Skill", async ({ page }) => {
    await page.goto(archetypesUrl())

    await page.getByRole("combobox", { name: EDIT_SLOT_1 }).click()
    await page.getByRole("option", { name: /Agi/ }).click()
    await expect(page.getByText(/from Mage/)).toBeVisible()

    await page.getByRole("combobox", { name: EDIT_SLOT_1 }).click()
    await page.getByRole("option", { name: "Empty slot" }).click()

    await expect(page.getByText(/from Mage/)).toHaveCount(0)
    await expect
      .poll(target.getWarriorSlots)
      .toEqual([
        { slotIndex: 0, sourceCharacterArchetypeId: null, skillKey: null },
      ])

    await page.getByRole("tab", { name: "Combat" }).click()
    await expect(
      page
        .getByRole("region", { name: "Skills" })
        .getByRole("button", { name: /Agi/ })
    ).toHaveCount(0)
  })

  test("read-only viewer sees slot contents but no edit control", async ({
    page,
    browser,
  }) => {
    // Configure a slot as the owner first so there is content to read; wait for
    // the write to land in the DB before the signed-out reader loads it.
    await page.goto(archetypesUrl())
    await page.getByRole("combobox", { name: EDIT_SLOT_1 }).click()
    await page.getByRole("option", { name: /Agi/ }).click()
    await expect(page.getByText(/from Mage/)).toBeVisible()
    await expect.poll(target.getWarriorSlots).toEqual([
      {
        slotIndex: 0,
        sourceCharacterArchetypeId: target.archetypeRowId("mage"),
        skillKey: "agi",
      },
    ])

    const context = await browser.newContext({ storageState: undefined })
    const reader = await context.newPage()
    try {
      await reader.goto(archetypesUrl())
      // The slot's contents are visible…
      await expect(reader.getByText(/from Mage/)).toBeVisible()
      // …but the owner-only edit affordance is absent.
      await expect(
        reader.getByRole("combobox", { name: EDIT_SLOT_1 })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
