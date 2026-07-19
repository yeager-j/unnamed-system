import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import { createMoveCombatantTarget } from "./fixtures/move-combatant-target"

/**
 * E2E for `moveCombatant` (UNN-472, the M0 safety net). There is no token-move
 * E2E today, and it is the M0 cutover's riskiest path — relocating spatial state
 * off the `CombatSession` onto the Map Instance. This drives the shipped move
 * control end-to-end and asserts the new `zoneId` **through the DB**, so it stays
 * green across that lift.
 *
 * Signed in as the dev user (DM of the ephemeral campaign). **Serial** + a
 * `beforeEach` reset because the one test mutates the shared live encounter's
 * session; `afterAll` tears the whole world down.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createMoveCombatantTarget>>

test.beforeAll(async () => {
  target = await createMoveCombatantTarget(tracker)
})

test.beforeEach(async () => {
  await target.reset()
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("moves a placed combatant to an adjacent zone, persisted to the session", async ({
  page,
}) => {
  await page.goto(target.encounter.url)
  // The v2 console has no battlefield canvas (UNN-535) — the rail row is the
  // stable "console is ready" signal, and the drawer entry point besides.
  const railRow = page.getByRole("button", {
    name: `Open ${target.pc.name} detail`,
  })
  await expect(railRow).toBeVisible()

  // Sanity: the baseline places the PC in the start zone.
  expect(await target.getCombatantZone()).toBe(target.startZone.id)

  // Open the PC's detail drawer and travel to the adjacent zone via the
  // POSITION section's "Move to…" select (the options portal out of the sheet,
  // so scope the option to the page).
  await railRow.click()
  const drawer = page.getByRole("dialog")
  await drawer.getByRole("combobox", { name: "Move to zone" }).click()
  await page.getByRole("option", { name: target.destinationZone.name }).click()

  // The move is a Server-Action write; poll the DB rather than trust networkidle.
  await expect
    .poll(async () => await target.getCombatantZone())
    .toBe(target.destinationZone.id)
})

test("a spatial edit converges in another tab without navigation", async ({
  page,
  context,
}) => {
  const other = await context.newPage()
  await Promise.all([
    page.goto(target.encounter.url),
    other.goto(target.encounter.url),
  ])

  const detailName = `Open ${target.pc.name} detail`
  await page.getByRole("button", { name: detailName }).click()
  await other.getByRole("button", { name: detailName }).click()
  await expect(other.getByRole("dialog").getByText("Courtyard")).toBeVisible()

  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Move to zone" })
    .click()
  await page.getByRole("option", { name: target.destinationZone.name }).click()

  await expect(
    other.getByRole("dialog").getByText(target.destinationZone.name)
  ).toBeVisible({ timeout: 20_000 })
})
