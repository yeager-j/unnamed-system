import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { characters, getDb, inventoryItems } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Regression suite for the UNN-180 write-pattern: a typed Server Action with
 * Zod validation, owner authorization, an optional pure engine transition,
 * a conditional UPDATE, and a client-side optimistic UI with rollback. Each
 * test here corresponds to a bug we already hit (or could plausibly hit) in
 * the iteration leading up to landing the pattern, so a regression here
 * means we've genuinely lost something.
 *
 * **Serial execution.** All tests mutate the seeded dev user's character
 * (`/c/claude-1`). Playwright is `fullyParallel`, but mode `serial` inside
 * this file keeps the writes ordered. The `beforeEach` resets the
 * character row + every inventory item to its seed defaults via the same
 * Drizzle access path `auth.setup.ts` uses, so each test starts from a
 * known state regardless of run order.
 *
 * **State scope.** Other specs (`owner-controls-slot`, `authenticated`) only
 * read from `/c/claude-1`, so the resets here don't disturb them.
 */

// Dedicated write-target seeded by `lib/db/seed.ts#WRITE_TEST_CHARACTER`. This
// character exists *only* for this spec, so mutations here can't flake
// read-only specs (`home`, `owner-controls-slot`, `authenticated`) that pin
// `claude-1` (Iris Vey).
const CHARACTER_URL = "/c/write-target"
const CHARACTER_ID = "seed-char-write-target"
const DEFAULT_NAME = "Mira Solberg"

const NAME_INPUT = "Character name"

test.describe.configure({ mode: "serial" })

async function resetCharacter(): Promise<void> {
  const db = getDb()
  await db
    .update(characters)
    .set({ name: DEFAULT_NAME })
    .where(eq(characters.id, CHARACTER_ID))
  await db
    .update(inventoryItems)
    .set({ equipped: false })
    .where(eq(inventoryItems.characterId, CHARACTER_ID))
}

async function openItemPopover(page: Page, descriptionFragment: string) {
  await page
    .getByRole("button", { name: new RegExp(descriptionFragment) })
    .click()
}

test.describe("owner affordances are gated", () => {
  test("signed-out viewer sees a static heading and no equip controls", async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    try {
      await resetCharacter()
      await page.goto(`${CHARACTER_URL}?tab=inventory`)
      await expect(
        page.getByRole("heading", { name: DEFAULT_NAME })
      ).toBeVisible()
      await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveCount(
        0
      )
      await openItemPopover(page, "standard one-handed blade")
      await expect(
        page.getByRole("button", { name: "Equip", exact: true })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Unequip", exact: true })
      ).toHaveCount(0)
    } finally {
      await context.close()
    }
  })

  test.describe("signed-in non-owner sees the same read-only view", () => {
    // Sign in as DEV_USER and visit a sheet they don't own (`seed-warrior` is
    // SEED_USER's). That gives the "signed-in-non-owner" `ViewerRole` —
    // distinct from signed-out, but the rendered affordance set is identical.
    test.use({ storageState: STORAGE_STATE })

    test("static heading, no editor, no equip controls", async ({ page }) => {
      await page.goto("/c/seed-warrior?tab=inventory")
      await expect(
        page.getByRole("heading", { name: "Brann Holt" })
      ).toBeVisible()
      await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveCount(
        0
      )
      await openItemPopover(page, "standard one-handed blade")
      await expect(
        page.getByRole("button", { name: "Equip", exact: true })
      ).toHaveCount(0)
      await expect(
        page.getByRole("button", { name: "Unequip", exact: true })
      ).toHaveCount(0)
    })
  })
})

test.describe("owner-mode write pattern", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await resetCharacter()
  })

  test("owner sees an editable name input and equip buttons", async ({
    page,
  }) => {
    await page.goto(`${CHARACTER_URL}?tab=inventory`)
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toBeVisible()
    await openItemPopover(page, "Overlapping scales")
    await expect(
      page.getByRole("button", { name: "Equip", exact: true })
    ).toBeVisible()
  })

  test("name auto-save persists across a reload", async ({ page }) => {
    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Persistent")
    await input.blur()
    // Allow the debounce + Server Action round-trip + revalidation to complete.
    await page.waitForLoadState("networkidle")
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Persistent"
    )
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
  })

  test("debounce + blur double-fire does not produce a stale toast", async ({
    page,
  }) => {
    // The original UNN-180 regression: the debounced save fired at ~500ms,
    // then `flushSave` on blur fired a *second* save for the same value with
    // the same `expectedUpdatedAt` before the first had returned — the
    // second's WHERE missed and the user saw a "Someone else updated this
    // character" toast on a perfectly normal edit. The in-flight guard in
    // `editable-character-name.tsx` closes the window; this test holds it
    // closed.
    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Race-Free")
    // Wait *past* the 500ms debounce so the save is actively in flight, then
    // blur — exactly the timing the bug needed.
    await page.waitForTimeout(550)
    await input.blur()
    // Give the page time to surface a toast if the regression returned.
    await page.waitForTimeout(2000)
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Race-Free"
    )
  })

  test("equipping armor flips the derived Slash affinity to Resist", async ({
    page,
  }) => {
    // Bladeturn Mail grants `Resist Slash`. With it equipped, the Combat
    // tab's Affinities chart must re-derive to "Resist" — proves the end of
    // the chain (engine → DB → revalidation → re-render of derived stats).
    await page.goto(`${CHARACTER_URL}?tab=combat`)
    // Affinities renders each damage type as `<div><dt>Label</dt><dd>value</dd></div>`,
    // so dt/dd are siblings via a wrapping div, not directly. Match the
    // wrapper that contains the Slash term, then read its definition.
    const slashRow = page
      .getByRole("region", { name: "Affinities" })
      .locator('div:has(> dt:text-is("Slash")) > dd')
    await expect(slashRow).toHaveText("—")

    await page.getByRole("tab", { name: "Inventory" }).click()
    await openItemPopover(page, "Overlapping scales")
    await page.getByRole("button", { name: "Equip", exact: true }).click()
    await page.waitForLoadState("networkidle")

    await page.getByRole("tab", { name: "Combat" }).click()
    await expect(slashRow).toHaveText("Resist")
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
  })

  test("unequipping armor restores the Neutral affinity", async ({ page }) => {
    // Start equipped via direct DB poke so we can isolate the unequip
    // contract from the equip contract.
    await getDb()
      .update(inventoryItems)
      .set({ equipped: true })
      .where(eq(inventoryItems.id, "seed-item-write-target-bladeturn-mail"))

    await page.goto(`${CHARACTER_URL}?tab=inventory`)
    await openItemPopover(page, "Overlapping scales")
    await page.getByRole("button", { name: "Unequip", exact: true }).click()
    await page.waitForLoadState("networkidle")

    await page.getByRole("tab", { name: "Combat" }).click()
    // Affinities renders each damage type as `<div><dt>Label</dt><dd>value</dd></div>`,
    // so dt/dd are siblings via a wrapping div, not directly. Match the
    // wrapper that contains the Slash term, then read its definition.
    const slashRow = page
      .getByRole("region", { name: "Affinities" })
      .locator('div:has(> dt:text-is("Slash")) > dd')
    await expect(slashRow).toHaveText("—")
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
  })

  test("equip then immediately edit name does not stale", async ({ page }) => {
    // Both writes mutate `characters.updatedAt`. The first version of the
    // implementation cached the token in component-local state, so the
    // name editor never saw the equip's bump — every cross-component
    // sequence returned `Result.err("stale")` and toasted. The current
    // implementation refs the token + dual-writes from both prop changes
    // and own-action success; this test exercises that.
    await page.goto(`${CHARACTER_URL}?tab=inventory`)
    await openItemPopover(page, "Overlapping scales")
    await page.getByRole("button", { name: "Equip", exact: true }).click()
    await page.waitForLoadState("networkidle")
    // Equip's popover stays open; dismiss it so the name input can grab focus.
    await page.keyboard.press("Escape")

    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Combo")
    await input.blur()
    // Cover the 500ms debounce + action round-trip; networkidle alone exits
    // the moment between fill() and the debounced POST.
    await page.waitForTimeout(1500)

    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Combo"
    )
  })

  test("edit name then immediately equip does not stale", async ({ page }) => {
    // The mirror of the above — name first, equip second. The Inventory
    // component has the same dual-writer pattern; this test verifies it.
    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Reverse")
    await input.blur()
    await page.waitForLoadState("networkidle")

    await page.getByRole("tab", { name: "Inventory" }).click()
    await openItemPopover(page, "Overlapping scales")
    await page.getByRole("button", { name: "Equip", exact: true }).click()
    await page.waitForTimeout(1500)

    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Reverse"
    )
    await expect(page.getByText("Bladeturn Mail").first()).toBeVisible()
  })
})
