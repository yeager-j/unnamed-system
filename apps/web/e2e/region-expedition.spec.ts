import { expect, test, type Page } from "@playwright/test"

import { STORAGE_STATE } from "./auth.setup"
import { cleanup, createTracker } from "./fixtures/factory"
import {
  createRegionExpeditionTarget,
  ENTRY,
  GHOST,
  HALL,
  VAULT,
} from "./fixtures/region-expedition-target"

/**
 * The UNN-589 expedition loop, end to end: mint an expedition from a Region,
 * start it (live seed-Map snapshot + roster), explore mid-run (reveal an
 * authored zone, hand-add a manual one), finish (the `staticReveal` knowledge
 * fold), then run a second expedition and assert the fold round-trip — the
 * authored reveal arrives pre-revealed, the hand-added zone died with run one.
 * State assertions poll the DB (the e2e doctrine's write-then-read rule); the
 * UI drives every lifecycle transition through the real actions.
 */

test.use({ storageState: STORAGE_STATE })

const tracker = createTracker()
let target: Awaited<ReturnType<typeof createRegionExpeditionTarget>>

test.describe.configure({ mode: "serial" })

test.beforeAll(async () => {
  target = await createRegionExpeditionTarget(tracker)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

/** Mint an expedition from the Region detail and start it from prep with the
 *  PC placed in Entry; resolves once the run console is live. */
async function mintAndStartExpedition(page: Page, name: string) {
  await page.goto(target.region.url)
  // Let hydration settle before the first click — a pre-hydration click on the
  // trigger is silently swallowed (networkidle is fine as a UI-settle wait; it
  // is only write-then-read sequencing it can't promise).
  await page.waitForLoadState("networkidle")
  await page.getByRole("button", { name: "New expedition" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  await dialog.getByLabel("Name").fill(name)
  await dialog.getByRole("button", { name: "Start expedition" }).click()

  // The prep screen for the freshly minted draft (variant-aware copy —
  // "Start expedition", not "Start delve").
  await page.waitForURL(/\/dungeon\//)
  await page.waitForLoadState("networkidle")
  await page.getByRole("combobox").first().click()
  await page.getByRole("option", { name: ENTRY.name }).click()
  await page.getByRole("button", { name: "Start expedition" }).click()

  // Started: the turn-loop bar is the active console's fixture.
  await expect(page.getByRole("button", { name: "Advance turn" })).toBeVisible()
}

test("expedition loop: fold at finish, re-apply at next start, manual space dies", async ({
  page,
}) => {
  // ── Expedition one ────────────────────────────────────────────────────────
  await mintAndStartExpedition(page, "First Expedition")

  const [first] = await target.getExpeditions()
  expect(first).toBeDefined()
  expect(first!.status).toBe("active")

  // Start snapshotted the live seed Map and placement revealed Entry.
  const started = await target.getInstanceState(first!.mapInstanceId)
  expect(started.reveal.revealedZoneIds).toContain(ENTRY.id)
  expect(Object.keys(started.geometry.zones).sort()).toEqual(
    [ENTRY.id, HALL.id, VAULT.id].sort()
  )
  // Every snapshotted zone is authored-stamped — the fold's gate.
  expect(started.generation.zones[HALL.id]?.source).toBe("authored")

  // Mid-run: reveal Hall (earned knowledge) + hand-add and reveal the Ghost
  // Annex (manual provenance — visit-scoped by construction).
  await target.exploreMidRun(first!.mapInstanceId)

  // Finish through the console — the expedition-variant confirm.
  await page.reload()
  await page.getByRole("button", { name: "Finish expedition" }).click()
  await expect(page.getByText("Finish this expedition?")).toBeVisible()
  await page.getByRole("button", { name: "Finish expedition" }).last().click()

  await expect
    .poll(async () => (await target.getExpeditions())[0]?.status)
    .toBe("done")

  // The fold: authored reveal charted to the seed Map; the manual zone —
  // although revealed — never folds.
  const staticReveal = await target.getStaticReveal()
  const chart = staticReveal[target.seedMap.id]
  expect(chart).toBeDefined()
  expect(chart!.zoneIds).toEqual(expect.arrayContaining([ENTRY.id, HALL.id]))
  expect(chart!.zoneIds).not.toContain(GHOST.id)
  expect(chart!.zoneIds).not.toContain(VAULT.id)

  // ── Expedition two ────────────────────────────────────────────────────────
  await mintAndStartExpedition(page, "Second Expedition")

  const expeditions = await target.getExpeditions()
  expect(expeditions).toHaveLength(2)
  const second = expeditions.find((row) => row.status === "active")
  expect(second).toBeDefined()
  expect(second!.id).not.toBe(first!.id)

  // The round-trip: Hall arrives revealed from the Region's chart (the party
  // never re-entered it this run); the hand-added Ghost Annex is gone from the
  // fresh snapshot entirely; unexplored Vault stays unrevealed.
  const restarted = await target.getInstanceState(second!.mapInstanceId)
  expect(restarted.reveal.revealedZoneIds).toEqual(
    expect.arrayContaining([ENTRY.id, HALL.id])
  )
  expect(restarted.reveal.revealedZoneIds).not.toContain(VAULT.id)
  expect(restarted.geometry.zones[GHOST.id]).toBeUndefined()

  // The Region-stable watch link resolves to the *current* expedition's watch.
  await page.goto(target.region.watchUrl)
  await page.waitForURL(new RegExp(`/dungeon/${second!.shortId}/watch`))
})
