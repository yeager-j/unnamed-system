import { expect, test, type Page } from "@playwright/test"
import { eq, sql } from "drizzle-orm"

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

/**
 * Bumps `identityVersion` on the seed character by 1 directly via the DB —
 * simulates "a sibling tab / another writer landed an identity-class write
 * between the page load and the user's edit." The next save from the page
 * will see its `expectedVersion` mismatch and `"stale"` will surface from
 * the wrapper, exercising the UNN-203 silent-retry path.
 */
async function bumpIdentityVersionForCharacter(): Promise<void> {
  const db = getDb()
  await db
    .update(characters)
    .set({ identityVersion: sql`${characters.identityVersion} + 1` })
    .where(eq(characters.id, CHARACTER_ID))
}

async function openItemPopover(page: Page, descriptionFragment: string) {
  await page
    .getByRole("button", { name: new RegExp(descriptionFragment) })
    .click()
}

/**
 * Snapshot-check that no Sonner toast is currently rendered. The default
 * `await expect(...).toHaveCount(0)` polls for 5s; Sonner's default toast
 * duration is 4s, so a stale toast that briefly flashed up would dismiss
 * inside the poll window and the assertion would still pass. This helper
 * does a single read instead, so any toast that fired during the
 * surrounding wait is caught.
 */
async function expectNoToast(page: Page): Promise<void> {
  const count = await page.locator("[data-sonner-toast]").count()
  expect(count).toBe(0)
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
    await expectNoToast(page)
  })

  test("debounce + blur double-fire does not produce a stale toast", async ({
    page,
  }) => {
    // The original UNN-180 regression: the debounced save fired at ~500ms,
    // then `flushSave` on blur fired a *second* save for the same value with
    // the same `expectedVersion` before the first had returned — the
    // second's WHERE missed and the user saw a "Someone else updated this
    // character" toast on a perfectly normal edit. The in-flight guard in
    // `editable-character-name.tsx` closes the window; this test holds it
    // closed.
    //
    // The race window is sensitive to network speed — on a fast localhost
    // the action can complete in <50ms and accidentally close the window
    // before blur fires. Route-delay the action POST so the in-flight window
    // is reliably wide enough for blur to land inside it.
    await page.route(/\/c\/write-target/, async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
      await route.continue()
    })

    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Race-Free")
    // Wait past the 500ms debounce so the action is firing; blur lands while
    // it's still mid-flight thanks to the route delay above.
    await page.waitForTimeout(600)
    await input.blur()
    // Wait long enough for both saves to resolve and for a toast to surface
    // (~1.5s round-trip), but well inside Sonner's default 4s auto-dismiss
    // — `expectNoToast` snapshots, so a toast that flashes here is caught.
    await page.waitForTimeout(2000)
    await expectNoToast(page)
    await page.unroute(/\/c\/write-target/)
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
    await expectNoToast(page)
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
    await expectNoToast(page)
  })

  test("different-value race: B dispatched mid-A picks up A's fresh version", async ({
    page,
  }) => {
    // UNN-202 issue 1: before the serialization fix, typing "A", waiting past
    // the 500ms debounce so save("A", v0) was in flight, then typing "B" before
    // A returned would dispatch save("B", v0) with the same stale token. When
    // A's commit advanced the server to v1, B's WHERE missed and the user got
    // a "Someone else updated this character" toast on a normal edit. The
    // serialized save queue closes that window by chaining B behind A so it
    // reads the post-A `versionRef.current` (v1) before its request goes out.
    await page.route(/\/c\/write-target/, async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
      await route.continue()
    })

    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Race A")
    // Wait past the 500ms debounce so save("Race A") is in flight (held open
    // by the route delay above).
    await page.waitForTimeout(600)
    await input.fill("Race B")
    await page.waitForTimeout(600)
    await input.blur()
    // Both saves resolve serially: A first (~800ms), then B (~800ms more).
    // Wait well past both round trips but inside Sonner's 4s auto-dismiss.
    await page.waitForTimeout(2500)
    await expectNoToast(page)
    await page.unroute(/\/c\/write-target/)
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Race B"
    )
  })

  test("emptying the name input reverts to the last-saved value on blur", async ({
    page,
  }) => {
    // UNN-202 issue 2: previously, clearing the input would leave the draft
    // visually empty while the server still held the old name, with no signal
    // that nothing had saved. The hook now snaps the draft back to
    // `lastSavedRef.current` on blur when `isEmpty(value)` is true.
    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Steady")
    await input.blur()
    await page.waitForLoadState("networkidle")

    await input.fill("")
    await input.blur()
    await expect(input).toHaveValue("Mira the Steady")
    await expectNoToast(page)
  })

  test("client-side nav before debounce fires still persists the typed value", async ({
    page,
  }) => {
    // UNN-202 issue 3: typing inside the 500ms debounce window and then
    // navigating away (client-side, so `blur` may not fire) used to drop the
    // typed text on the floor. The unmount cleanup now flushes the pending
    // draft fire-and-forget through the same serialized queue.
    await page.goto(CHARACTER_URL)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Vanisher")
    // Click the persistent header link to client-side navigate to `/`
    // *before* the 500ms debounce elapses. The cleanup is the only path
    // that can persist the value.
    await page.getByRole("link", { name: "Unnamed System" }).click()
    await expect(page).toHaveURL("/")
    // Wait for the fire-and-forget POST to land before reading back.
    await page.waitForLoadState("networkidle")

    await page.goto(CHARACTER_URL)
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Vanisher"
    )
    await expectNoToast(page)
  })

  test("equip then immediately edit name does not stale", async ({ page }) => {
    // After UNN-140 these writes touch *different* per-write-class version
    // columns (`inventoryVersion` vs `identityVersion`), so they're
    // structurally decoupled — no cross-component synchronization needed.
    // Before per-class scoping both writes bumped the shared
    // `characters.updatedAt` and the cross-component dual-writer ref was
    // what made this case work; this test now proves the stronger
    // decoupling holds.
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

    await expectNoToast(page)
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

    await expectNoToast(page)
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Reverse"
    )
    await expect(page.getByText("Bladeturn Mail").first()).toBeVisible()
  })
})

test.describe("UNN-203: stale is self-healing", () => {
  test("silent refetch + retry: first-attempt stale becomes invisible", async ({
    page,
  }) => {
    // The page loads with `identityVersion = N`. We bump the server to `N+1`
    // before the user types, so the first save POSTs `expectedVersion = N`
    // and the wrapper returns `"stale"`. The UNN-203 helper should refetch
    // the fresh version (`N+1`), update the ref, retry the save — and the
    // retry should succeed (`N+1` matches now) without surfacing a toast.
    await page.goto(CHARACTER_URL)
    await page.waitForLoadState("networkidle")

    // Concurrent identity-class write lands between load and edit.
    await bumpIdentityVersionForCharacter()

    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Healed")
    await input.blur()
    // Cover debounce + initial stale + refetch + retry. The retry burns
    // ~3 round-trips, so give it more time than the single-write case.
    await page.waitForTimeout(2500)

    await expectNoToast(page)
    await page.reload()
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toHaveValue(
      "Mira the Healed"
    )
  })

  test("cross-tab broadcast: edit in tab A updates tab B without reload", async ({
    browser,
  }) => {
    // Two browser contexts, both signed in to the same owner, both on the
    // same character. A write in tab A posts on the per-character
    // BroadcastChannel; tab B's listener (`useCharacterVersionBroadcast`
    // inside `CharacterProvider`) calls `router.refresh()`, which re-runs
    // the RSC, which re-renders the name input with the new server value.
    const contextA = await browser.newContext({ storageState: STORAGE_STATE })
    const contextB = await browser.newContext({ storageState: STORAGE_STATE })
    try {
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()
      await pageA.goto(CHARACTER_URL)
      await pageB.goto(CHARACTER_URL)
      await pageA.waitForLoadState("networkidle")
      await pageB.waitForLoadState("networkidle")

      const newName = "Mira the Broadcast"
      const inputA = pageA.getByRole("textbox", { name: NAME_INPUT })
      await inputA.fill(newName)
      await inputA.blur()
      await pageA.waitForTimeout(1500)

      // Tab B's input should converge to the new value without a manual
      // reload. The default 5s assertion poll covers the broadcast +
      // router.refresh round-trip.
      await expect(
        pageB.getByRole("textbox", { name: NAME_INPUT })
      ).toHaveValue(newName)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
