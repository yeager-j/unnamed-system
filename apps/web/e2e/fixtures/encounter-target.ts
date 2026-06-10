import { and, eq, inArray, notInArray } from "drizzle-orm"

import { createCombatSession } from "@workspace/game/engine"
import {
  type CombatantSetup,
  type CombatSession,
} from "@workspace/game/foundation"

import { makeSeedCharacter } from "@/lib/__fixtures__/seed-characters"
import { encounters, getDb } from "@/lib/db"
import type { EncounterStatus } from "@/lib/db/schema/encounter"
import { reduceCombatSession } from "@/lib/game-engine"

/**
 * Seed data for the encounter shell + join E2E (`e2e/encounter-shell.spec.ts`,
 * `e2e/join.spec.ts`, UNN-335/298/300/302/327). This is the kept **combat
 * showcase**: it describes **campaigns + their encounters** that read as real
 * demo data, so a dedicated step in `lib/db/seed.ts` seeds it. (Per-spec
 * write-path scaffolding lives in `e2e/fixtures/factory.ts`, not here.)
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
  const base = createCombatSession(deterministicIds(slug))(roster)
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
