import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

import type { SpatialEncounterSnapshot } from "@workspace/game-v2/visibility"

import { STORAGE_STATE } from "./auth.setup"
import {
  ENCOUNTER_CAMPAIGN_MANAGE_URL,
  encounterTarget,
  getCharacterCurrentHP,
  getDurableParticipantSide,
  getInlineEnemyVitals,
  resetEncounterFixtures,
  setCharacterCurrentHP,
} from "./fixtures/encounter-target"

/**
 * E2E for the encounter setup shell + live console, on engine v2 (UNN-535 hard
 * cutover; originally UNN-335/298/300/302/344): the create action, the
 * `/campaigns/{c}/encounter/{e}` status fork, importing placed PCs, per-combatant side
 * assignment, the single-live-encounter guard, the live console's turn-flow
 * spine, **and the UNN-535 ACs** — the full setup→catalog→combat loop with the
 * CD19 write-router (back-to-back inline damage sums, the UNN-226 regression;
 * durable PC damage landing on the character row), plus the signed-out watch
 * and the route-level structural redaction of enemy attributes/affinities.
 *
 * Signed in as the dev user (DM of both seeded campaigns) except the trailing
 * signed-out describe. **Serial** because the tests share campaign-level
 * live-encounter state (the single-live guard); each `beforeEach` resets the
 * seeded encounters and clears any encounter the create-flow test minted.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

test.beforeEach(async () => {
  await resetEncounterFixtures()
})

const PLACED_PC_NAME = encounterTarget.placedPc.seed.name
const LIVE_COMBAT_PC_NAME = encounterTarget.liveCombatPc.seed.name

/**
 * The combatant drawer, scoped to the sheet element. The drawer's "Adjust HP/SP"
 * control is itself a `role="dialog"` popover, so an unscoped `getByRole("dialog")`
 * matches two elements while that popover is mid-exit-animation (a strict-mode
 * race). Filtering to `data-slot="sheet-content"` pins the locator to the sheet.
 */
function combatantDrawer(page: Page) {
  return page
    .getByRole("dialog")
    .and(page.locator('[data-slot="sheet-content"]'))
}

test("create → import a placed PC → Start → live console", async ({ page }) => {
  // A multi-write journey (create → roster add → status flip): triple the
  // budget so a busy dev machine can't truncate the re-fork window.
  test.slow()
  // Campaign A has no live encounter, so a new draft created here can be started.
  await page.goto(ENCOUNTER_CAMPAIGN_MANAGE_URL)
  await page.getByRole("button", { name: "New encounter" }).click()
  await page.getByLabel("Name").fill("Bridge ambush")
  await page.getByRole("button", { name: "Create encounter" }).click()

  await expect(page).toHaveURL(/\/encounter\/[^/]+$/)
  const start = page.getByRole("button", { name: "Start combat" })
  await expect(start).toBeDisabled()

  // The import panel lists the campaign's placed PC; adding it fills the roster
  // (a v2 PC add lands with the revalidation — no optimistic mirror — so the
  // enabled Start button is the "roster persisted" signal).
  await expect(page.getByText(PLACED_PC_NAME)).toBeVisible()
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(start).toBeEnabled()

  // "Start combat" opens the advantage dialog; confirming (default Neutral)
  // starts, and the page re-forks from the setup shell to the live console.
  // The status flip is a cross-write over both rows + a full RSC re-fork, so
  // it gets a longer window than the default 5s under parallel load.
  await start.click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start combat" })
    .click()
  await expect(page.getByText("Neutral start")).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByRole("button", { name: "End encounter" })
  ).toBeVisible()
})

test("full loop: catalog add → start → drafting → damage → end (UNN-535)", async ({
  page,
}) => {
  // The suite's longest write chain (catalog commit → start → draft → four
  // vitals writes → end): triple the budget, same rationale as above.
  test.slow()
  const draft = encounterTarget.draft
  const pcId = encounterTarget.placedPc.characterId
  const pcHpBefore = await getCharacterCurrentHP(pcId)

  // The seeded Campaign-A draft already carries the imported placed PC.
  await page.goto(draft.url)
  await expect(
    page.getByRole("button", { name: "Added", exact: true })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Combatants (1)" })
  ).toBeVisible()

  // Browse the catalog, queue one Goblin, and commit it onto the roster. The
  // click is the test's first interaction: under load it can land before the
  // setup shell hydrates and be silently lost, so retry click → navigated.
  await expect(async () => {
    await page.getByRole("button", { name: "Browse catalog" }).click()
    await expect(page).toHaveURL(/\/encounter\/[^/]+\/setup$/, {
      timeout: 2000,
    })
  }).toPass()
  await page
    .getByRole("textbox", { name: "Search the bestiary" })
    .fill("Goblin")
  await page
    .getByRole("button", { name: "Queue Goblin", exact: true })
    .first()
    .click()
  await page.getByRole("button", { name: "Add to encounter" }).click()

  // Back on setup the roster shows both combatants (the commit is a server
  // action + a route push — same extended window as the other transitions).
  await expect(page).toHaveURL(new RegExp(`/encounter/${draft.shortId}$`), {
    timeout: 15_000,
  })
  await expect(
    page.getByRole("heading", { name: "Combatants (2)" })
  ).toBeVisible()
  await expect(page.getByText("Goblin", { exact: true }).first()).toBeVisible()

  // Start combat: Neutral (the default), players first — explicit, so the
  // opening draft heading is deterministic regardless of Agility comparison.
  await page.getByRole("button", { name: "Start combat" }).click()
  const startDialog = page.getByRole("dialog")
  await startDialog
    .getByRole("button", { name: "Players", exact: true })
    .click()
  await startDialog.getByRole("button", { name: "Start combat" }).click()

  // The status flip is the suite's heaviest write (cross-write + RSC re-fork)
  // — give it a longer window than the default 5s under parallel load.
  await expect(page.getByText("Neutral start")).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()

  // Draft the PC via the turn-order strip's tap.
  await page.getByRole("button", { name: `Draft ${PLACED_PC_NAME}` }).click()
  await expect(
    page.getByRole("heading", { name: `Now acting: ${PLACED_PC_NAME}` })
  ).toBeVisible()

  // The UNN-226 regression case: two back-to-back 3-damage writes on the
  // inline goblin must SUM — the second predicts off the current optimistic
  // frame, never a stale closure. Only the DB knows the persisted truth.
  await page.getByRole("button", { name: "Open Goblin detail" }).click()
  const drawer = combatantDrawer(page)
  for (let hit = 0; hit < 2; hit++) {
    await drawer.getByRole("button", { name: "Adjust HP", exact: true }).click()
    await page.getByLabel("Amount").fill("3")
    await page.getByRole("button", { name: "Take damage" }).click()
  }
  await expect(drawer.getByText("10 / 16")).toBeVisible()
  await expect
    .poll(async () => (await getInlineEnemyVitals(draft.id, "Goblin"))?.damage)
    .toBe(6)

  // Durable PC damage lands on the PC's `entity` row via the write-router's
  // durable arm (UNN-551) — polled off the resolved entity HP, not the session
  // blob.
  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()
  await page
    .getByRole("button", { name: `Open ${PLACED_PC_NAME} detail` })
    .click()
  await drawer.getByRole("button", { name: "Adjust HP", exact: true }).click()
  await page.getByLabel("Amount").fill("5")
  await page.getByRole("button", { name: "Take damage" }).click()
  await expect
    .poll(async () => await getCharacterCurrentHP(pcId))
    .toBe(pcHpBefore - 5)

  // The durable write's optimistic transition defers the adjust-pool popover's
  // close (it settles when the round-trip completes, ~0.5s); wait for it before
  // Escaping the drawer, else Escape closes the still-open popover, not the
  // drawer. (Cosmetic combat-only delay, revisited with the S2 optimistic model.)
  await expect(page.getByRole("button", { name: "Take damage" })).toBeHidden()

  // End the encounter → the read-only ended stub.
  await page.keyboard.press("Escape")
  await expect(drawer).toBeHidden()
  await page.getByRole("button", { name: "End encounter" }).click()
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "End encounter" })
    .click()
  await expect(page.getByTestId("combat-ended-stub")).toBeVisible({
    timeout: 15_000,
  })

  // The campaign manage page's live banner is gone (snapshot, not poll — the
  // desirable state is "absent").
  await page.goto(ENCOUNTER_CAMPAIGN_MANAGE_URL)
  await expect(
    page.getByRole("heading", { name: encounterTarget.campaignA.name })
  ).toBeVisible()
  expect(await page.getByText("Combat is live").count()).toBe(0)

  // Character rows aren't reset by the fixture reset — restore the seeded PC.
  await setCharacterCurrentHP(pcId, pcHpBefore)
})

test("import panel toggles a placed PC in and out of the roster", async ({
  page,
}) => {
  // The seeded Campaign-A draft already carries the placed PC.
  await page.goto(encounterTarget.draft.url)
  await expect(
    page.getByRole("heading", { name: "Combatants (1)" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Added", exact: true })
  ).toBeVisible()

  // Toggling the added PC removes it; re-toggling adds it back (never twice).
  await page.getByRole("button", { name: "Added", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Combatants (0)" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Add", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Combatants (1)" })
  ).toBeVisible()
})

test("assigns a side and persists it per-edit across reload (UNN-347)", async ({
  page,
}) => {
  await page.goto(encounterTarget.draft.url)
  // The seeded PC defaults to the Players side.
  const enemiesToggle = page.getByRole("button", { name: "Enemies" })
  await expect(enemiesToggle).toHaveAttribute("aria-pressed", "false")

  // There is no Save button — the side flip persists optimistically as an
  // event. Poll the DB for the persisted overlay before reloading (UNN-226
  // discipline: networkidle can't see the revalidation commit).
  await enemiesToggle.click()
  await expect(enemiesToggle).toHaveAttribute("aria-pressed", "true")
  await expect
    .poll(async () =>
      getDurableParticipantSide(
        encounterTarget.draft.id,
        encounterTarget.placedPc.characterId
      )
    )
    .toBe("enemies")

  await page.reload()
  await expect(page.getByRole("button", { name: "Enemies" })).toHaveAttribute(
    "aria-pressed",
    "true"
  )
})

test("single-live guard blocks starting a second encounter", async ({
  page,
}) => {
  // Campaign B already has a live encounter; its draft must not start.
  await page.goto(encounterTarget.blocked.url)
  const start = page.getByRole("button", { name: "Start combat" })
  await expect(start).toBeEnabled()

  await start.click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Start combat" })
    .click()
  await expect(page.getByText("already has a live encounter")).toBeVisible({
    timeout: 15_000,
  })
  // Still the setup shell — the rejected start never reached the console.
  await expect(page.getByText("Encounter setup")).toBeVisible()
})

test("start dialog: a Players ambush opens the live console with a Player-start badge (UNN-303)", async ({
  page,
}) => {
  // Campaign A's seeded draft has no live encounter, so it can be started; the
  // chosen advantage surfaces as the live header badge + the opening draft side.
  await page.goto(encounterTarget.draft.url)
  await page.getByRole("button", { name: "Start combat" }).click()

  const dialog = page.getByRole("dialog")
  await dialog.getByText("Players ambush").click()
  await dialog.getByRole("button", { name: "Start combat" }).click()

  await expect(page.getByText("Player start")).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()
})

test(
  "live encounter renders the console",
  { tag: "@smoke" },
  async ({ page }) => {
    // The seeded live encounter is a started neutral session, players leading.
    await page.goto(encounterTarget.live.url)
    await expect(
      page.getByRole("heading", { name: "Players' draft" })
    ).toBeVisible()
    await expect(page.getByText("Neutral start")).toBeVisible()
  }
)

test("live console: draft → end turn → modal → hand off to the other side", async ({
  page,
}) => {
  // The seeded live encounter opens un-drafted (neutral start, players lead),
  // with Roan Vale (PC) vs a goblin + a cave bat.
  await page.goto(encounterTarget.live.url)
  await expect(page.getByText("Neutral start")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()

  // Draft the lone player → their turn begins.
  await page.getByRole("button", { name: "Draft Roan Vale" }).click()
  await expect(
    page.getByRole("heading", { name: "Now acting: Roan Vale" })
  ).toBeVisible()

  // End turn always opens the end-of-turn modal (even with nothing to resolve).
  await page.getByRole("button", { name: "End turn" }).click()
  await expect(
    page.getByRole("dialog", { name: "End of Roan Vale's turn" })
  ).toBeVisible()

  // "Done" hands off to the enemies' draft; both enemies are now tappable.
  await page.getByRole("button", { name: "Done — open the draft" }).click()
  await expect(
    page.getByRole("heading", { name: "Enemies' draft" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Draft Goblin" })).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Draft Cave Bat" })
  ).toBeVisible()
})

test("live console: a full round of turns offers the next round", async ({
  page,
}) => {
  await page.goto(encounterTarget.live.url)

  // Drive all three combatants through draft → end turn → done.
  for (const name of ["Roan Vale", "Goblin", "Cave Bat"]) {
    await page.getByRole("button", { name: `Draft ${name}` }).click()
    await page.getByRole("button", { name: "End turn" }).click()
    await page.getByRole("button", { name: "Done — open the draft" }).click()
  }

  // Everyone has acted → the strip offers the next round.
  const startRound = page.getByRole("button", {
    name: "Round complete — start round 2",
  })
  await expect(startRound).toBeVisible()

  await startRound.click()
  await expect(page.getByText("Round 2")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Draft Roan Vale" })
  ).toBeVisible()
})

test("rail row opens the PC detail drawer (UNN-345)", async ({ page }) => {
  await page.goto(encounterTarget.live.url)
  await expect(page.getByText("Players · 1")).toBeVisible()
  await expect(page.getByText("Enemies · 2")).toBeVisible()

  await page.getByRole("button", { name: "Open Roan Vale detail" }).click()
  const drawer = combatantDrawer(page)
  await expect(drawer.getByText("Attributes")).toBeVisible()
  await expect(drawer.getByText("Affinities")).toBeVisible()
  // PC vitals are writable again on v2 (UNN-535 supersedes UNN-482's read-only
  // PC drawer): the CD19 router writes the character row, and the footer says
  // exactly where the edit lands.
  await expect(
    drawer.getByText(/HP\/SP changes here write Roan Vale's character sheet/)
  ).toBeVisible()
  await expect(
    drawer.getByRole("button", { name: "Adjust HP", exact: true })
  ).toBeVisible()
})

test("rail row opens an enemy detail drawer (UNN-345)", async ({ page }) => {
  await page.goto(encounterTarget.live.url)

  // Cave Bat is an inline entity with no affinities component: the drawer
  // renders by capability, so the Affinities section is structurally absent
  // (snapshot, not poll — the desirable state is "absent").
  await page.getByRole("button", { name: "Open Cave Bat detail" }).click()
  const drawer = combatantDrawer(page)
  await expect(
    drawer.getByText(/Edits affect this enemy in this encounter only/)
  ).toBeVisible()
  expect(await drawer.getByText("Affinities").count()).toBe(0)
})

test("enemy HP adjust drives the bar down to a Dead badge (UNN-309)", async ({
  page,
}) => {
  // Enemy vitals live on the session blob, which `resetEncounterFixtures`
  // restores per test — so this is self-cleaning and won't perturb the
  // (serial) turn-flow tests. PC HP is the character row and is NOT reset, so
  // the full-loop test restores it explicitly.
  await page.goto(encounterTarget.live.url)
  const caveBat = page.getByRole("button", { name: "Open Cave Bat detail" })
  await expect(caveBat).toContainText("8/8")

  await caveBat.click()
  const drawer = combatantDrawer(page)
  await drawer.getByRole("button", { name: "Adjust HP", exact: true }).click()
  await page.getByLabel("Amount").fill("9")
  await page.getByRole("button", { name: "Take damage" }).click()

  // 8 − 9 floors at 0 → Dead. Asserted inside the drawer: it is a modal sheet,
  // so the rail behind it is inert while open.
  await expect(drawer.getByText("Dead")).toBeVisible()
  await expect(drawer.getByText("0 / 8")).toBeVisible()
})

test("catalog enemy HP is adjustable on its inline entity (UNN-309/535)", async ({
  page,
}) => {
  // The goblin is a catalog enemy materialized as an inline v2 entity at seed
  // time: its working HP lives on the session blob's entity vitals, so the
  // drawer's controls are live and read the depleted pool back.
  await page.goto(encounterTarget.live.url)
  await page.getByRole("button", { name: "Open Goblin detail" }).click()
  const drawer = combatantDrawer(page)

  const adjustHp = drawer.getByRole("button", {
    name: "Adjust HP",
    exact: true,
  })
  await expect(adjustHp).toBeEnabled()
  await adjustHp.click()
  await page.getByLabel("Amount").fill("1")
  await page.getByRole("button", { name: "Take damage" }).click()

  // 16 → 15 reads off the inline entity's depleted vitals.
  await expect(drawer.getByText("15 / 16")).toBeVisible()
})

test("drawer edits session-overlay ailments + action economy (UNN-310)", async ({
  page,
}) => {
  // Ailments / action economy live on the session blob, which
  // `resetEncounterFixtures` restores per test — self-cleaning, so this won't
  // perturb the (serial) turn-flow tests.
  await page.goto(encounterTarget.live.url)
  await page.getByRole("button", { name: "Open Goblin detail" }).click()
  const drawer = combatantDrawer(page)

  // Action economy: Reaction toggles from available to used.
  await drawer.getByRole("button", { name: "Reaction available" }).click()
  await expect(
    drawer.getByRole("button", { name: "Reaction used" })
  ).toBeVisible()

  // Ailments are a permissive multi-select: setting Burn marks its toggle
  // pressed (the picker portals out of the modal sheet, so scope to the page;
  // match the row by its description so it never collides with the trigger
  // summary, which also reads "Burn" once set).
  await drawer.getByRole("button", { name: "No ailment" }).click()
  const burnToggle = page.getByRole("button", { name: /Burn.*max HP/ })
  await burnToggle.click()
  await expect(burnToggle).toHaveAttribute("aria-pressed", "true")
})

test("End encounter flips the live console to the ended stub (UNN-320)", async ({
  page,
}) => {
  // Status lives on the encounter row, which `resetEncounterFixtures` restores
  // per test — so ending the shared live encounter here is self-cleaning.
  await page.goto(encounterTarget.live.url)
  await expect(
    page.getByRole("heading", { name: "Players' draft" })
  ).toBeVisible()

  await page.getByRole("button", { name: "End encounter" }).click()
  const confirm = page.getByRole("alertdialog")
  await expect(
    confirm.getByRole("heading", { name: "End this encounter?" })
  ).toBeVisible()
  await confirm.getByRole("button", { name: "End encounter" }).click()

  await expect(page.getByTestId("combat-ended-stub")).toBeVisible({
    timeout: 15_000,
  })
})

test("ended encounter renders the read-only ended stub", async ({ page }) => {
  await page.goto(encounterTarget.ended.url)
  await expect(page.getByTestId("combat-ended-stub")).toBeVisible()
})

test("404s for an unknown encounter", async ({ page }) => {
  const response = await page.goto(
    `/campaigns/${encounterTarget.campaignA.shortId}/encounter/does-not-exist`
  )
  expect(response?.status()).toBe(404)
})

test("404s for an encounter in another DM's campaign", async ({ page }) => {
  const response = await page.goto(encounterTarget.foreign.url)
  expect(response?.status()).toBe(404)
})

/**
 * The watch's own-sheet column (UNN-566): the dev user owns Roan Vale, who
 * stands in Campaign B's live encounter, so the watch mounts their sheet in
 * owner mode. The write goes through the entity door — the same descriptor the
 * `/characters/{shortId}` rail dispatches — so the assertion is the durable row,
 * not just the bar.
 */
test("the watch's own-sheet column adjusts the owner's HP durably (UNN-566)", async ({
  page,
}) => {
  const pcId = encounterTarget.liveCombatPc.characterId
  const hpBefore = await getCharacterCurrentHP(pcId)

  await page.goto(`${encounterTarget.live.url}/watch`)
  const column = page.getByRole("complementary", { name: "Your characters" })
  await expect(
    column.getByRole("heading", { name: LIVE_COMBAT_PC_NAME })
  ).toBeVisible()
  await expect(column.getByText(`${hpBefore} / `)).toBeVisible()

  await column.getByRole("button", { name: "Adjust HP" }).click()
  await page.getByLabel("Amount").fill("4")
  await page.getByRole("button", { name: "Damage", exact: true }).click()

  await expect
    .poll(async () => await getCharacterCurrentHP(pcId))
    .toBe(hpBefore - 4)
  await expect(column.getByText(`${hpBefore - 4} / `)).toBeVisible()

  await setCharacterCurrentHP(pcId, hpBefore)
})

test.describe("signed out", () => {
  // A fresh context with no auth cookie — the watch and the snapshot API are
  // public, and the spectator relationship is the strictest redaction tier.
  test.use({ storageState: { cookies: [], origins: [] } })

  const WATCH_URL = `${encounterTarget.live.url}/watch`

  test("the watch renders the live battlefield to a spectator (UNN-535)", async ({
    page,
  }) => {
    await page.goto(WATCH_URL)
    // No zones on the seeded encounter → the theater-of-mind battlefield; the
    // redacted enemies rail lists both enemy cards.
    await expect(page.getByTestId("combat-console-battlefield")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Enemies" })).toBeVisible()
    await expect(page.getByText("Goblin").first()).toBeVisible()
    await expect(page.getByText("Cave Bat").first()).toBeVisible()

    // Redaction proxy: no stat section renders anywhere on the spectator page
    // (one snapshot read — the API test below is the structural check).
    expect(await page.getByText("Attributes").count()).toBe(0)
    expect(await page.getByText("Affinities").count()).toBe(0)

    // A spectator owns no combatant here, so the own-sheet column never mounts
    // and the battlefield takes the full width (UNN-566).
    expect(
      await page.getByRole("complementary", { name: "Your characters" }).count()
    ).toBe(0)
  })

  test("the snapshot API structurally drops enemy attributes/affinities (UNN-535)", async ({
    request,
  }) => {
    const snapshot = await fetchSnapshot(request, encounterTarget.live.shortId)

    const enemies = snapshot.combatants.filter(
      (combatant) => combatant.components.allegiance?.side === "enemies"
    )
    expect(enemies.length).toBeGreaterThan(0)
    for (const enemy of enemies) {
      expect("attributes" in enemy.components).toBe(false)
      expect("affinities" in enemy.components).toBe(false)
    }
  })
})

/** GETs the public snapshot route unauthenticated and returns the redacted
 *  snapshot body (asserting the 200 envelope on the way). */
async function fetchSnapshot(
  request: APIRequestContext,
  shortId: string
): Promise<SpatialEncounterSnapshot> {
  const response = await request.get(`/api/encounter/${shortId}/snapshot`)
  expect(response.status()).toBe(200)
  const body = (await response.json()) as {
    canon: { value: SpatialEncounterSnapshot }
  }
  return body.canon.value
}
