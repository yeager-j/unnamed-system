import { expect, test } from "@playwright/test"
import { and, eq, inArray } from "drizzle-orm"

import { entity, getDb, playerCharacter } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"

/**
 * Builder E2E — rebuilt for the v2 cutover (UNN-556): a draft is an `entity`
 * row from step one, every edit writes through the entity pipeline, and
 * finalize is a validation gate + status flip that lands on My Characters.
 * The visual design (and therefore most selectors) carries over from the v1
 * suite (UNN-214..218); every DB assertion reads the `entity` row's component
 * columns.
 *
 * - A fresh draft lands on `/corpus`.
 * - The chapter header renders the Roman + serif title for each movement.
 * - The Continue link advances the row's `builderStep` cursor AND navigates.
 * - `/characters/{shortId}/builder` (no movement segment) redirects to the cursor.
 * - Per-movement writes land on their component columns (path, archetypes at
 *   the Origin auto-rank, virtues ranks, narrative fields + Knife entries).
 * - Finalize seeds the starting weapon, flips `status`, writes NO pool
 *   values, and redirects to `/`.
 */

const DEV_USER_ID = "dev-user-claude"

test.describe.configure({ mode: "serial" })

async function clearDevUserDrafts(): Promise<void> {
  const db = getDb()
  // Owner + draft status live on the PC subtype now (R3 — UNN-573); find the
  // drafts there, then drop subtype-before-substrate (the subtype FK has no cascade).
  const drafts = await db
    .select({ entityId: playerCharacter.entityId })
    .from(playerCharacter)
    .where(
      and(
        eq(playerCharacter.userId, DEV_USER_ID),
        eq(playerCharacter.status, "draft")
      )
    )
  const ids = drafts.map((d) => d.entityId)
  if (ids.length === 0) return
  await db.delete(playerCharacter).where(inArray(playerCharacter.entityId, ids))
  await db.delete(entity).where(inArray(entity.id, ids))
}

function shortIdFromBuilderUrl(url: string): string {
  const match = url.match(/\/characters\/([a-z0-9]+)\/builder\//)
  if (!match)
    throw new Error(`expected a /characters/{shortId}/builder/ URL, got ${url}`)
  return match[1]!
}

async function readEntityRow(shortId: string) {
  // Join the PC subtype so `builderStep` / `status` (moved off `entity` in R3 —
  // UNN-573) read alongside the substrate's component columns.
  const [row] = await getDb()
    .select({ entity, pc: playerCharacter })
    .from(entity)
    .innerJoin(playerCharacter, eq(playerCharacter.entityId, entity.id))
    .where(eq(entity.shortId, shortId))
    .limit(1)
  if (!row) throw new Error(`no entity row for shortId=${shortId}`)
  return {
    ...row.entity,
    builderStep: row.pc.builderStep,
    status: row.pc.status,
  }
}

/**
 * Movement 1's Continue is gated on an Origin Archetype being selected.
 * Specs that need to walk past Corpus open the Warrior card's detail dialog
 * and click its Choose button to satisfy the gate before they ever touch
 * Continue. Choosing closes the dialog, so we confirm via the card's check.
 */
async function chooseWarriorOrigin(
  page: import("@playwright/test").Page
): Promise<void> {
  await page
    .getByRole("button", { name: "View Warrior Lineage details" })
    .click()
  await page.getByRole("button", { name: "Choose Warrior as Origin" }).click()
  await expect(
    page
      .locator('[data-archetype="warrior"]')
      .getByLabel("Currently selected as Origin")
  ).toBeVisible()
}

/** Polls until the Origin landed on the `archetypes` component. */
async function expectOriginPersisted(shortId: string): Promise<void> {
  await expect
    .poll(
      async () => (await readEntityRow(shortId)).archetypes?.origin ?? null,
      {
        timeout: 5000,
      }
    )
    .toBe("warrior")
}

/**
 * Movement 2's Continue is gated on a valid creation Virtue allocation:
 * exactly one +2, two +1s, one 0. Helper for specs that walk past Ortus.
 * Each click dispatches a whole-allocation descriptor; we poll the `virtues`
 * component between clicks so the shared progression token is fresh for the
 * next dispatch.
 */
async function setValidVirtueAllocation(
  page: import("@playwright/test").Page,
  shortId: string
): Promise<void> {
  async function readRanks() {
    return (await readEntityRow(shortId)).virtues?.ranks ?? null
  }

  await page
    .locator('[data-virtue="expression"]')
    .getByRole("button", { name: "+2" })
    .click()
  await expect
    .poll(async () => (await readRanks())?.expression ?? null, {
      timeout: 5000,
    })
    .toBe(2)

  await page
    .locator('[data-virtue="empathy"]')
    .getByRole("button", { name: "+1" })
    .click()
  await expect
    .poll(async () => (await readRanks())?.empathy ?? null, { timeout: 5000 })
    .toBe(1)

  await page
    .locator('[data-virtue="wisdom"]')
    .getByRole("button", { name: "+1" })
    .click()
  await expect
    .poll(async () => (await readRanks())?.wisdom ?? null, { timeout: 5000 })
    .toBe(1)

  // Reload so the server-rendered Continue button picks up the fresh gate
  // state without racing the route's revalidation chain.
  await page.reload()
  await expect(
    page.getByRole("button", { name: "Continue to Animus" })
  ).toBeEnabled()
}

test.describe("builder shell", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("mints an entity draft, renders chapter chrome, advances the cursor on Continue, and bounces /builder to the cursor", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    // The draft IS an entity row from step one, minted with the component
    // skeleton (depletion-native zeros; creation components absent).
    const draft = await readEntityRow(shortId)
    expect(draft.status).toBe("draft")
    expect(draft.vitals).toEqual({ base: 0, damage: 0 })
    expect(draft.path).toEqual({ choice: "balanced" })
    expect(draft.archetypes).toBeNull()
    expect(draft.equipment).toBeNull()

    await expect(
      page.getByRole("heading", { level: 1, name: "Corpus" })
    ).toBeVisible()
    await expect(
      page.getByText("What shape does your power take?")
    ).toBeVisible()

    await chooseWarriorOrigin(page)

    await page.getByRole("button", { name: "Continue to Ortus" }).click()
    await expect(page).toHaveURL(`/characters/${shortId}/builder/ortus`)
    await expect(
      page.getByRole("heading", { level: 1, name: "Ortus" })
    ).toBeVisible()
    expect((await readEntityRow(shortId)).builderStep).toBe(1)

    await page.goto(`/characters/${shortId}/builder`)
    await expect(page).toHaveURL(`/characters/${shortId}/builder/ortus`)

    await page.getByRole("link", { name: "Movement 1 — Corpus" }).click()
    await expect(page).toHaveURL(`/characters/${shortId}/builder/corpus`)
  })

  test("Movement 4 (Persona) has a named back-link and no Continue", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()

    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await chooseWarriorOrigin(page)

    await page.getByRole("button", { name: "Continue to Ortus" }).click()
    await setValidVirtueAllocation(page, shortId)
    await page.getByRole("button", { name: "Continue to Animus" }).click()
    await page.getByRole("button", { name: "Continue to Persona" }).click()

    await expect(page).toHaveURL(`/characters/${shortId}/builder/persona`)
    await expect(
      page.getByRole("heading", { level: 1, name: "Persona" })
    ).toBeVisible()
    await expect(page.getByText("Who are you?")).toBeVisible()
    await expect(
      page.getByRole("button", { name: /^Continue to/ })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Back to Animus" })
    ).toBeVisible()
  })
})

/**
 * Movement 1 content tests: Path-responsive grid sort, gate behavior,
 * affinity rendering, and the single-card-expanded invariant.
 */
test.describe("movement 1 — corpus", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("Path selection persists to the path component and re-sorts the Archetype grid by fit", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
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

    await expect
      .poll(async () => (await readEntityRow(shortId)).path?.choice ?? null, {
        timeout: 5000,
      })
      .toBe("health-focused")
  })

  test("Continue is gated on an Origin until one is chosen", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)

    await expect(
      page.getByRole("button", { name: "Continue to Ortus" })
    ).toBeDisabled()

    await chooseWarriorOrigin(page)

    await expect(
      page.getByRole("button", { name: "Continue to Ortus" })
    ).toBeEnabled()
  })

  test("Origin selection mints the roster entry at the Origin auto-rank and persists across reload", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await chooseWarriorOrigin(page)
    await expectOriginPersisted(shortId)

    // Origin auto-sets Rank 2 (rulebook 1.3 / PRD §5.1) on the keyed roster.
    const archetypes = (await readEntityRow(shortId)).archetypes
    expect(archetypes?.roster).toEqual([
      { key: "warrior", rank: 2, inheritanceSlots: [] },
    ])
    expect(archetypes?.active).toBe("warrior")

    await page.reload()

    const warriorCard = page.locator('[data-archetype="warrior"]')
    await expect(
      warriorCard.getByLabel("Currently selected as Origin")
    ).toBeVisible()
  })

  test("compact card surfaces every non-neutral affinity", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)

    // Healer has three: Strike weak, Light resist, Dark weak. Regression
    // guard for the original "pick one Resist + one Weak" bug.
    const healerCard = page.locator('[data-archetype="healer"]')
    await expect(healerCard).toContainText("Strike Weak")
    await expect(healerCard).toContainText("Light Resist")
    await expect(healerCard).toContainText("Dark Weak")
  })

  test("opening a card surfaces its detail dialog; closing dismisses it", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)

    const mageCta = page.getByRole("button", { name: "Choose Mage as Origin" })
    const healerCta = page.getByRole("button", {
      name: "Choose Healer as Origin",
    })

    await page
      .getByRole("button", { name: "View Mage Lineage details" })
      .click()
    await expect(mageCta).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(mageCta).toBeHidden()

    await page
      .getByRole("button", { name: "View Healer Lineage details" })
      .click()
    await expect(healerCta).toBeVisible()
    await expect(mageCta).toBeHidden()
  })
})

/**
 * Movement 2 content tests: the Virtue allocation gate, Ancestry/Background
 * persistence on the narrative component, and the Virtue budget lockout.
 */
test.describe("movement 2 — ortus", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("Continue is gated until the Virtue allocation is valid", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.goto(`/characters/${shortId}/builder/ortus`)

    const continueButton = page.getByRole("button", {
      name: "Continue to Animus",
    })
    await expect(continueButton).toBeDisabled()

    // Allocate 1×+2 + 2×+1, sequentially so optimistic state settles between
    // clicks (each click dispatches through the provider's progression queue).
    await page
      .locator('[data-virtue="expression"]')
      .getByRole("button", { name: "+2" })
      .click()
    await expect
      .poll(
        async () =>
          (await readEntityRow(shortId)).virtues?.ranks.expression ?? null,
        { timeout: 5000 }
      )
      .toBe(2)

    await page
      .locator('[data-virtue="empathy"]')
      .getByRole("button", { name: "+1" })
      .click()
    await page
      .locator('[data-virtue="wisdom"]')
      .getByRole("button", { name: "+1" })
      .click()

    await expect(continueButton).toBeEnabled()
  })

  test("inline budget locks out picks that would overflow", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.goto(`/characters/${shortId}/builder/ortus`)

    // Set Expression to +2 → +2 buttons on every other row should disable.
    await page
      .locator('[data-virtue="expression"]')
      .getByRole("button", { name: "+2" })
      .click()
    await expect
      .poll(
        async () =>
          (await readEntityRow(shortId)).virtues?.ranks.expression ?? null,
        { timeout: 5000 }
      )
      .toBe(2)

    for (const virtue of ["empathy", "wisdom", "focus"] as const) {
      await expect(
        page
          .locator(`[data-virtue="${virtue}"]`)
          .getByRole("button", { name: "+2" })
      ).toBeDisabled()
    }
  })

  test("Ancestry and Background auto-save onto the narrative component", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.goto(`/characters/${shortId}/builder/ortus`)

    const ancestry = page.getByLabel("Ancestry")
    const background = page.getByLabel("Background")
    await ancestry.fill("Half-elf")
    await ancestry.blur()
    await background.fill("Disgraced noble")
    await background.blur()

    await expect
      .poll(
        async () => {
          const narrative = (await readEntityRow(shortId)).narrative
          return narrative
            ? [narrative.ancestry, narrative.background].join(" / ")
            : null
        },
        { timeout: 5000 }
      )
      .toBe("Half-elf / Disgraced noble")
  })
})

/**
 * Movement 3 content tests (net-new for UNN-556): the writer's Knife list
 * rides the narrative component's per-entry ops — add, rename, and describe
 * must compose without clobbering each other.
 */
test.describe("movement 3 — animus", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("adding a Knife selects it; title and description edits land on the same entry", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.goto(`/characters/${shortId}/builder/animus`)

    await page.getByRole("button", { name: "Add Knife" }).click()

    // The new entry becomes the active document — its editable title input
    // (Untitled placeholder) replaces the fixed Backstory title.
    const title = page.getByPlaceholder("Untitled Knife")
    await expect(title).toBeVisible()
    await expect
      .poll(
        async () => (await readEntityRow(shortId)).narrative?.knives.length,
        { timeout: 5000 }
      )
      .toBe(1)

    await title.fill("My sister Mira")
    await title.blur()
    await expect
      .poll(
        async () =>
          (await readEntityRow(shortId)).narrative?.knives[0]?.title ?? null,
        { timeout: 5000 }
      )
      .toBe("My sister Mira")

    // The debounced description save must not clobber the just-saved title
    // (the per-entry `setListEntry` op merges server-side). The body is a
    // CodeMirror contenteditable (no textbox role).
    const body = page.locator(".cm-content")
    await body.click()
    await body.fill("I promised I would come back to her.")
    await page.getByRole("button", { name: "Add Chain" }).click()

    await expect
      .poll(
        async () => (await readEntityRow(shortId)).narrative?.knives[0] ?? null,
        { timeout: 5000 }
      )
      .toEqual({
        title: "My sister Mira",
        description: "I promised I would come back to her.",
      })
    await expect
      .poll(
        async () => (await readEntityRow(shortId)).narrative?.chains.length,
        { timeout: 5000 }
      )
      .toBe(1)
  })
})

/**
 * Movement 4 content tests: auto-focus on the name field, the Finalize gate,
 * and the finalize commit — status flip + starting-weapon seed + NO pool
 * materialization, landing on My Characters.
 */
test.describe("movement 4 — persona", () => {
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(clearDevUserDrafts)
  test.afterAll(clearDevUserDrafts)

  test("auto-focus lands on the name field on page load", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await page.goto(`/characters/${shortId}/builder/persona`)

    const nameInput = page.getByRole("textbox", { name: "Character name" })
    await expect(nameInput).toBeFocused()
  })

  test("Finalize stays disabled until both Origin and name are set", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    // Skip Movement 1 to confirm Finalize honors the cross-movement gate.
    await page.goto(`/characters/${shortId}/builder/persona`)

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
      .poll(async () => (await readEntityRow(shortId)).name, { timeout: 5000 })
      .toBe("Garron Vey")

    // Backtrack to Corpus + Ortus to satisfy the corpus + ortus gates, then
    // return to Persona — the name persisted server-side, so re-rendering
    // /persona shows it pre-filled and all three gates pass.
    await page.goto(`/characters/${shortId}/builder/corpus`)
    await chooseWarriorOrigin(page)
    await expectOriginPersisted(shortId)

    await page.goto(`/characters/${shortId}/builder/ortus`)
    await setValidVirtueAllocation(page, shortId)

    await page.goto(`/characters/${shortId}/builder/persona`)
    await expect(finalizeButton).toBeEnabled()
  })

  test("Finalize flips status, seeds the starting weapon, writes no pool values, and lands on My Characters", async ({
    page,
  }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Create new character" }).click()
    await expect(page).toHaveURL(/\/characters\/[a-z0-9]+\/builder\/corpus$/)
    const shortId = shortIdFromBuilderUrl(page.url())

    await chooseWarriorOrigin(page)
    await expectOriginPersisted(shortId)

    await page.goto(`/characters/${shortId}/builder/ortus`)
    await setValidVirtueAllocation(page, shortId)

    await page.goto(`/characters/${shortId}/builder/persona`)

    let delayedSave = false
    await page.route("**/*", async (route) => {
      const request = route.request()
      if (
        !delayedSave &&
        request.method() === "POST" &&
        request.postData()?.includes("entity.setColumn")
      ) {
        delayedSave = true
        await new Promise((resolve) => setTimeout(resolve, 400))
      }
      await route.continue()
    })

    const nameInput = page.getByRole("textbox", { name: "Character name" })
    await nameInput.fill("Garron Vey")
    // Blur and click immediately while the column mutation is forced in
    // flight: Finalize must settle replica intent before it captures its
    // single-attempt identity precondition.
    await nameInput.blur()
    await page.getByRole("button", { name: "Finalize character" }).click()

    // Finalize lands on My Characters (the v2 sheet route arrives with S2a)
    // and the new card renders from the repointed entity list query.
    await expect(page).toHaveURL(/\/(\?.*)?$/)
    await expect(page.getByText("Garron Vey")).toBeVisible()
    expect(delayedSave).toBe(true)
    expect(
      await page
        .getByText("This draft is out of sync. Refresh and try again.")
        .count()
    ).toBe(0)

    const row = await readEntityRow(shortId)
    expect(row.status).toBe("finalized")
    expect(row.name).toBe("Garron Vey")
    // The Origin Lineage's canonical starting weapon, equipped.
    expect(row.equipment?.items).toHaveLength(1)
    expect(row.equipment?.items[0]).toMatchObject({
      catalogItemKey: "longsword",
      equipped: true,
      quantity: 1,
    })
    // The Origin's mechanic seeded at its initial state.
    expect(row.mechanics?.states.perfection).toMatchObject({
      kind: "perfection",
    })
    // NO pool materialization — depletion-native zeros mean "full by
    // definition"; the maxima resolve from the path formula (CH3).
    expect(row.vitals).toEqual({ base: 0, damage: 0 })
    expect(row.skillPool).toEqual({ base: 0, spSpent: 0 })

    // Cleanup: finalized rows aren't drafts, so the suite's draft sweep
    // won't collect this one. Drop the PC subtype before the substrate row it
    // points at (its FK has no cascade — R3, UNN-573).
    await getDb()
      .delete(playerCharacter)
      .where(eq(playerCharacter.entityId, row.id))
    await getDb().delete(entity).where(eq(entity.shortId, shortId))
  })
})
