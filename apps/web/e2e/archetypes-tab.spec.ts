import { expect, test } from "@playwright/test"

/**
 * End-to-end checks for the public Archetypes tab (UNN-147 / PRD §6.1 / §7.8).
 *
 * Assertions are semantics-first: roles, region labels, accessible names, and
 * the player-visible strings the AC calls out. They avoid pinning chip layout,
 * card shapes, or the small-caps section heading style so the design can keep
 * iterating without breaking E2E. Per-mechanic widget rendering is owned by
 * mechanics.spec.ts — this file is about the Archetypes-tab surface itself.
 *
 * seed-knight is the rich case (Active Knight at Mastered Rank 5, with Warrior
 * + Mage also unlocked at lower Ranks and filled inheritance slots); seed-
 * warrior is the bare case (one Archetype, no inheritance, no Mastery).
 */

test("Active Archetype card surfaces the full Rank-5 block", async ({
  page,
}) => {
  await page.goto("/c/seed-knight?tab=archetypes")

  // The Active card calls itself out with an "Active" badge and pins the
  // Archetype identity (name / Rank / Mastery) in its header.
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Knight", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Rank 5/5").first()).toBeVisible()

  // Mastered Archetypes (Rank 5) show the specific permanent bonus they grant.
  // Knight's mastery is +20 HP. The chip renders both in the Active card header
  // and the compact Knight card in the Lineage list, hence count 2.
  await expect(page.getByText("Mastery: +20 HP")).toHaveCount(2)

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

test("Unlocked Archetypes list groups by Lineage and marks the active one", async ({
  page,
}) => {
  await page.goto("/c/seed-knight?tab=archetypes")

  // Only the Lineages the character has unlocked appear as regions — three
  // for seed-knight (Warrior / Mage / Knight), not all twelve.
  await expect(
    page.getByRole("region", { name: "Warrior Lineage" })
  ).toBeVisible()
  await expect(page.getByRole("region", { name: "Mage Lineage" })).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Knight Lineage" })
  ).toBeVisible()
  await expect(
    page.getByRole("region", { name: "Healer Lineage" })
  ).toHaveCount(0)

  // The active Archetype carries an "Active" badge in its compact row inside
  // its Lineage. The summary cards each have one "Show details" button — three
  // cards ⇒ three triggers.
  await expect(
    page.getByRole("region", { name: "Knight Lineage" }).getByText("Active", {
      exact: true,
    })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Show details" })).toHaveCount(
    3
  )
})

test("a one-Archetype character renders empty Inheritance Slots + empty Unlocked list", async ({
  page,
}) => {
  await page.goto("/c/seed-warrior?tab=archetypes")

  // Both Initiate-tier Inheritance Slots are configured but unfilled on seed-
  // warrior. AC: marked, not omitted.
  await expect(page.getByText("Empty slot")).toHaveCount(2)

  // Saved Archetype Ranks renders as an integer (in the inline strip above
  // the Active card).
  await expect(page.getByText(/Saved Archetype Ranks/)).toBeVisible()

  // Only Warrior is unlocked ⇒ the Lineage list still renders Warrior (with
  // its Active badge), and the muted "no others" line sits underneath so the
  // surface doesn't appear broken.
  await expect(
    page.getByRole("region", { name: "Warrior Lineage" })
  ).toBeVisible()
  await expect(
    page.getByText("No other Archetypes unlocked yet.")
  ).toBeVisible()
})

test("Show details drawer renders the mechanic prose for a non-active Archetype", async ({
  page,
}) => {
  await page.goto("/c/seed-knight?tab=archetypes")

  // First Show details button in document order belongs to the Warrior card
  // (Warrior Lineage groups before Mage / Knight per the rulebook order).
  await page.getByRole("button", { name: "Show details" }).first().click()

  // The Drawer is a dialog by role and holds the full ArchetypeDetail block,
  // including the mechanic's name as a heading and its description prose.
  const drawer = page.getByRole("dialog")
  await expect(drawer).toBeVisible()
  await expect(
    drawer.getByRole("heading", { name: "Perfection" })
  ).toBeVisible()
  await expect(drawer.getByText(/Attack Rolls/).first()).toBeVisible()
})

test("read-only sheet has no owner-mode controls on the Archetypes tab", async ({
  page,
}) => {
  await page.goto("/c/seed-knight?tab=archetypes")

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
