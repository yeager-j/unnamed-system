import { expect, test, type Page } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Character builder wizard E2E (UNN-204, UNN-205). Covers the surfaces the
 * builder ACs call out: the Step 1 happy path with auto-save + required-field
 * gate, the non-owner WIP dialog on `/c/{shortId}` for a draft, the
 * "multiple drafts per user" UX on My Characters, and the Step 2
 * Path/Origin pickers including persistence and the resolved-cost popover
 * inside the Archetype drawer.
 *
 * Each test creates one or more new draft rows for `DEV_USER`. A
 * `beforeEach` wipes those rows so a re-run starts clean even if a prior
 * test crashed mid-flight, and the seed (`lib/db/seed.ts`) does the same
 * sweep so drafts don't accumulate across CI invocations.
 *
 * Serialized because every test mutates the My Characters list for the
 * same dev user; running them in parallel would let one test's "two drafts
 * visible" assertion catch another test's transient state, and a Step 2
 * mutation could land on a draft the `clearDevUserDrafts` of a sibling
 * test had wiped.
 */

const DEV_USER_ID = "dev-user-claude"

test.describe.configure({ mode: "serial" })

async function clearDevUserDrafts(): Promise<void> {
  await getDb()
    .delete(characters)
    .where(
      and(eq(characters.ownerId, DEV_USER_ID), eq(characters.status, "draft"))
    )
}

function shortIdFromBuilderUrl(url: string): string {
  const match = url.match(/\/builder\/([a-z0-9]+)\//)
  if (!match) throw new Error(`expected a /builder/{shortId}/ URL, got ${url}`)
  return match[1]!
}

test.describe("character builder", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("create → auto-save name → Next enables → advance → Back preserves the value → /c redirects the owner", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/basic-info$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    // Fresh draft seeds `name = "Untitled character"` — Next gates until
    // the player replaces it. The placeholder text is in the input on
    // load (the value, not a placeholder attribute) so focusing the
    // input auto-selects it.
    const nameInput = page.getByRole("textbox", { name: "Name" })
    await expect(nameInput).toHaveValue("Untitled character")

    const nextBtn = page.getByRole("button", { name: /^Next$/ })
    await expect(nextBtn).toBeDisabled()

    await nameInput.fill("Aurelius Vex")
    await nameInput.blur()
    // Cover the 500ms debounce + Server Action round-trip +
    // revalidateCharacter that re-renders the page with the new prop.
    await page.waitForLoadState("networkidle")
    await expect(nextBtn).toBeEnabled()

    await nextBtn.click()
    await expect(page).toHaveURL(`/builder/${shortId}/path-and-archetype`)
    // UNN-205 fills in the Step 2 body. Confirm we landed on the new step
    // by asserting on the Path picker's RadioGroup — the "Step 2" tests below
    // own the deep coverage of this step.
    await expect(page.getByRole("radiogroup")).toBeVisible()

    // Base UI's Button with `nativeButton={false}` renders the Link as an
    // `<a>` but keeps `role="button"`, so the accessible role is "button"
    // even though the underlying element is an anchor.
    await page.getByRole("button", { name: "Back" }).click()
    await expect(page).toHaveURL(`/builder/${shortId}/basic-info`)
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Aurelius Vex"
    )

    // The owner pasting `/c/{shortId}` for their own draft is bounced
    // straight into the builder at the highest step they've reached
    // (cursor is 1 after the Next click above).
    await page.goto(`/c/${shortId}`)
    await expect(page).toHaveURL(`/builder/${shortId}/path-and-archetype`)
  })

  test("a draft's /c/{shortId} shows a non-dismissable WIP dialog to non-owners", async ({
    browser,
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/basic-info$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    const guestContext = await browser.newContext({ storageState: undefined })
    try {
      const guest = await guestContext.newPage()
      await guest.goto(`/c/${shortId}`)
      const dialog = guest.getByRole("alertdialog", {
        name: /Character not ready yet/,
      })
      await expect(dialog).toBeVisible()
      // AlertDialog's default contract is to ignore Escape + backdrop
      // click; the absence of `AlertDialogCancel` removes the only
      // dismiss path.
      await guest.keyboard.press("Escape")
      await expect(dialog).toBeVisible()
    } finally {
      await guestContext.close()
    }
  })

  test("multiple drafts coexist on My Characters with their own Resume CTAs", async ({
    page,
  }) => {
    const createBtn = page.getByRole("button", { name: "Create new character" })

    await page.goto("/")
    await createBtn.click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/basic-info$/)
    const firstShortId = shortIdFromBuilderUrl(page.url())

    await page.goto("/")
    await createBtn.click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/basic-info$/)
    const secondShortId = shortIdFromBuilderUrl(page.url())
    expect(secondShortId).not.toBe(firstShortId)

    await page.goto("/")
    const resumeLinks = page.getByRole("link", { name: "Resume building" })
    await expect(resumeLinks).toHaveCount(2)
    const hrefs = await resumeLinks.evaluateAll((els) =>
      (els as HTMLAnchorElement[]).map((el) => el.getAttribute("href"))
    )
    expect(hrefs).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`/builder/${firstShortId}/`),
        expect.stringContaining(`/builder/${secondShortId}/`),
      ])
    )
  })

  // ─── Step 2 — Path & Archetype (UNN-205) ────────────────────────────────────

  /**
   * Walks Step 1's required-field gate so the suite can land cleanly on Step 2
   * with a known starting state. Returns the draft's `shortId` for follow-up
   * assertions on the URL.
   */
  async function advanceToStep2(page: Page): Promise<string> {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/basic-info$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    const nameInput = page.getByRole("textbox", { name: "Name" })
    await nameInput.fill("Step 2 Tester")
    await nameInput.blur()
    await page.waitForLoadState("networkidle")

    await page.getByRole("button", { name: /^Next$/ }).click()
    await expect(page).toHaveURL(`/builder/${shortId}/path-and-archetype`)
    return shortId
  }

  test("Step 2: Path defaults to Balanced; switching path + selecting Origin persists across reload and enables Next", async ({
    page,
  }) => {
    const shortId = await advanceToStep2(page)

    // Default seeded path is "balanced" — the radio is pre-selected on landing.
    await expect(page.getByRole("radio", { name: /Balanced/ })).toBeChecked()

    // Origin is unset, so Next is disabled.
    const nextBtn = page.getByRole("button", { name: /^Next$/ })
    await expect(nextBtn).toBeDisabled()

    // The FieldLabel wraps the radio + content, so the whole card is the click
    // target — clicking the radio role exercises that path.
    await page.getByRole("radio", { name: /Health-Focused/ }).click()
    await page.waitForLoadState("networkidle")
    await expect(
      page.getByRole("radio", { name: /Health-Focused/ })
    ).toBeChecked()

    // Pick Mage as Origin. With Origin set, Next enables.
    const mageCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Mage Lineage" })
    await mageCard.getByRole("button", { name: "Select as Origin" }).click()
    await page.waitForLoadState("networkidle")
    await expect(nextBtn).toBeEnabled()

    // Refresh — both choices persist.
    await page.reload()
    await expect(page).toHaveURL(`/builder/${shortId}/path-and-archetype`)
    await expect(
      page.getByRole("radio", { name: /Health-Focused/ })
    ).toBeChecked()
    await expect(
      mageCard.getByRole("button", { name: "Selected" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^Next$/ })).toBeEnabled()
  })

  test("Step 2: switching Origin replaces the prior selection", async ({
    page,
  }) => {
    await advanceToStep2(page)

    const warriorCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Warrior Lineage" })
    const mageCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Mage Lineage" })

    await warriorCard.getByRole("button", { name: "Select as Origin" }).click()
    await page.waitForLoadState("networkidle")
    await expect(
      warriorCard.getByRole("button", { name: "Selected" })
    ).toBeVisible()

    await mageCard.getByRole("button", { name: "Select as Origin" }).click()
    await page.waitForLoadState("networkidle")

    await expect(
      mageCard.getByRole("button", { name: "Selected" })
    ).toBeVisible()
    await expect(
      warriorCard.getByRole("button", { name: "Select as Origin" })
    ).toBeVisible()
  })

  test("Step 2: the Archetype drawer renders the full stat block; the Skill popover shows the resolved cost + Attack Roll", async ({
    page,
  }) => {
    await advanceToStep2(page)

    const warriorCard = page
      .locator('[data-slot="card"]')
      .filter({ hasText: "Warrior Lineage" })
    await warriorCard.getByRole("button", { name: "Show details" }).click()

    const drawer = page.getByRole("dialog", { name: "Warrior" })
    await expect(drawer).toBeVisible()

    // Every ranked Skill heading renders (Ranks 1 through 5).
    for (const rank of [1, 2, 3, 4, 5]) {
      await expect(
        drawer.getByRole("heading", { name: `Rank ${rank}` })
      ).toBeVisible()
    }
    // Synthesis Skill section is present.
    await expect(
      drawer.getByRole("heading", { name: "Synthesis Skill" })
    ).toBeVisible()

    // Click the Cleave row — its popover should show a resolved Cost row and
    // the Attack Roll header. Cleave is the Rank-1 Warrior Skill (5% HP).
    await drawer.getByRole("button", { name: /Cleave/ }).click()
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover).toBeVisible()
    // Default path is Balanced (20 max HP); 5% floors to 1 HP via the
    // `resolveSkillCost` floor-at-1 rule.
    await expect(popover.getByText("Cost")).toBeVisible()
    await expect(popover.getByText("1 HP", { exact: true })).toBeVisible()
    // Attack Roll header surfaces the Warrior's Strength (+2) as the resolved
    // total.
    await expect(
      popover.getByRole("heading", { name: /Attack Roll \+ 2/ })
    ).toBeVisible()
  })
})
