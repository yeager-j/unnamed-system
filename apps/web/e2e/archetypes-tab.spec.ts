import { expect, test } from "@playwright/test"

import { openSheetTab } from "./open-sheet-tab"

/**
 * End-to-end checks for the public Archetypes tab (UNN-147 / PRD §6.1 / §7.8).
 *
 * Assertions are semantics-first: roles, region labels, accessible names, and
 * the player-visible strings the AC calls out. They avoid pinning chip layout,
 * card shapes, or the small-caps section heading style so the design can keep
 * iterating without breaking E2E. Per-mechanic widget rendering is owned by
 * mechanics.spec.ts — this file is about the Archetypes-tab surface itself.
 *
 * Since UNN-276 the tab is just the Active-Archetype spotlight + an "Open
 * Lineage Atlas" link; the flat unlocked-by-Lineage roster moved to the
 * publicly-viewable Atlas (see archetype-atlas.spec.ts). seed-knight is the rich
 * case (Active Knight at Mastered Rank 5 with filled inheritance slots); seed-
 * warrior is the bare case (one Archetype, no inheritance, no Mastery).
 */

test("Active Archetype card surfaces the full Rank-5 block", async ({
  page,
}) => {
  await openSheetTab(page, "/c/seed-knight", "Archetypes")

  // The Active card calls itself out with an "Active" badge and pins the
  // Archetype identity (name / Rank / Mastery) in its header.
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Knight", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Rank 5/5").first()).toBeVisible()

  // Mastered Archetypes (Rank 5) show the specific permanent bonus they grant.
  // Knight's mastery is +20 HP, on the lone Active card (the compact Lineage
  // list that used to repeat it was retired in UNN-276).
  await expect(page.getByText("Mastery: +20 HP")).toHaveCount(1)

  // Skills the character has at the current Rank are shown by name — the
  // Synthesis Skill at Rank 5 reads as a labeled "Synthesis: ..." badge.
  await expect(
    page.getByText("Hammer of Justice", { exact: false }).first()
  ).toBeVisible()
  await expect(page.getByText("Skewer", { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText("Auto-Rakukaja", { exact: true }).first()
  ).toBeVisible()

  // Inheritance slots show their source Archetype + the inherited Skill name.
  // seed-knight fills both Knight slots: Slot 1 from Mage (Agi), Slot 2 from
  // Warrior (Cleave).
  await expect(page.getByText(/Slot 1.*Mage/)).toBeVisible()
  await expect(page.getByText(/Slot 2.*Warrior/)).toBeVisible()
})

test("a one-Archetype character renders empty Inheritance Slots", async ({
  page,
}) => {
  await openSheetTab(page, "/c/seed-warrior", "Archetypes")

  // Both Initiate-tier Inheritance Slots are configured but unfilled on seed-
  // warrior. AC: marked, not omitted.
  await expect(page.getByText("Empty slot")).toHaveCount(2)
})

test("the Archetypes tab links publicly to the Lineage Atlas", async ({
  page,
}) => {
  // Signed-out (no storageState): the Atlas link is public now (UNN-276), the
  // tab's single path to the unlocked roster / tier trees.
  await openSheetTab(page, "/c/seed-knight", "Archetypes")

  await expect(
    page.getByRole("button", { name: "Open Lineage Atlas" })
  ).toBeVisible()
})

test("read-only sheet has no owner-mode controls on the Archetypes tab", async ({
  page,
}) => {
  await openSheetTab(page, "/c/seed-knight", "Archetypes")

  // AC: no Switch / Rank up / Unlock affordances on this surface. Match the
  // button names loosely so a future rename ("Promote" etc.) still trips the
  // check.
  for (const denied of [
    /Switch.*Archetype/i,
    /Rank up/i,
    /Unlock.*Archetype/i,
  ]) {
    await expect(page.getByRole("button", { name: denied })).toHaveCount(0)
  }
})
