import { expect, test } from "@playwright/test"
import { and, eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Builder shell — the contract this PR delivers (UNN-214):
 *
 * - A fresh draft lands on `/corpus`.
 * - The chapter header renders the Roman + serif title for each movement.
 * - The Continue link advances the row's `builderStep` cursor AND navigates.
 * - `/builder/{shortId}` (no movement segment) redirects to the cursor,
 *   not always Movement 1.
 * - Visited dots navigate back; upcoming dots are inert.
 * - Movement 4 (Persona) has no Continue link and a named back-link.
 *
 * Movement bodies are placeholders here — per-movement tickets
 * (UNN-215 → UNN-218) own end-to-end content coverage for each movement.
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

async function readBuilderStep(shortId: string): Promise<number> {
  const [row] = await getDb()
    .select({ builderStep: characters.builderStep })
    .from(characters)
    .where(eq(characters.shortId, shortId))
    .limit(1)
  if (!row) throw new Error(`no row for shortId=${shortId}`)
  return row.builderStep
}

/**
 * Movement 1's Continue is gated on an Origin Archetype being selected
 * (UNN-215). Specs that need to walk past Corpus expand the Warrior card and
 * click its Choose button to satisfy the gate before they ever touch Continue.
 */
async function chooseWarriorOrigin(
  page: import("@playwright/test").Page
): Promise<void> {
  await page
    .getByRole("button", { name: "Expand Warrior Lineage details" })
    .click()
  await page.getByRole("button", { name: "Choose Warrior as Origin" }).click()
  await expect(
    page.getByRole("button", { name: "Warrior chosen" })
  ).toBeVisible()
}

test.describe("builder shell", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("renders chapter chrome, advances the cursor on Continue, and bounces /builder to the cursor", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await expect(
      page.getByRole("heading", { level: 1, name: "Corpus" })
    ).toBeVisible()
    await expect(
      page.getByText("The body your character will inhabit.")
    ).toBeVisible()

    await chooseWarriorOrigin(page)

    await page.getByRole("button", { name: "Continue to Ortus" }).click()
    await expect(page).toHaveURL(`/builder/${shortId}/ortus`)
    await expect(
      page.getByRole("heading", { level: 1, name: "Ortus" })
    ).toBeVisible()
    expect(await readBuilderStep(shortId)).toBe(1)

    await page.goto(`/builder/${shortId}`)
    await expect(page).toHaveURL(`/builder/${shortId}/ortus`)

    await page.getByRole("link", { name: "Movement 1 — Corpus" }).click()
    await expect(page).toHaveURL(`/builder/${shortId}/corpus`)
  })

  test("Movement 4 (Persona) has a named back-link and no Continue", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await chooseWarriorOrigin(page)

    await page.getByRole("button", { name: "Continue to Ortus" }).click()
    await page.getByRole("button", { name: "Continue to Animus" }).click()
    await page.getByRole("button", { name: "Continue to Persona" }).click()

    await expect(page).toHaveURL(`/builder/${shortId}/persona`)
    await expect(
      page.getByRole("heading", { level: 1, name: "Persona" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^Continue to/ })
    ).toHaveCount(0)
    await expect(
      page.getByRole("link", { name: "Back to Animus" })
    ).toBeVisible()
  })
})

/**
 * Movement 1 content tests (UNN-215). These cover the per-movement contract
 * the shell tests don't reach: Path-responsive grid sort, gate behavior,
 * affinity rendering, and the single-card-expanded invariant. They share the
 * file-level serial mode + DEV_USER cleanup with the shell suite.
 */
test.describe("movement 1 — corpus", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("Path selection persists and re-sorts the Archetype grid by fit", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    const firstCard = page.locator("[data-archetype]").first()

    // Fresh draft defaults to Balanced — Healer (suggestedPath: balanced)
    // is the first card in the bucket-then-tiebreaker order.
    await expect(firstCard).toHaveAttribute("data-archetype", "healer")

    await page.getByRole("radio", { name: /Skill-Focused/ }).click()
    await expect(page.getByText(/Sorted by fit with your/)).toContainText(
      "Skill-Focused"
    )
    await expect(firstCard).toHaveAttribute("data-archetype", "mage")

    await page.getByRole("radio", { name: /Health-Focused/ }).click()
    await expect(page.getByText(/Sorted by fit with your/)).toContainText(
      "Health-Focused"
    )
    await expect(firstCard).toHaveAttribute("data-archetype", "warrior")

    const [row] = await getDb()
      .select({ pathChoice: characters.pathChoice })
      .from(characters)
      .where(eq(characters.shortId, shortId))
      .limit(1)
    expect(row?.pathChoice).toBe("health-focused")
  })

  test("Continue is gated on an Origin until one is chosen", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)

    await expect(
      page.getByRole("button", { name: "Continue to Ortus" })
    ).toBeDisabled()

    await chooseWarriorOrigin(page)

    await expect(
      page.getByRole("button", { name: "Continue to Ortus" })
    ).toBeEnabled()
  })

  test("Origin selection persists across reload", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await chooseWarriorOrigin(page)

    // The optimistic UI flips to "Warrior chosen" immediately; the Server
    // Action commits asynchronously. Poll until the row reflects the write
    // before reloading so we're not racing the action.
    await expect
      .poll(
        async () => {
          const [row] = await getDb()
            .select({ activeArchetypeId: characters.activeArchetypeId })
            .from(characters)
            .where(eq(characters.shortId, shortId))
            .limit(1)
          return row?.activeArchetypeId ?? null
        },
        { timeout: 5000 }
      )
      .not.toBeNull()

    await page.reload()

    const warriorCard = page.locator('[data-archetype="warrior"]')
    await expect(
      warriorCard.getByLabel("Currently selected as Origin")
    ).toBeVisible()
  })

  test("compact card surfaces every non-neutral affinity", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)

    // Healer has three: Strike weak, Light resist, Dark weak. Regression
    // guard for the original "pick one Resist + one Weak" bug.
    const healerCard = page.locator('[data-archetype="healer"]')
    await expect(healerCard).toContainText("Strike Weak")
    await expect(healerCard).toContainText("Light Resist")
    await expect(healerCard).toContainText("Dark Weak")
  })

  test("only one Archetype detail is expanded at a time", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)

    const mageButton = page.getByRole("button", {
      name: /Mage Lineage details$/,
    })
    const healerButton = page.getByRole("button", {
      name: /Healer Lineage details$/,
    })

    await mageButton.click()
    await expect(mageButton).toHaveAttribute("aria-expanded", "true")

    await healerButton.click()
    await expect(mageButton).toHaveAttribute("aria-expanded", "false")
    await expect(healerButton).toHaveAttribute("aria-expanded", "true")

    await healerButton.click()
    await expect(healerButton).toHaveAttribute("aria-expanded", "false")
  })
})

/**
 * Movement 4 content tests (UNN-218). Covers Persona's contract: auto-focus
 * on the name field, the Finalize gate, and the commit-to-sheet redirect.
 */
test.describe("movement 4 — persona", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("auto-focus lands on the name field on page load", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.goto(`/builder/${shortId}/persona`)

    const nameInput = page.getByRole("textbox", { name: "Character name" })
    await expect(nameInput).toBeFocused()
  })

  test("Finalize stays disabled until both Origin and name are set", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    // Skip Movement 1 to confirm Finalize honors the cross-movement gate.
    await page.goto(`/builder/${shortId}/persona`)

    const finalizeButton = page.getByRole("button", {
      name: "Finalize character",
    })
    await expect(finalizeButton).toBeDisabled()

    // Even with a name, the missing Origin keeps Finalize disabled.
    const nameInput = page.getByRole("textbox", { name: "Character name" })
    await nameInput.fill("Garron Vey")
    // Blur to flush the debounced auto-save before navigating away.
    await nameInput.blur()
    await expect(finalizeButton).toBeDisabled()
    await expect
      .poll(
        async () => {
          const [row] = await getDb()
            .select({ name: characters.name })
            .from(characters)
            .where(eq(characters.shortId, shortId))
            .limit(1)
          return row?.name ?? null
        },
        { timeout: 5000 }
      )
      .toBe("Garron Vey")

    // Backtrack to Corpus, pick an Origin, return — Finalize now enables
    // (the name persisted server-side, so re-rendering /persona shows it
    // pre-filled and both gates pass).
    await page.goto(`/builder/${shortId}/corpus`)
    await chooseWarriorOrigin(page)
    await expect
      .poll(
        async () => {
          const [row] = await getDb()
            .select({ activeArchetypeId: characters.activeArchetypeId })
            .from(characters)
            .where(eq(characters.shortId, shortId))
            .limit(1)
          return row?.activeArchetypeId ?? null
        },
        { timeout: 5000 }
      )
      .not.toBeNull()

    await page.goto(`/builder/${shortId}/persona`)
    await expect(finalizeButton).toBeEnabled()
  })

  test("Finalize commits the character and redirects to the editable sheet", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/builder\/[a-z0-9]+\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await chooseWarriorOrigin(page)
    await expect
      .poll(
        async () => {
          const [row] = await getDb()
            .select({ activeArchetypeId: characters.activeArchetypeId })
            .from(characters)
            .where(eq(characters.shortId, shortId))
            .limit(1)
          return row?.activeArchetypeId ?? null
        },
        { timeout: 5000 }
      )
      .not.toBeNull()

    await page.goto(`/builder/${shortId}/persona`)

    const nameInput = page.getByRole("textbox", { name: "Character name" })
    await nameInput.fill("Garron Vey")
    // Blur to flush the debounced auto-save before the finalize click.
    await nameInput.blur()
    await expect
      .poll(
        async () => {
          const [row] = await getDb()
            .select({ name: characters.name })
            .from(characters)
            .where(eq(characters.shortId, shortId))
            .limit(1)
          return row?.name ?? null
        },
        { timeout: 5000 }
      )
      .toBe("Garron Vey")

    await page.getByRole("button", { name: "Finalize character" }).click()

    // Sheet route appends `?tab=combat` for the default tab, hence the regex.
    await expect(page).toHaveURL(new RegExp(`/c/${shortId}(\\?|$)`))

    const [row] = await getDb()
      .select({ status: characters.status, name: characters.name })
      .from(characters)
      .where(eq(characters.shortId, shortId))
      .limit(1)
    expect(row?.status).toBe("finalized")
    expect(row?.name).toBe("Garron Vey")
  })
})
