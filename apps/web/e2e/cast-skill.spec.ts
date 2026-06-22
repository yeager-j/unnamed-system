import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { createCastTarget } from "./fixtures/cast-target"
import { cleanup, createTracker } from "./fixtures/factory"

/**
 * UNN-225: owner-mode Cast on the Combat tab. Pressing Cast in the Skill
 * popover deducts the resolved cost from HP or SP, refuses to drop the
 * character to 0 HP via a Skill, and never rolls damage or applies effects.
 *
 * All tests target an ephemeral, factory-minted cast-target (Cassia Vance,
 * Warrior Rank 2) — factory lives at `e2e/fixtures/cast-target.ts`. The active
 * Archetype carries both Cleave (5%-HP, exercises the HP-percent + "would drop
 * HP to 0" path) and Windblade (4 SP, exercises the flat-SP path), so other
 * write specs can race with it freely.
 */

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createCastTarget>>

/**
 * Opens the SkillCard popover for `skillName` by clicking its row inside
 * the Combat-tab Skills region. The row's trigger is a button whose
 * accessible name concatenates the cost / damage-type / title / tagline,
 * so the safest match is `getByRole("button")` filtered by skill name
 * substring.
 */
async function openSkillPopover(page: Page, skillName: string): Promise<void> {
  await page
    .getByRole("region", { name: "Skills" })
    .getByRole("button", { name: new RegExp(skillName) })
    .click()
}

/** Snapshot-check: no Sonner toast is currently rendered. See e2e/README.md. */
async function expectNoToast(page: Page): Promise<void> {
  const count = await page.locator("[data-sonner-toast]").count()
  expect(count).toBe(0)
}

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createCastTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test.describe("Cast affordance gating", () => {
  test("signed-out viewer sees the Skill row but no Cast button in its popover", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await target.reset()
      await page.goto(target.url)
      await expect(
        page.getByRole("heading", { name: target.name })
      ).toBeVisible()

      await openSkillPopover(page, "Cleave")
      // The popover's stats grid still renders, but the owner-only Cast
      // footer must be absent on the public sheet.
      await expect(
        page.getByRole("button", { name: "Cast", exact: true })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})

test.describe("owner Cast — happy paths", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("Cast on an SP Skill deducts the cost and persists across reload", async ({
    page,
  }) => {
    await page.goto(target.url)
    const beforePools = await target.getPools()

    await openSkillPopover(page, "Windblade")
    await page.getByRole("button", { name: "Cast", exact: true }).click()
    await page.waitForLoadState("networkidle")

    // Pool persisted at SP − 4 (Windblade's flat cost).
    const afterPools = await target.getPools()
    expect(afterPools.currentSP).toBe(beforePools.currentSP - 4)
    expect(afterPools.currentHP).toBe(beforePools.currentHP)

    await page.reload()
    // Header reflects the new SP. Cassia is Balanced path → max SP 50.
    await expect(page.getByText(`${afterPools.currentSP} / 50`)).toBeVisible()
    await expectNoToast(page)
  })

  test("Cast on an HP-percent Skill deducts the resolved amount from HP", async ({
    page,
  }) => {
    await page.goto(target.url)
    const beforePools = await target.getPools()

    await openSkillPopover(page, "Cleave")
    await page.getByRole("button", { name: "Cast", exact: true }).click()
    await page.waitForLoadState("networkidle")

    // Cleave is 5% HP, floored at 1: at max HP 20 the resolved cost is 1.
    const afterPools = await target.getPools()
    expect(afterPools.currentHP).toBe(beforePools.currentHP - 1)
    expect(afterPools.currentSP).toBe(beforePools.currentSP)
    await expectNoToast(page)
  })
})

test.describe("owner Cast — pool boundary", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("at HP equal to the cost, Cast disables and explains why on hover", async ({
    page,
  }) => {
    // Cleave costs 1 HP. With currentHP = 1, casting it would drop the
    // character to 0 — PRD §7.2 forbids this, so the button must be
    // disabled and the tooltip must surface the reason.
    await target.setCurrentHP(1)
    await page.goto(target.url)

    await openSkillPopover(page, "Cleave")
    const castButton = page.getByRole("button", { name: "Cast", exact: true })
    await expect(castButton).toBeDisabled()

    // Hovering the disabled button surfaces the reason via Tooltip. The
    // button is wrapped in a tabIndex span so Base UI's Tooltip can target
    // even a disabled child — hover the parent rather than the button.
    const wrapper = castButton.locator(
      "xpath=ancestor::*[@data-slot='tooltip-trigger'][1]"
    )
    await wrapper.hover()
    await expect(page.getByText("Would drop HP to 0")).toBeVisible()

    // Pool is unchanged by the hover.
    const pools = await target.getPools()
    expect(pools.currentHP).toBe(1)
  })

  test("at SP below the cost, Cast disables with 'Not enough SP'", async ({
    page,
  }) => {
    // Windblade costs 4 SP. Set SP to 3 and the same disabled / tooltip
    // contract should apply on the SP branch.
    await target.setCurrentSP(3)
    await page.goto(target.url)

    await openSkillPopover(page, "Windblade")
    const castButton = page.getByRole("button", { name: "Cast", exact: true })
    await expect(castButton).toBeDisabled()

    const wrapper = castButton.locator(
      "xpath=ancestor::*[@data-slot='tooltip-trigger'][1]"
    )
    await wrapper.hover()
    await expect(page.getByText("Not enough SP")).toBeVisible()

    const pools = await target.getPools()
    expect(pools.currentSP).toBe(3)
  })
})
