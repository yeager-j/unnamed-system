import { and, eq, inArray, notInArray } from "drizzle-orm"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { encounters, getDb } from "@/lib/db"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import {
  createCombatSession,
  reduceCombatSession,
  type CombatantSetup,
  type CombatSession,
} from "@/lib/game/encounter"

/**
 * Seed + reset data for the encounter shell E2E (`e2e/encounter-shell.spec.ts`,
 * UNN-335/298/300/302). Unlike the {@link import("./types").E2EFixture} rows
 * (character-shaped, seeded by the `DEV_USER_E2E_FIXTURES` loop), this fixture
 * describes **campaigns + their encounters**, so a dedicated step in
 * `lib/db/seed.ts` seeds it.
 *
 * **Two dev-DM campaigns, by design** (UNN-302's single-live guard):
 *  - **Campaign A** ("Playtest") holds the `draft` + `ended` encounters and the
 *    placed PC. A has *no* live encounter, so its draft can be started (happy
 *    path) and saved/resumed.
 *  - **Campaign B** ("Live") holds the `live` encounter *and* a second `blocked`
 *    draft — starting that draft must be rejected because B already has a live
 *    encounter.
 *
 * Both are owned by the dev user (`dev-user-claude`) — the user local dev and the
 * Playwright auth fixture sign in as — so `requireCampaignDM` admits the test's
 * writes. Their ids must equal `DEV_USER.id` in `lib/db/seed.ts`.
 */
export const ENCOUNTER_DM_USER_ID = "dev-user-claude"

/** A *different* DM (`seed-user`) so the spec can prove the DM-only route 404s
 *  for an encounter that belongs to someone else's campaign. */
export const ENCOUNTER_FOREIGN_DM_USER_ID = "seed-user"

/** The PC placed into Campaign A — the roster source for its draft encounter and
 *  the import-PCs panel (UNN-298). */
const placedPc = makeSeedCharacter({
  slug: "encounter-pc",
  shortId: "encounter-pc",
  name: "Brannis Vael",
})

const PLACED_PC_ID = `seed-char-${placedPc.slug}`

/** A dev-owned, finalized, **unplaced** character reserved for the placement spec
 *  (UNN-328) so its `campaignId` churn never races the encounter/import specs that
 *  rely on {@link placedPc} sitting in Campaign A. */
const placementChar = makeSeedCharacter({
  slug: "placement-pc",
  shortId: "placement-pc",
  name: "Pelle Quist",
})

const PLACEMENT_CHAR_ID = `seed-char-${placementChar.slug}`

/** A dev-owned, finalized character reserved for the lifecycle spec (UNN-330):
 *  leave / delete-campaign / delete + kick live-lock. Uncontended so its
 *  placement + deletion attempts don't race the placement spec. */
const lifecycleChar = makeSeedCharacter({
  slug: "lifecycle-pc",
  shortId: "lifecycle-pc",
  name: "Tamsin Roe",
})

const LIFECYCLE_CHAR_ID = `seed-char-${lifecycleChar.slug}`

/** A dev-owned, finalized character placed into Campaign B and standing as a PC
 *  combatant in its **live** encounter — the live console's turn-flow tests in
 *  `encounter-shell.spec.ts` (UNN-344) drive its turn. Dedicated (and thus
 *  live-locked) so no placement/lifecycle spec contends with it. */
const liveCombatPc = makeSeedCharacter({
  slug: "live-combat-pc",
  shortId: "live-combat-pc",
  name: "Roan Vale",
})

const LIVE_COMBAT_PC_ID = `seed-char-${liveCombatPc.slug}`

/** A dev-DM campaign reserved for the placement spec (UNN-328) — uncontended, so
 *  placing/unplacing/moving into it doesn't disturb the other campaign specs. */
const placementCampaign = {
  id: "seed-campaign-placement",
  shortId: "placement-campaign",
  joinToken: "join-placement",
  name: "Placement Campaign",
} as const

const campaignA = {
  id: "seed-campaign-encounter",
  shortId: "encounter-campaign",
  joinToken: "join-playtest",
  name: "Playtest Campaign",
} as const

const campaignB = {
  id: "seed-campaign-live",
  shortId: "live-campaign",
  joinToken: "join-live",
  name: "Live Campaign",
} as const

const foreignCampaign = {
  id: "seed-campaign-foreign",
  shortId: "foreign-campaign",
  joinToken: "join-foreign",
  name: "Foreign Campaign",
} as const

/** A seed-user-owned campaign reserved for the campaign-surfaces spec (UNN-329)
 *  so its member-overview / non-member-404 assertions don't race join.spec's
 *  foreign-campaign membership churn. No other spec touches it. */
const overviewCampaign = {
  id: "seed-campaign-overview",
  shortId: "overview-campaign",
  joinToken: "join-overview",
  name: "Overview Campaign",
} as const

/** A throwaway enemy combatant so the `blocked` draft's Start button is
 *  clickable (the single-live rejection is what the spec asserts). */
const enemySetup: CombatantSetup = {
  side: "enemies",
  ref: {
    kind: "enemy",
    statBlock: {
      name: "Practice Dummy",
      maxHP: 10,
      currentHP: 10,
      maxSP: 0,
      currentSP: 0,
      attributes: { strength: 0, magic: 0, agility: 0, luck: 0 },
    },
  },
  zoneId: "",
}

const pcSetup: CombatantSetup = {
  side: "players",
  ref: { kind: "pc", characterId: PLACED_PC_ID },
  zoneId: "",
}

/** The live encounter's started roster (UNN-344): one PC on the players side and
 *  two enemies (a catalog goblin + an inline stat block) so drafting, side
 *  alternation, and back-to-back finishing are all exercisable. */
const liveRoster: CombatantSetup[] = [
  {
    side: "players",
    ref: { kind: "pc", characterId: LIVE_COMBAT_PC_ID },
    zoneId: "",
  },
  {
    side: "enemies",
    ref: { kind: "catalog-enemy", enemyKey: "goblin" },
    zoneId: "",
  },
  {
    side: "enemies",
    ref: {
      kind: "enemy",
      statBlock: {
        name: "Cave Bat",
        maxHP: 8,
        currentHP: 8,
        maxSP: 0,
        currentSP: 0,
        attributes: { strength: 0, magic: 0, agility: 2, luck: 0 },
      },
    },
    zoneId: "",
  },
]

/** A stable id generator so re-seeding doesn't churn the session blob. */
function deterministicIds(slug: string): () => string {
  let n = 0
  return () => `seed-combatant-${slug}-${n++}`
}

interface SeededEncounter {
  id: string
  shortId: string
  status: EncounterStatus
  campaignId: string
  url: string
  /** Canonical session — built once, used by both the seed and the reset. */
  session: CombatSession
}

function seededEncounter(
  slug: string,
  status: EncounterStatus,
  campaignId: string,
  roster: CombatantSetup[],
  start?: { advantage: "players" | "enemies" | "neutral"; firstSide: "players" }
): SeededEncounter {
  const base = createCombatSession(roster, deterministicIds(slug))
  // A `live` encounter has already run `startCombat`, so its advantage/firstSide
  // are set — replay that event here so the seeded session matches a real live
  // one (the console's advantage chip + drafting order need it).
  const session = start
    ? reduceCombatSession(base, { kind: "startCombat", ...start })
    : base
  return {
    id: `seed-encounter-${slug}`,
    shortId: `encounter-${slug}`,
    status,
    campaignId,
    url: `/combat/encounter-${slug}`,
    session,
  }
}

export const encounterTarget = {
  campaignA,
  campaignB,
  foreignCampaign,
  overviewCampaign,
  placementCampaign,
  placementChar: { seed: placementChar, characterId: PLACEMENT_CHAR_ID },
  lifecycleChar: { seed: lifecycleChar, characterId: LIFECYCLE_CHAR_ID },
  placedPc: { seed: placedPc, characterId: PLACED_PC_ID },
  liveCombatPc: { seed: liveCombatPc, characterId: LIVE_COMBAT_PC_ID },
  /** Campaign A, startable (A has no live encounter) — carries the placed PC. */
  draft: seededEncounter("draft", "draft", campaignA.id, [pcSetup]),
  /** Campaign A, read-only ended stub. */
  ended: seededEncounter("ended", "ended", campaignA.id, []),
  /** Campaign B's live encounter → the live combat console (UNN-344): a started
   *  session (neutral advantage, players first) with a PC + two enemies. */
  live: seededEncounter("live", "live", campaignB.id, liveRoster, {
    advantage: "neutral",
    firstSide: "players",
  }),
  /** Campaign B, draft — starting it is rejected by the single-live guard (B
   *  already has `live`). Seeded with one combatant so Start is clickable. */
  blocked: seededEncounter("blocked", "draft", campaignB.id, [enemySetup]),
  /** A `draft` in the foreign (seed-user) campaign — the dev user is not its DM,
   *  so the route must 404. */
  foreign: seededEncounter("foreign", "draft", foreignCampaign.id, []),
} as const

/** Campaign A's manage page — where the New-encounter dialog lives (UNN-329). */
export const ENCOUNTER_CAMPAIGN_MANAGE_URL = `/campaigns/${campaignA.shortId}`

/** Every seeded encounter, for the seed + reset loops. */
export const SEEDED_ENCOUNTERS: SeededEncounter[] = [
  encounterTarget.draft,
  encounterTarget.ended,
  encounterTarget.live,
  encounterTarget.blocked,
  encounterTarget.foreign,
]

/**
 * Restores the seeded encounters to their canonical baseline before each test:
 *
 *  1. **Deletes stray encounters** the create-flow test minted in the dev-DM
 *     campaigns (random `shortId`s `db:seed` can't reach) — otherwise a prior
 *     run's started encounter leaves Campaign A with a `live` row and the
 *     single-live guard blocks every subsequent happy-path Start.
 *  2. **Resets** each known seeded encounter's `status`, `version`, and `session`
 *     so a "Save draft" / "Start" from a prior test doesn't carry over.
 *
 * The spec runs `serial` so these resets aren't racing a parallel test mutating
 * the same campaign-level live state.
 */
export async function resetEncounterFixtures(): Promise<void> {
  const db = getDb()

  await db.delete(encounters).where(
    and(
      inArray(encounters.campaignId, [campaignA.id, campaignB.id]),
      notInArray(
        encounters.id,
        SEEDED_ENCOUNTERS.map((encounter) => encounter.id)
      )
    )
  )

  await Promise.all(
    SEEDED_ENCOUNTERS.map((encounter) =>
      db
        .update(encounters)
        .set({
          status: encounter.status,
          version: 0,
          session: encounter.session,
        })
        .where(eq(encounters.id, encounter.id))
    )
  )
}
