import { expect, test, type Page } from "@playwright/test"
import { eq } from "drizzle-orm"

import { characters, getDb } from "@/lib/db"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createWriteTarget } from "./fixtures/write-target"

/**
 * Regression suite for the UNN-180 write-pattern: a typed Server Action with
 * Zod validation, owner authorization, an optional pure engine transition,
 * a conditional UPDATE, and a client-side optimistic UI with rollback. Each
 * test here corresponds to a bug we already hit (or could plausibly hit) in
 * the iteration leading up to landing the pattern, so a regression here
 * means we've genuinely lost something.
 *
 * **Serial execution.** All tests mutate the one ephemeral write-target.
 * Playwright is `fullyParallel`, but mode `serial` inside this file keeps the
 * writes ordered; `beforeEach` resets the row + every inventory item to its
 * baseline, so each test starts from a known state regardless of run order.
 *
 * The target is minted per-run by the factory (`e2e/fixtures/write-target.ts`)
 * and torn down in `afterAll`, so mutations here can't flake the read-only specs
 * (`home`, `owner-controls-slot`, `authenticated`) that pin Iris Vey.
 */

const NAME_INPUT = "Character name"

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createWriteTarget>>

/** The action-POST route matcher, keyed off the ephemeral shortId. */
const writeRoute = () => new RegExp(`/c/${target.shortId}`)

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createWriteTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

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
      await target.reset()
      await page.goto(`${target.url}?tab=inventory`)
      await expect(
        page.getByRole("heading", { name: target.name })
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
    await target.reset()
  })

  test("owner sees an editable name input and equip buttons", async ({
    page,
  }) => {
    await page.goto(`${target.url}?tab=inventory`)
    await expect(page.getByRole("textbox", { name: NAME_INPUT })).toBeVisible()
    await openItemPopover(page, "Overlapping scales")
    await expect(
      page.getByRole("button", { name: "Equip", exact: true })
    ).toBeVisible()
  })

  test("name auto-save persists across a reload", async ({ page }) => {
    await page.goto(target.url)
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
    await page.route(writeRoute(), async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
      await route.continue()
    })

    await page.goto(target.url)
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
    await page.unroute(writeRoute())
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
    await page.goto(`${target.url}?tab=combat`)
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
    await target.setItemEquipped("bladeturn-mail", true)

    await page.goto(`${target.url}?tab=inventory`)
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
    await page.route(writeRoute(), async (route) => {
      if (route.request().method() === "POST") {
        await new Promise((resolve) => setTimeout(resolve, 800))
      }
      await route.continue()
    })

    await page.goto(target.url)
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
    await page.unroute(writeRoute())
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
    await page.goto(target.url)
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
    await page.goto(target.url)
    const input = page.getByRole("textbox", { name: NAME_INPUT })
    await input.fill("Mira the Vanisher")
    // Click the persistent header link to client-side navigate to `/`
    // *before* the 500ms debounce elapses. The cleanup is the only path
    // that can persist the value.
    await page.getByRole("link", { name: "Unnamed System" }).click()
    await expect(page).toHaveURL("/")
    // Wait for the fire-and-forget POST to land before reading back.
    await page.waitForLoadState("networkidle")

    await page.goto(target.url)
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
    await page.goto(`${target.url}?tab=inventory`)
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
    await page.goto(target.url)
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
  test.use({ storageState: STORAGE_STATE })

  test.beforeEach(async () => {
    await target.reset()
  })

  test("silent refetch + retry: first-attempt stale becomes invisible", async ({
    page,
  }) => {
    // The page loads with `identityVersion = N`. We bump the server to `N+1`
    // before the user types, so the first save POSTs `expectedVersion = N`
    // and the wrapper returns `"stale"`. The UNN-203 helper should refetch
    // the fresh version (`N+1`), update the ref, retry the save — and the
    // retry should succeed (`N+1` matches now) without surfacing a toast.
    await page.goto(target.url)
    await page.waitForLoadState("networkidle")

    // Concurrent identity-class write lands between load and edit.
    await target.bumpIdentityVersion()

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
    // Two pages in the *same* `BrowserContext` — i.e. two tabs of the same
    // browser session, which is the real-world scenario (`BroadcastChannel`
    // is scoped to a browsing context group; Playwright's
    // `browser.newContext()` creates fully isolated contexts that don't
    // share channels by design, so a two-context setup would silently
    // fail to deliver the message).
    //
    // A write in pageA posts on the per-character `BroadcastChannel`;
    // pageB's listener (`useCharacterVersionBroadcast` inside
    // `CharacterProvider`) calls `router.refresh()`, which re-runs the
    // RSC, which re-renders the name input with the new server value.
    const context = await browser.newContext({ storageState: STORAGE_STATE })
    try {
      const pageA = await context.newPage()
      const pageB = await context.newPage()
      await pageA.goto(target.url)
      await pageB.goto(target.url)
      await pageA.waitForLoadState("networkidle")
      await pageB.waitForLoadState("networkidle")

      const newName = "Mira the Broadcast"
      const inputA = pageA.getByRole("textbox", { name: NAME_INPUT })
      await inputA.fill(newName)
      await inputA.blur()
      await pageA.waitForTimeout(1500)

      // pageB's input should converge to the new value without a manual
      // reload. The default 5s assertion poll covers the broadcast +
      // router.refresh round-trip.
      await expect(
        pageB.getByRole("textbox", { name: NAME_INPUT })
      ).toHaveValue(newName)
    } finally {
      await context.close()
    }
  })
})

test.describe("UNN-222: Explore-tab Talents and Spark/Virtue edits", () => {
  // Mira Solberg's active Archetype is Warrior, whose granted Talents are
  // Athletics / Climb / Lift — the locked "inherited" set the picker must
  // exclude and the X button must hide. These tests pin that contract.
  const exploreUrl = () => `${target.url}?tab=explore`
  const INHERITED_TALENTS = ["Athletics", "Climb", "Lift"] as const

  test.describe("owner controls are hidden on the public sheet", () => {
    test("signed-out viewer sees inherited Talents locked and no add/remove or Spark controls", async ({
      browser,
    }) => {
      const context = await browser.newContext({ storageState: undefined })
      const page = await context.newPage()
      try {
        await target.reset()
        await page.goto(exploreUrl())

        const talents = page.getByRole("region", { name: "Talents" })
        for (const label of INHERITED_TALENTS) {
          await expect(talents.getByText(label)).toBeVisible()
        }
        await expect(
          page.getByRole("button", { name: "Add Talent" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("button", { name: "Remove Athletics" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("button", { name: "Add a Spark" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("button", { name: "Rank up a Virtue" })
        ).toHaveCount(0)
      } finally {
        await context.close()
      }
    })
  })

  test.describe("owner Talents picker", () => {
    test.use({ storageState: STORAGE_STATE })

    test.beforeEach(async () => {
      await target.reset()
    })

    test("add → reload → remove round-trips through persistence", async ({
      page,
    }) => {
      await page.goto(exploreUrl())

      // The popover is portaled outside the Talents region, so resolve the
      // Add button by aria-label rather than scoping to the region.
      await page.getByRole("button", { name: "Add Talent" }).click()
      await page.getByPlaceholder("Search Talents…").fill("arc")
      await page.getByRole("button", { name: "Arcana" }).click()

      const talents = page.getByRole("region", { name: "Talents" })
      await expect(talents.getByText("Arcana")).toBeVisible()
      // Inherited Talents remain — and stay locked (no Remove button).
      await expect(
        page.getByRole("button", { name: "Remove Athletics" })
      ).toHaveCount(0)

      await page.waitForLoadState("networkidle")
      await page.reload()
      await expect(
        page.getByRole("region", { name: "Talents" }).getByText("Arcana")
      ).toBeVisible()

      await page.getByRole("button", { name: "Remove Arcana" }).click()
      await page.waitForLoadState("networkidle")
      await page.reload()
      await expect(
        page.getByRole("region", { name: "Talents" }).getByText("Arcana")
      ).toHaveCount(0)
      await expectNoToast(page)
    })
  })

  test.describe("owner Spark + Rank-up controls", () => {
    test.use({ storageState: STORAGE_STATE })

    test.beforeEach(async () => {
      await target.reset()
    })

    /**
     * Helper: open the +1 Spark popover and pick `virtue`. The popover
     * auto-closes on pick, so a follow-up call re-opens it cleanly.
     */
    async function addSparkAs(page: Page, virtue: string): Promise<void> {
      await page.getByRole("button", { name: "Add a Spark" }).click()
      await page.getByRole("button", { name: virtue, exact: true }).click()
      // Wait for the optimistic state + server round-trip to settle so the
      // next iteration sees the popover unmounted before re-opening.
      await page.waitForLoadState("networkidle")
    }

    test("tagging a Spark updates the Sparks counter and breakdown", async ({
      page,
    }) => {
      await page.goto(exploreUrl())
      const virtues = page.getByRole("region", { name: "Virtues" })
      await expect(virtues.getByText("Sparks: 0 / 7")).toBeVisible()

      await addSparkAs(page, "Wisdom")

      await expect(virtues.getByText("Sparks: 1 / 7")).toBeVisible()
      await expect(virtues.getByText("(Wisdom ×1)")).toBeVisible()
      await expectNoToast(page)
    })

    test("seven Sparks surfaces the Rank-up CTA and rank-up clears the log", async ({
      page,
    }) => {
      await page.goto(exploreUrl())
      const virtues = page.getByRole("region", { name: "Virtues" })

      // Fill the log to 7 tagged as Wisdom so only Wisdom is eligible.
      for (let i = 0; i < 7; i++) {
        await addSparkAs(page, "Wisdom")
      }
      await expect(virtues.getByText("Sparks: 7 / 7")).toBeVisible()
      await expect(virtues.getByText("(Wisdom ×7)")).toBeVisible()

      // +1 Spark is gone; Rank up a Virtue is present.
      await expect(
        page.getByRole("button", { name: "Add a Spark" })
      ).toHaveCount(0)
      await page.getByRole("button", { name: "Rank up a Virtue" }).click()

      // Only Virtues present in the log are eligible — Wisdom is the only
      // button in the rank-up popover; Expression / Empathy / Focus must not
      // appear.
      await expect(
        page.getByRole("button", { name: "Expression", exact: true })
      ).toHaveCount(0)
      await page.getByRole("button", { name: "Wisdom", exact: true }).click()
      await page.waitForLoadState("networkidle")

      // Log clears, Wisdom row jumps from 0 → 1, +1 Spark returns.
      await expect(virtues.getByText("Sparks: 0 / 7")).toBeVisible()
      await expect(
        page.getByRole("button", { name: "Add a Spark" })
      ).toBeVisible()
      // The Wisdom dt/dd row shows rank 1.
      await expect(
        virtues.locator('div:has(> dt:text-is("Wisdom")) > dd')
      ).toHaveText("1")
      await expectNoToast(page)
    })
  })
})

test.describe("UNN-224: pronouns / ancestry / background / portrait edits", () => {
  const exploreUrl = () => `${target.url}?tab=explore`
  // A 1×1 transparent PNG — enough to exercise the upload → Blob → revalidate
  // round-trip without committing a binary fixture.
  const PNG_1x1 = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  )

  async function portraitUrl(): Promise<string | null> {
    const rows = await getDb()
      .select({ portraitUrl: characters.portraitUrl })
      .from(characters)
      .where(eq(characters.id, target.id))
    return rows[0]?.portraitUrl ?? null
  }

  test.describe("owner affordances are gated", () => {
    test("signed-out viewer sees read-only values and no edit affordances", async ({
      browser,
    }) => {
      const context = await browser.newContext({ storageState: undefined })
      const page = await context.newPage()
      try {
        await target.reset()
        await page.goto(exploreUrl())
        // The seed pronouns render as static text, not an input.
        await expect(
          page
            .getByRole("region", { name: "Background" })
            .getByText("they/them")
        ).toBeVisible()
        await expect(
          page.getByRole("textbox", { name: "Pronouns" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("textbox", { name: "Ancestry" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("textbox", { name: "Background" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("button", { name: "Edit portrait" })
        ).toHaveCount(0)
      } finally {
        await context.close()
      }
    })

    test.describe("signed-in non-owner sees the same read-only view", () => {
      test.use({ storageState: STORAGE_STATE })

      test("no field editors, no portrait menu", async ({ page }) => {
        await page.goto("/c/seed-warrior?tab=explore")
        await expect(
          page.getByRole("textbox", { name: "Pronouns" })
        ).toHaveCount(0)
        await expect(
          page.getByRole("button", { name: "Edit portrait" })
        ).toHaveCount(0)
      })
    })
  })

  test.describe("owner inline edits", () => {
    test.use({ storageState: STORAGE_STATE })

    test.beforeEach(async () => {
      await target.reset()
    })

    async function columnValue(
      column: "pronouns" | "ancestryText" | "backgroundText"
    ): Promise<string | null> {
      const rows = await getDb()
        .select()
        .from(characters)
        .where(eq(characters.id, target.id))
      return rows[0]?.[column] ?? null
    }

    /**
     * Edit one field and move straight on — no per-field persistence poll.
     * The three Background fields share `identityVersion`, and since UNN-274
     * they share one in-memory version ref *and* one per-class save queue: the
     * three blurs serialize through that queue, so each save reads the version
     * the previous one's success just bumped instead of all dispatching at the
     * stale pre-bump token and colliding on the silent stale-retry. That lets
     * us hammer them back-to-back (faster than the `revalidate → prop-sync`
     * round-trip) deterministically, without pacing the edits against the
     * persisted row.
     */
    async function editField(page: Page, label: string, value: string) {
      const input = page.getByRole("textbox", { name: label })
      await input.fill(value)
      await input.blur()
    }

    test("pronouns / ancestry / background auto-save and persist across reload", async ({
      page,
    }) => {
      await page.goto(exploreUrl())
      // Edit all three back-to-back, faster than the revalidate round-trip,
      // to exercise the shared-ref coordination (UNN-274).
      await editField(page, "Pronouns", "ze/zir")
      await editField(page, "Ancestry", "Aether-touched")
      await editField(page, "Background", "Wandering archivist")

      // The last edit's save still needs to land before the reload re-reads
      // the row; the three share one ref so they serialize cleanly.
      await expect
        .poll(() => columnValue("backgroundText"))
        .toBe("Wandering archivist")

      await page.reload()
      await expect(page.getByRole("textbox", { name: "Pronouns" })).toHaveValue(
        "ze/zir"
      )
      await expect(page.getByRole("textbox", { name: "Ancestry" })).toHaveValue(
        "Aether-touched"
      )
      await expect(
        page.getByRole("textbox", { name: "Background" })
      ).toHaveValue("Wandering archivist")
      await expectNoToast(page)
    })

    test("clearing a field persists empty (and the public sheet falls back)", async ({
      page,
    }) => {
      await page.goto(exploreUrl())
      const pronouns = page.getByRole("textbox", { name: "Pronouns" })
      await expect(pronouns).toHaveValue("they/them")
      await pronouns.fill("")
      await pronouns.blur()
      await expect.poll(() => columnValue("pronouns")).toBeNull()

      await page.reload()
      await expect(page.getByRole("textbox", { name: "Pronouns" })).toHaveValue(
        ""
      )
      await expectNoToast(page)
    })

    test("owner can upload a portrait and remove it", async ({ page }) => {
      await page.goto(exploreUrl())
      await expect(
        page.getByRole("button", { name: "Edit portrait" })
      ).toBeVisible()
      expect(await portraitUrl()).toBeNull()

      // The menu item just forwards a click to this hidden input; setting it
      // directly drives the same onChange → upload → revalidate path.
      await page.locator('input[type="file"]').setInputFiles({
        name: "portrait.png",
        mimeType: "image/png",
        buffer: PNG_1x1,
      })
      await page.waitForLoadState("networkidle")
      await expect.poll(portraitUrl).not.toBeNull()

      await page.getByRole("button", { name: "Edit portrait" }).click()
      await page.getByRole("menuitem", { name: "Remove portrait" }).click()
      await page.waitForLoadState("networkidle")
      await expect.poll(portraitUrl).toBeNull()
      await expectNoToast(page)
    })
  })
})
