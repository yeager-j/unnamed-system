import { expect, test } from "@playwright/test"
import { eq } from "drizzle-orm"

import { getDb } from "@/lib/db"
import {
  campaignBeat,
  campaignBeatMention,
} from "@/lib/db/schema/campaign-notes"
import { campaignUpdate } from "@/lib/db/schema/campaign-updates"
import { entity } from "@/lib/db/schema/entity"

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
 * E2E for Planner phase 3 (UNN-576): Session Notes (folder tree, beat editor
 * autosave, the `@` chip quick-mint, the day-picker → slot-picker schedule
 * control) and the Day Runner's downtime workspace (record an activity, the
 * story-slot card). One fresh campaign + placed character per run (the
 * write-spec factory pattern); **serial** — each test builds on the last's
 * state, walking the DM's real prep-then-run arc.
 */
test.use({ storageState: STORAGE_STATE })
test.describe.configure({ mode: "serial" })

const tracker = createTracker()
let campaign: Awaited<ReturnType<typeof createTestCampaign>>
let character: Awaited<ReturnType<typeof createTestCharacter>>

test.beforeAll(async () => {
  campaign = await createTestCampaign(tracker, {
    dmUserId: ENCOUNTER_DM_USER_ID,
    name: "Planner Notes Campaign",
  })
  character = await createTestCharacter(tracker, { name: "Planner Hero" })
  await placeCharacter(character.id, campaign.id)
})

test.afterAll(async () => {
  // Campaign delete cascades sessions/beats/updates/slots/clock (verified:
  // the update rows' own cascade clears the slotId RESTRICT before slots go).
  await cleanup(tracker)
})

test("first run: start the clock from the checklist", async ({ page }) => {
  await page.goto(`/campaigns/${campaign.shortId}`)
  await expect(page.getByText("Set the stage")).toBeVisible()

  await page.getByRole("button", { name: "Start the clock" }).click()

  await expect(page.getByRole("heading", { name: "Run the day" })).toBeVisible()
  // Both default slots are downtime pre-beats — assert the pair.
  await expect(page.getByText("Downtime · 0 / 1 recorded")).toHaveCount(2)
})

test("notes: create a beat, autosave the title, quick-mint a chip via @", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/notes`)

  await page.getByRole("button", { name: "New beat" }).click()
  await expect(page).toHaveURL(/\/notes\?beat=/)

  const title = page.getByPlaceholder("Untitled beat")
  await title.fill("The Queen's Offer")
  await title.blur()
  // The tree row mirrors the title instantly (no revalidate), then autosave
  // lands it (~800 ms LWW write).
  await expect(
    page.getByRole("button", { name: /The Queen's Offer/ })
  ).toBeVisible()
  await expect
    .poll(async () => (await readBeat()).title, { timeout: 5000 })
    .toBe("The Queen's Offer")

  // Type prose with an `@` trigger; the completion menu offers the quick-mint
  // rows (D7 — no kind-picker); picking one mints an NPC and inserts the chip.
  // The React menu mirrors CodeMirror's completion state and is aria-hidden
  // (the native completion owns a11y), so it's matched by content, not role,
  // and clicked to accept deterministically (keyboard accept settles async).
  const body = page.locator(".cm-content")
  await body.click()
  await page.keyboard.type("Ask @Odessa")
  const menu = page.locator("[data-participant-completion-menu]")
  await menu.getByText(/Create “Odessa” as NPC/).click()

  const chip = page.locator(
    '.cm-atomic-wiki-link[data-wiki-link-target^="npc:"]'
  )
  await expect(chip).toHaveText(/Odessa/)

  // The body autosave persists the `[[npc:id|label]]` token and re-derives
  // the mention index in the same transaction.
  await expect
    .poll(async () => (await readBeat()).body, { timeout: 5000 })
    .toMatch(/\[\[npc:[^|]+\|Odessa\]\]/)
  await expect
    .poll(async () => readMentions(), { timeout: 5000 })
    .toEqual([expect.objectContaining({ participantKind: "npc" })])

  // Reload: the stored markdown round-trips back into a chip pill.
  await page.reload()
  await expect(
    page.locator('.cm-atomic-wiki-link[data-wiki-link-target^="npc:"]')
  ).toHaveText(/Odessa/)
})

test("notes: slash command inserts a heading that persists as markdown", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}/notes`)
  await page.getByRole("button", { name: "New beat" }).click()
  await expect(page).toHaveURL(/\/notes\?beat=/)
  const beatId = new URL(page.url()).searchParams.get("beat")!

  // `/` on the empty first line opens the block menu — the same controlled
  // shadcn bridge that renders the chip completions; picking "Heading 2"
  // replaces the typed trigger with `## `.
  const body = page.locator(".cm-content")
  await body.click()
  await page.keyboard.type("/head")
  const menu = page.locator("[data-participant-completion-menu]")
  await expect(menu.getByText("Basic blocks")).toBeVisible()
  await menu.getByText("Heading 2", { exact: true }).click()
  await page.keyboard.type("The Queen's Court")

  // The body autosave persists plain CommonMark — the heading line survives
  // as `## ` text, not markup.
  await expect
    .poll(async () => (await readBeatById(beatId)).body, { timeout: 5000 })
    .toContain("## The Queen's Court")
})

test("notes: schedule the beat into a slot; occupied slots disable", async ({
  page,
}) => {
  const beat = await readBeat()
  await page.goto(`/campaigns/${campaign.shortId}/notes?beat=${beat.id}`)

  await page.getByRole("button", { name: "Not scheduled" }).click()
  await page.getByRole("menuitem", { name: "Day 1" }).hover()
  await page.getByRole("menuitem", { name: "Morning" }).click()

  await expect(
    page.getByRole("button", { name: "Day 1 · Morning" })
  ).toBeVisible()

  // A second beat sees the slot occupied — disabled and attributed.
  await page.getByRole("button", { name: "New beat" }).click()
  await page.getByRole("button", { name: "Not scheduled" }).click()
  await page.getByRole("menuitem", { name: "Day 1" }).hover()
  const occupied = page.getByRole("menuitem", { name: /Morning/ })
  await expect(occupied).toHaveText(/The Queen's Offer/)
  await expect(occupied).toHaveAttribute("aria-disabled", "true")
  await page.keyboard.press("Escape")
})

test("runner: the story slot renders the read-only beat card", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  await expect(page.getByText("Story · The Queen's Offer")).toBeVisible()
  await page
    .getByRole("button", { name: /Morning/ })
    .first()
    .click()

  await expect(page.getByText("Story beat")).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "The Queen's Offer" })
  ).toBeVisible()
  // Button-as-Link keeps role="button" (house Base UI composition).
  await expect(page.getByRole("button", { name: "Open notes" })).toBeVisible()
})

test("runner: record an activity with a category; pips and progress fill", async ({
  page,
}) => {
  await page.goto(`/campaigns/${campaign.shortId}`)

  // Evening is the downtime slot (Morning holds the beat).
  await page.getByRole("button", { name: /Evening/ }).click()
  await expect(
    page.getByRole("heading", { name: character.name })
  ).toBeVisible()

  await page
    .getByRole("textbox", { name: `${character.name}'s activity` })
    .fill("Loosened tongues in the tavern.")
  await page.getByRole("button", { name: "Activity type" }).click()
  await page.getByRole("menuitem", { name: /Practical/ }).click()
  await page.getByRole("button", { name: "Record activity" }).click()

  // The recorded entry replaces the composer; the pill + footer flip.
  await expect(page.getByText("Evening · Practical")).toBeVisible()
  await expect(page.getByText("Loosened tongues in the tavern.")).toBeVisible()
  await expect(page.getByText("Downtime · 1 / 1 recorded")).toBeVisible()
  await expect(page.getByText("1 / 2")).toBeVisible()

  // One campaignUpdate row, day server-derived, downtime facet present.
  const updates = await getDb()
    .select()
    .from(campaignUpdate)
    .where(eq(campaignUpdate.campaignId, campaign.id))
  expect(updates).toHaveLength(1)
  expect(updates[0]).toMatchObject({
    day: 1,
    primaryKind: "character",
    primaryId: character.id,
    category: "practical",
  })
  expect(updates[0]!.slotId).not.toBeNull()
})

test("previews: hovering a renamed NPC's chip shows its current name", async ({
  page,
}) => {
  const [mention] = await readMentions()
  const npcId = mention!.participantId

  // Rename the quick-minted NPC on its own page (per-field LWW autosave).
  await page.goto(`/campaigns/${campaign.shortId}/npcs/${npcId}`)
  const npcName = page.getByRole("textbox", { name: "NPC name" })
  await npcName.fill("Odessa Vane")
  await npcName.blur()
  await expect
    .poll(async () => readNpcName(npcId), { timeout: 5000 })
    .toBe("Odessa Vane")

  // Display path: the runner's beat card. The stored token still says
  // "Odessa" — the pill resolves live, and so must its card.
  await page.goto(`/campaigns/${campaign.shortId}`)
  await page
    .getByRole("button", { name: /Morning/ })
    .first()
    .click()
  const card = page.locator("[data-participant-preview-card]")
  await page
    .locator('[data-participant-preview-trigger^="npc:"]')
    .first()
    .hover()
  await expect(card).toContainText("Odessa Vane")

  // Editor: the same card under a CodeMirror pill — and clicking one still
  // navigates, so nothing the card shows is hover-only.
  const beat = await readBeat()
  await page.goto(`/campaigns/${campaign.shortId}/notes?beat=${beat.id}`)
  const chip = page.locator(
    '.cm-atomic-wiki-link[data-wiki-link-target^="npc:"]'
  )
  await chip.hover()
  await expect(card).toContainText("Odessa Vane")

  await chip.click()
  await expect(page).toHaveURL(new RegExp(`/npcs/${npcId}$`))
})

/** The run's first beat row (this spec creates the campaign, so it's ours). */
async function readBeat() {
  const rows = await getDb()
    .select()
    .from(campaignBeat)
    .where(eq(campaignBeat.campaignId, campaign.id))
    .orderBy(campaignBeat.createdAt)
  expect(rows.length).toBeGreaterThan(0)
  return rows[0]!
}

async function readBeatById(id: string) {
  const [row] = await getDb()
    .select()
    .from(campaignBeat)
    .where(eq(campaignBeat.id, id))
  expect(row).toBeDefined()
  return row!
}

async function readMentions() {
  const beat = await readBeat()
  return getDb()
    .select()
    .from(campaignBeatMention)
    .where(eq(campaignBeatMention.beatId, beat.id))
}

async function readNpcName(entityId: string) {
  const [row] = await getDb()
    .select({ name: entity.name })
    .from(entity)
    .where(eq(entity.id, entityId))
  return row?.name ?? null
}
