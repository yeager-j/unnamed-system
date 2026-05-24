import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Character builder wizard E2E (UNN-204). Three specs cover the surfaces
 * the AC calls out: the create + auto-save + advance happy path with the
 * required-field gate, the non-owner WIP dialog on `/c/{shortId}` for a
 * draft, and the "multiple drafts per user" UX on the My Characters grid.
 *
 * Each test creates one or more new draft rows for `DEV_USER`. A
 * `beforeEach` wipes those rows so a re-run starts clean even if a prior
 * test crashed mid-flight, and the seed (`lib/db/seed.ts`) does the same
 * sweep so drafts don't accumulate across CI invocations.
 *
 * Serialized because all three tests mutate the My Characters list for
 * the same dev user; running them in parallel would let one test's "two
 * drafts visible" assertion catch another test's transient state.
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
    await expect(
      page.getByText(/Path & Archetype is coming soon/)
    ).toBeVisible()

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
})
