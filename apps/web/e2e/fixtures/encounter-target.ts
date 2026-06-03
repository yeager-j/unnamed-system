import { eq } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { encounters, getDb } from "@/lib/db"
import type { EncounterStatus } from "@/lib/db/schema/encounter"

/**
 * Seed + reset data for the encounter shell E2E (`e2e/encounter-shell.spec.ts`,
 * UNN-335). Unlike the {@link import("./types").E2EFixture} rows (which are
 * character-shaped and seeded by the `DEV_USER_E2E_FIXTURES` loop), this fixture
 * describes a **campaign + its encounters**, so it is seeded by a dedicated step
 * in `lib/db/seed.ts` rather than that loop.
 *
 * The campaign's DM is the dev user (`dev-user-claude`) — the user both local
 * owner-mode dev and the Playwright auth fixture sign in as — so `requireCampaignDM`
 * lets that signed-in user create encounters and reach the DM console. (The
 * ticket's AC said `seed-user`; the dev user is the one actually authenticated in
 * these flows, so it must own the campaign.) Its id must equal `DEV_USER.id` in
 * `lib/db/seed.ts`.
 */
export const ENCOUNTER_DM_USER_ID = "dev-user-claude"

/** A *different* DM (`seed-user`) so the spec can prove the DM-only route 404s
 *  for an encounter that belongs to someone else's campaign. */
export const ENCOUNTER_FOREIGN_DM_USER_ID = "seed-user"

/** The PC placed into the seeded campaign — the roster source for the seeded
 *  draft encounter and the import-PCs step (UNN-298). */
const placedPc = makeSeedCharacter({
  slug: "encounter-pc",
  shortId: "encounter-pc",
  name: "Brannis Vael",
})

interface SeededEncounter {
  id: string
  shortId: string
  status: EncounterStatus
  url: string
}

function seededEncounter(
  slug: string,
  status: EncounterStatus
): SeededEncounter {
  return {
    id: `seed-encounter-${slug}`,
    shortId: `encounter-${slug}`,
    status,
    url: `/combat/encounter-${slug}`,
  }
}

export const encounterTarget = {
  campaign: {
    id: "seed-campaign-encounter",
    shortId: "encounter-campaign",
    name: "Playtest Campaign",
  },
  placedPc: {
    seed: placedPc,
    characterId: `seed-char-${placedPc.slug}`,
  },
  /** A `draft` encounter carrying the placed PC as one combatant, so the setup
   *  shell's Start button is enabled on load (the interactive stub path covers
   *  the empty-create case). */
  draft: seededEncounter("draft", "draft"),
  /** A `live` encounter → the combat console stub. */
  live: seededEncounter("live", "live"),
  /** An `ended` encounter → the read-only ended stub. */
  ended: seededEncounter("ended", "ended"),
  /** A `draft` encounter in a *foreign* (seed-user-owned) campaign — the dev
   *  user is not its DM, so the route must 404. */
  foreignCampaign: {
    id: "seed-campaign-foreign",
    shortId: "foreign-campaign",
    name: "Foreign Campaign",
  },
  foreign: seededEncounter("foreign", "draft"),
} as const

/** The campaigns page the New-encounter button lives on. */
export const ENCOUNTER_CAMPAIGNS_URL = "/campaigns"

/**
 * Resets each seeded encounter's `status` (and `version`) to its baseline so a
 * prior run's `draft → live` Start transition doesn't poison the next. The
 * `session` blob is re-seeded by `db:seed`; this only un-flips the columns a
 * spec mutates. Called from the spec's `beforeEach`.
 */
export async function resetEncounterFixtures(): Promise<void> {
  const db = getDb()
  for (const encounter of [
    encounterTarget.draft,
    encounterTarget.live,
    encounterTarget.ended,
  ]) {
    await db
      .update(encounters)
      .set({ status: encounter.status, version: 0 })
      .where(eq(encounters.id, encounter.id))
  }
}
