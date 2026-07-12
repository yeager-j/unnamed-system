import { expect, test } from "@playwright/test"
import { and, eq, isNotNull } from "drizzle-orm"

import { getDb } from "@/lib/db"
import { campaignClock } from "@/lib/db/schema/campaign-clock"
import { campaignBeat } from "@/lib/db/schema/campaign-notes"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import { campaignArticle } from "@/lib/db/schema/campaign-world"

import { STORAGE_STATE } from "./auth.setup"
import { ENCOUNTER_DM_USER_ID } from "./fixtures/encounter-target"
import {
  cleanup,
  createTestCampaign,
  createTestCharacter,
  createTracker,
  placeCharacter,
} from "./fixtures/factory"

/**
 * E2E for Planner phase 5 (UNN-578): the Calendar surface (add-days,
 * quick-create dated Articles, ribbon countdown) and the D5 deadline
 * lifecycle end-to-end — the advance hard gate (end-day + skip), Resolve on
 * the Calendar, Reopen (unbind keeps the prose), the two un-advance unbind
 * boundaries (resolved-on-its-day stays; resolved-later re-opens), and the
 * time-skip montage pass. One fresh campaign per run; **serial** — each test
 * walks on from the last's clock state.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const DEADLINE = "Rise of the Demon Lord"

const tracker = createTracker()
let campaign: Awaited<ReturnType<typeof createTestCampaign>>
let character: Awaited<ReturnType<typeof createTestCharacter>>

test.beforeAll(async () => {
  campaign = await createTestCampaign(tracker, {
    dmUserId: ENCOUNTER_DM_USER_ID,
    name: "Planner Calendar Campaign",
  })
  character = await createTestCharacter(tracker, { name: "Calendar Hero" })
  await placeCharacter(character.id, campaign.id)
})

test.afterAll(async () => {
  await cleanup(tracker)
})

test("start the clock; the calendar renders and add-days extends the horizon", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "Start the clock" }).click()
  await expect(page.getByRole("heading", { name: "Run the day" })).toBeVisible()

  await page.goto(`/campaigns/${campaign.shortId}/calendar`)
  await expect(page.getByText("Now · Day 1")).toBeVisible()
  // The pin, not the ↑ Today FAB (which is a button).
  await expect(page.locator("span:text-is('Today')")).toBeVisible()
  await expect(page.getByText("No deadlines looming")).toBeVisible()

  await page.getByRole("button", { name: "Add 7 days" }).click()
  await expect(page.getByText("Day 8", { exact: true })).toBeVisible()
})

test("schedule a beat onto a future slot and remove it again", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/notes`)
  await page.getByRole("button", { name: "New beat" }).click()
  await expect
    .poll(
      async () =>
        (
          await getDb()
            .select({ id: campaignBeat.id })
            .from(campaignBeat)
            .where(eq(campaignBeat.campaignId, campaign.id))
        ).length
    )
    .toBe(1)

  await page.goto(`/campaigns/${campaign.shortId}/calendar`)
  // The agenda's first open slot: schedule the fresh beat onto it.
  await page.getByRole("button", { name: "Schedule a beat" }).first().click()
  await page.getByRole("menuitem", { name: /Untitled beat/ }).click()
  await expect
    .poll(async () => (await readBeat()).scheduledSlotId)
    .not.toBeNull()

  // The occupied slot's ⋮ menu takes it off again (back to the shelf).
  await page.getByRole("button", { name: "Actions for Untitled beat" }).click()
  await page
    .getByRole("menuitem", { name: "Send back to the prepped shelf" })
    .click()
  await expect
    .poll(async () => {
      const beat = await readBeat()
      return { scheduledSlotId: beat.scheduledSlotId, floating: beat.floating }
    })
    .toEqual({ scheduledSlotId: null, floating: true })
})

test("quick-create a deadline and an event; the ribbon counts the deadline down", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/calendar`)

  await page.getByRole("button", { name: "Add a deadline on Day 3" }).click()
  await page
    .getByPlaceholder("Find an article or name something new")
    .fill(DEADLINE)
  await page.getByRole("button", { name: `Create “${DEADLINE}”` }).click()
  await expect(page.getByText("2d → Day 3")).toBeVisible()

  await page.getByRole("button", { name: "Add an event on Day 2" }).click()
  await page
    .getByPlaceholder("Find an article or name something new")
    .fill("Tidewake Festival")
  await page.getByRole("button", { name: "Create “Tidewake Festival”" }).click()
  await expect(page.getByText("Tidewake Festival")).toBeVisible()

  await expect
    .poll(async () => {
      const rows = await getDb()
        .select({
          name: campaignArticle.name,
          datedDay: campaignArticle.datedDay,
          datedKind: campaignArticle.datedKind,
        })
        .from(campaignArticle)
        .where(eq(campaignArticle.campaignId, campaign.id))
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    })
    .toEqual([
      { name: DEADLINE, datedDay: 3, datedKind: "deadline" },
      { name: "Tidewake Festival", datedDay: 2, datedKind: "event" },
    ])
  // The event stays off the ribbon: only the deadline's bar renders.
  const bars = await page.getByText(/d → Day \d/).count()
  expect(bars).toBe(1)
})

test("the hard gate blocks ending the day into the due day; resolving on the Calendar unblocks", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  // Day 1 → 2 passes (the deadline sits at Day 3; the Day-2 event never
  // gates); the empty day takes the warning's Resolve All path.
  await page.getByRole("button", { name: "End the day" }).click()
  await page.getByRole("button", { name: "Resolve All" }).click()
  await expect(page.getByText("Day 2", { exact: true }).first()).toBeVisible()

  // Day 2 → 3 would stand on the unresolved deadline's day: the gate fires.
  await page.getByRole("button", { name: "End the day" }).click()
  await expect(
    page.getByText("Time can't move past an unresolved deadline")
  ).toBeVisible()
  await expect(page.getByText(DEADLINE)).toBeVisible()
  await page.getByRole("button", { name: "Not yet" }).click()
  const [clock] = await getDb()
    .select({ currentDay: campaignClock.currentDay })
    .from(campaignClock)
    .where(eq(campaignClock.campaignId, campaign.id))
  expect(clock!.currentDay).toBe(2)

  // Resolve on the Calendar (blank prose → the outcome-neutral default body).
  await page.goto(`/campaigns/${campaign.shortId}/calendar`)
  await page.getByRole("button", { name: "Resolve", exact: true }).click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve" })
    .click()
  await expect
    .poll(async () => {
      const marker = await readMarker()
      return marker ? { day: marker.day, body: marker.body } : null
    })
    .toEqual({ day: 2, body: `Resolved — ${DEADLINE}` })

  // Resolved ⇒ the gate opens and the day ends.
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "End the day" }).click()
  await page.getByRole("button", { name: "Resolve All" }).click()
  await expect(page.getByText("Day 3", { exact: true }).first()).toBeVisible()
})

test("un-advance keeps a marker from the restored day; reopen unbinds but keeps the prose", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  // Un-advance 3 → 2: the marker was stamped ON Day 2, so it stays bound —
  // you restore the state that legally allowed the advance (D5).
  await page.getByRole("button", { name: "More clock actions" }).click()
  await page.getByRole("menuitem", { name: "Go back to Day 2" }).click()
  await page.getByRole("button", { name: "Go back" }).click()
  await expect(page.getByText("Day 2", { exact: true }).first()).toBeVisible()
  expect((await readMarker())?.day).toBe(2)

  // Walk back onto Day 3 (Day 2 was Idle-filled earlier, so the ready-path
  // confirm renders) and reopen from the Calendar: the marker unbinds, the
  // prose survives as an ordinary update.
  await page.getByRole("button", { name: "End the day" }).click()
  await page.getByRole("button", { name: "End the day" }).last().click()
  await expect(page.getByText("Day 3", { exact: true }).first()).toBeVisible()

  await page.goto(`/campaigns/${campaign.shortId}/calendar`)
  await page.getByRole("button", { name: `Actions for ${DEADLINE}` }).click()
  await page
    .getByRole("menuitem", { name: "Reopen — the threat returns" })
    .click()
  await expect
    .poll(async () => {
      const rows = await getDb()
        .select({ resolves: campaignUpdate.resolvesArticleId })
        .from(campaignUpdate)
        .where(
          and(
            eq(campaignUpdate.campaignId, campaign.id),
            eq(campaignUpdate.body, `Resolved — ${DEADLINE}`)
          )
        )
      return rows.map((row) => row.resolves)
    })
    .toEqual([null])

  // Overdue-unresolved renders Due and blocks the NEXT advance (D5).
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "End the day" }).click()
  await expect(
    page.getByText("Time can't move past an unresolved deadline")
  ).toBeVisible()
  await page.getByRole("button", { name: "Not yet" }).click()
})

test("un-advance unbinds a marker stamped after the restored day", async ({
  page,
}) => {
  // Re-resolve on Day 3, then roll back to Day 2: the new marker (day 3 > 2)
  // unbinds — the deadline is open again on the restored timeline.
  await page.goto(`/campaigns/${campaign.shortId}/calendar`)
  await page.getByRole("button", { name: "Resolve", exact: true }).click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve" })
    .click()
  await expect.poll(async () => (await readMarker())?.day).toBe(3)

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "More clock actions" }).click()
  await page.getByRole("menuitem", { name: "Go back to Day 2" }).click()
  await page.getByRole("button", { name: "Go back" }).click()
  await expect(page.getByText("Day 2", { exact: true }).first()).toBeVisible()
  await expect.poll(async () => await readMarker()).toBeNull()
})

test("a time-skip carries the montage pass; blank-less skip is blocked until resolved", async ({
  page,
}) => {
  // The deadline (Day 3) is unresolved again: the skip dialog pre-warns and
  // holds the gesture.
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "More clock actions" }).click()
  await page.getByRole("menuitem", { name: /Skip ahead/ }).click()
  await expect(
    page.getByText("Time can't skip past an unresolved deadline:")
  ).toBeVisible()
  await page.getByRole("button", { name: "Cancel" }).click()

  // Resolve (marker stamps Day 2), then skip 3 days with one montage entry.
  await page.goto(`/campaigns/${campaign.shortId}/calendar`)
  await page.getByRole("button", { name: "Resolve", exact: true }).click()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Resolve" })
    .click()
  await expect.poll(async () => (await readMarker())?.day).toBe(2)

  await page.goto(`/campaigns/${campaign.shortId}`)
  await page.getByRole("button", { name: "More clock actions" }).click()
  await page.getByRole("menuitem", { name: /Skip ahead/ }).click()
  await page.getByLabel("Days").fill("3")
  await page
    .getByPlaceholder("Kept watch on the road north…")
    .fill("Walked the salt flats, mapping the northern approach.")
  await page.getByRole("button", { name: "Skip ahead" }).click()
  await expect(page.getByText("Day 5", { exact: true }).first()).toBeVisible()

  // One unslotted update per participating character, stamped on the landing day.
  await expect
    .poll(async () => {
      const rows = await getDb()
        .select({
          day: campaignUpdate.day,
          slotId: campaignUpdate.slotId,
          primaryId: campaignUpdate.primaryId,
          category: campaignUpdate.category,
        })
        .from(campaignUpdate)
        .where(
          and(
            eq(campaignUpdate.campaignId, campaign.id),
            eq(
              campaignUpdate.body,
              "Walked the salt flats, mapping the northern approach."
            )
          )
        )
      return rows
    })
    .toEqual([
      {
        day: 5,
        slotId: null,
        primaryId: character.id,
        category: "practical",
      },
    ])
})

/** The run's one beat row (minted by the schedule-and-remove test). */
async function readBeat() {
  const rows = await getDb()
    .select()
    .from(campaignBeat)
    .where(eq(campaignBeat.campaignId, campaign.id))
  expect(rows).toHaveLength(1)
  return rows[0]!
}

/** The campaign's single live ⚑ marker (partial-unique: at most one), or null. */
async function readMarker() {
  const rows = await getDb()
    .select({
      day: campaignUpdate.day,
      body: campaignUpdate.body,
    })
    .from(campaignUpdate)
    .where(
      and(
        eq(campaignUpdate.campaignId, campaign.id),
        isNotNull(campaignUpdate.resolvesArticleId)
      )
    )
  expect(rows.length).toBeLessThanOrEqual(1)
  return rows[0] ?? null
}
