import { eq, inArray } from "drizzle-orm"

import type { Lineage } from "@workspace/game-v2/kernel/vocab"

import type { ParticipantKind } from "@/domain/planner/participant"
import { DEFAULT_SLOT_TEMPLATE } from "@/domain/planner/slot-template"
import type { UpdateCategory } from "@/domain/planner/update-category"

import { makeSeedCharacter } from "../__fixtures__/seed-characters"
import { insertSeedEntity } from "./seed-entity"

/**
 * Seeds **one long-history campaign** (~120 days) so the Campaign Planner's
 * Chronicle (UNN-580, phase 7) can be exercised at depth locally — the
 * surfaces the day-1–3 dev campaigns leave with only unit coverage (UNN-618):
 *
 * - the **jump rail** (needs `currentDay > 30`; Day 120 → 4 buckets),
 * - **"Load earlier days"** (needs > 50 non-Idle rows after the default filter),
 * - keyset page boundaries + the `id` tie-break for same-`authoredAt` batches
 *   (end-day Idle fills and the montage days below bulk-insert tied rows — one
 *   montage is deliberately longer than a page so a boundary *must* land inside
 *   a single `(day, authoredAt)` run),
 * - `?day=N` deep slices, resolved/overdue deadline markers, and mixed
 *   primaries/concerns so participant + category filters compose with paging.
 *
 * Everything is **deterministic** — every `id` and `authoredAt` is derived
 * from `(day, sequence)`, never `crypto.randomUUID()`/`now()` — and
 * **idempotent**: the campaign, clock, and placed PCs upsert by stable id,
 * while the high-volume child rows (updates, slots, seasons, articles, NPCs)
 * are cleared for this campaign and re-inserted, so a re-run neither
 * duplicates rows nor drifts a page boundary.
 */

const CAMPAIGN = {
  id: "seed-campaign-long",
  shortId: "long-chronicle",
  joinToken: "seed-join-long-chronicle",
  name: "The Ashfall Chronicle",
  description:
    "A ~120-day campaign seeded to exercise the Chronicle at depth (UNN-618).",
} as const

const CURRENT_DAY = 120

/** Postgres bind-parameter safety: cap each multi-row insert. */
const CHUNK = 500

/** Day-1 anchor for the deterministic `authoredAt` clock (UTC midnight). */
const BASE_MS = Date.UTC(2024, 8, 1, 0, 0, 0)
const DAY_MS = 86_400_000

/** A deterministic `authoredAt` for a day + wall-clock time. A shared `(h, m)`
 *  across several rows on one day is a same-timestamp batch — the `id`
 *  tie-break is what keeps those pages stable. */
function at(day: number, hour: number, minute: number): Date {
  return new Date(BASE_MS + (day - 1) * DAY_MS + (hour * 60 + minute) * 60_000)
}

const pad3 = (n: number): string => String(n).padStart(3, "0")

/** The four party PCs, placed into the long campaign so their names resolve on
 *  timelines and they fill the participant-filter linker. Plain rows — their
 *  sheets are not the point, only that they are valid placed characters. */
const PARTY = [
  { slug: "long-vera", name: "Vera Ashdown", pronouns: "she/her" },
  { slug: "long-tomas", name: "Tomas Kell", pronouns: "he/him" },
  { slug: "long-selene", name: "Selene Marsh", pronouns: "she/her" },
  { slug: "long-bram", name: "Bram Odell", pronouns: "he/him" },
] as const

const partyEntityId = (slug: string): string => `seed-char-${slug}`

interface NpcSpec {
  key: string
  name: string
  arcana: string | null
  lineageKey: Lineage | null
  bondTier: number
  /** Day its bond last changed (stamps `bondTierChangedAt`); null ⇒ never. */
  bondChangedDay: number | null
}

/** NPCs the world revolves around. Lineage keys are unique across the set (the
 *  hard per-campaign Atlas-gate constraint). `hollow-king` is the recurring
 *  antagonist concerned across every bucket, so an `about=npc:…` filter stays
 *  full deep into history. */
const NPCS: NpcSpec[] = [
  {
    key: "hollow-king",
    name: "The Hollow King",
    arcana: "The Tower",
    lineageKey: "warlock",
    bondTier: 1,
    bondChangedDay: 4,
  },
  {
    key: "sable",
    name: "Sable Renn",
    arcana: "The Moon",
    lineageKey: "thief",
    bondTier: 3,
    bondChangedDay: 2,
  },
  {
    key: "prior-alric",
    name: "Prior Alric",
    arcana: "The Hierophant",
    lineageKey: "healer",
    bondTier: 2,
    bondChangedDay: 12,
  },
  {
    key: "mera",
    name: "Mera of the Fens",
    arcana: "The Hermit",
    lineageKey: "hunter",
    bondTier: 1,
    bondChangedDay: null,
  },
  {
    key: "envoy",
    name: "The Ashen Envoy",
    arcana: "The Emperor",
    lineageKey: "summoner",
    bondTier: 1,
    bondChangedDay: 40,
  },
  {
    key: "lio",
    name: "Lio the Ferryman",
    arcana: "Death",
    lineageKey: null,
    bondTier: 2,
    bondChangedDay: null,
  },
  {
    key: "goodwife",
    name: "Goodwife Harrow",
    arcana: null,
    lineageKey: null,
    bondTier: 0,
    bondChangedDay: null,
  },
  {
    key: "grey-choir",
    name: "The Grey Choir",
    arcana: null,
    lineageKey: null,
    bondTier: 0,
    bondChangedDay: null,
  },
]

const npcEntityId = (key: string): string => `seed-npc-long-${key}`

interface ArticleSpec {
  key: string
  name: string
  type: string
  datedKind?: "event" | "deadline"
  datedDay?: number
}

const ARTICLES: ArticleSpec[] = [
  { key: "ashen-court", name: "The Ashen Court", type: "Faction" },
  { key: "saltmarsh", name: "Saltmarsh", type: "Place" },
  { key: "grey-choir", name: "The Grey Choir", type: "Lore" },
  { key: "black-ledger", name: "The Black Ledger", type: "Object" },
  { key: "whispering-fens", name: "The Whispering Fens", type: "Place" },
  { key: "emberfall-rite", name: "The Emberfall Rite", type: "Lore" },
  {
    key: "midsummer-fair",
    name: "The Midsummer Fair",
    type: "Event",
    datedKind: "event",
    datedDay: 45,
  },
  {
    key: "long-eclipse",
    name: "The Long Eclipse",
    type: "Event",
    datedKind: "event",
    datedDay: 100,
  },
  // Deadlines resolved on varied days (⚑ markers authored the day before).
  {
    key: "dl-tithe",
    name: "The Baron's Tithe",
    type: "Deadline",
    datedKind: "deadline",
    datedDay: 20,
  },
  {
    key: "dl-ultimatum",
    name: "The Envoy's Ultimatum",
    type: "Deadline",
    datedKind: "deadline",
    datedDay: 55,
  },
  {
    key: "dl-flood",
    name: "The Spring Flood",
    type: "Deadline",
    datedKind: "deadline",
    datedDay: 88,
  },
  // Overdue-unresolved: past its day, no ⚑ marker (renders as Due).
  {
    key: "dl-siege",
    name: "The Siege of Vell",
    type: "Deadline",
    datedKind: "deadline",
    datedDay: 70,
  },
  // Due today (== currentDay), unresolved.
  {
    key: "dl-judgment",
    name: "The Court's Judgment",
    type: "Deadline",
    datedKind: "deadline",
    datedDay: 120,
  },
  // Looming: still in the future.
  {
    key: "dl-comet",
    name: "The Comet's Return",
    type: "Deadline",
    datedKind: "deadline",
    datedDay: 130,
  },
]

const articleId = (key: string): string => `seed-art-long-${key}`

/** ⚑ deadline resolutions: which article a world update resolves, on which day. */
const MARKERS = [
  { articleKey: "dl-tithe", day: 19 },
  { articleKey: "dl-ultimatum", day: 54 },
  { articleKey: "dl-flood", day: 87 },
] as const

const SEASONS = [
  { day: 1, label: "Late Thaw" },
  { day: 28, label: "The Long Green" },
  { day: 61, label: "Emberfall" },
  { day: 95, label: "First Frost" },
] as const

/**
 * Montage days: a **same-`authoredAt`** burst of world updates. `day 100`'s
 * run is deliberately longer than one 50-row page, so — since the feed pages
 * newest-first — a page boundary is guaranteed to fall inside a single
 * `(day, authoredAt)` run, exercising the cursor's `id` tie-break at a seam.
 */
const MONTAGES: Record<number, { size: number; hour: number; label: string }> =
  {
    45: { size: 12, hour: 18, label: "the fair" },
    61: { size: 22, hour: 20, label: "Emberfall" },
    78: { size: 30, hour: 17, label: "the muster" },
    100: { size: 60, hour: 12, label: "the eclipse" },
    113: { size: 40, hour: 19, label: "the reckoning" },
  }

const NONIDLE_CATEGORIES: Exclude<UpdateCategory, "idle">[] = [
  "virtue",
  "talent",
  "practical",
  "collaborator",
]

const DOWNTIME_BODIES: Record<Exclude<UpdateCategory, "idle">, string[]> = {
  virtue: [
    "Sat a long watch and let the anger cool.",
    "Kept a promise that cost more than it was worth.",
    "Refused an easy lie, even to a friend.",
    "Gave the last of the rations to the road-orphans.",
  ],
  talent: [
    "Drilled swordforms until the light failed.",
    "Copied out the old marsh-roads by candle.",
    "Practiced the locks the Ledger's clasp would need.",
    "Studied the ward-lines cut into the court gate.",
  ],
  practical: [
    "Mended worn gear at the smithy.",
    "Bartered hard for salt and dry powder.",
    "Set snares along the fen causeway.",
    "Patched the boat before the tide turned.",
  ],
  collaborator: [
    "Traded old grievances over a shared bottle.",
    "Stood a double watch so the other could sleep.",
    "Argued the plan into something that might work.",
    "Walked the walls together, saying little.",
  ],
}

const WORLD_BODIES: string[] = [
  "Ash drifted down from the northern range for a third straight day.",
  "The court's heralds posted a new levy on the market gate.",
  "A grey-robed singer was seen at the crossroads before dawn.",
  "The fen-water rose a hand's breadth overnight.",
  "Word came of a caravan that never reached Saltmarsh.",
  "The Ledger changed hands again, or so the rumor ran.",
  "Bells rang at the wrong hour and no one would say why.",
  "A cold wind carried the smell of char off the marsh.",
]

export async function seedLongCampaign(devUserId: string): Promise<void> {
  const {
    db,
    campaigns,
    campaignClock,
    campaignSlot,
    campaignSlotDungeon,
    campaignSeason,
    campaignArticle,
    campaignNpc,
    campaignUpdate,
    campaignUpdateConcern,
    entity,
  } = await import("./index")

  // ── Campaign (upsert; stable id → re-run resets in place) ──────────────────
  const campaignRow = {
    id: CAMPAIGN.id,
    shortId: CAMPAIGN.shortId,
    joinToken: CAMPAIGN.joinToken,
    dmUserId: devUserId,
    name: CAMPAIGN.name,
    description: CAMPAIGN.description,
    lineageGating: true,
  }
  await db
    .insert(campaigns)
    .values(campaignRow)
    .onConflictDoUpdate({ target: campaigns.id, set: campaignRow })

  // ── Clear this campaign's prior child rows (idempotent re-seed) ────────────
  // Updates first — they hold the RESTRICT refs onto slots + articles, and
  // deleting them cascades their concerns.
  await db
    .delete(campaignUpdate)
    .where(eq(campaignUpdate.campaignId, CAMPAIGN.id))
  await db
    .delete(campaignSeason)
    .where(eq(campaignSeason.campaignId, CAMPAIGN.id))
  // A dungeon a DM scheduled into a seeded slot during local play also
  // RESTRICT-refs it (`campaignSlotDungeon.slotId`) — clear those claims (the
  // slot reverts to downtime) before the slots, or the re-seed would abort.
  await db
    .delete(campaignSlotDungeon)
    .where(
      inArray(
        campaignSlotDungeon.slotId,
        db
          .select({ id: campaignSlot.id })
          .from(campaignSlot)
          .where(eq(campaignSlot.campaignId, CAMPAIGN.id))
      )
    )
  await db.delete(campaignSlot).where(eq(campaignSlot.campaignId, CAMPAIGN.id))
  await db
    .delete(campaignArticle)
    .where(eq(campaignArticle.campaignId, CAMPAIGN.id))
  // NPC entities have no cascade from the subtype: drop the subtype rows, then
  // their substrate — scoped by campaignId so a prior run's set is fully swept.
  const priorNpcs = await db
    .select({ entityId: campaignNpc.entityId })
    .from(campaignNpc)
    .where(eq(campaignNpc.campaignId, CAMPAIGN.id))
  await db.delete(campaignNpc).where(eq(campaignNpc.campaignId, CAMPAIGN.id))
  if (priorNpcs.length > 0) {
    await db.delete(entity).where(
      inArray(
        entity.id,
        priorNpcs.map((npc) => npc.entityId)
      )
    )
  }

  // ── Clock ──────────────────────────────────────────────────────────────────
  const clockRow = {
    campaignId: CAMPAIGN.id,
    currentDay: CURRENT_DAY,
    slotTemplate: DEFAULT_SLOT_TEMPLATE,
    storyTier: 3,
    storyTierChangedAt: at(66, 12, 0),
    clockVersion: 0,
  }
  await db
    .insert(campaignClock)
    .values(clockRow)
    .onConflictDoUpdate({ target: campaignClock.campaignId, set: clockRow })

  // ── Party PCs (upsert via the shared entity+subtype writer) ────────────────
  for (const member of PARTY) {
    await insertSeedEntity(
      makeSeedCharacter({
        slug: member.slug,
        shortId: member.slug,
        name: member.name,
        pronouns: member.pronouns,
      }),
      devUserId,
      CAMPAIGN.id
    )
  }

  // ── NPCs (entity substrate + subtype, deterministic shared id) ─────────────
  await db.insert(entity).values(
    NPCS.map((npc) => ({
      id: npcEntityId(npc.key),
      shortId: `long-npc-${npc.key}`,
      name: npc.name,
    }))
  )
  await db.insert(campaignNpc).values(
    NPCS.map((npc) => ({
      entityId: npcEntityId(npc.key),
      campaignId: CAMPAIGN.id,
      arcana: npc.arcana,
      lineageKey: npc.lineageKey,
      bondTier: npc.bondTier,
      bondTierChangedAt:
        npc.bondChangedDay === null ? null : at(npc.bondChangedDay, 12, 0),
    }))
  )

  // ── Articles + seasons ─────────────────────────────────────────────────────
  await db.insert(campaignArticle).values(
    ARTICLES.map((article) => ({
      id: articleId(article.key),
      campaignId: CAMPAIGN.id,
      name: article.name,
      type: article.type,
      datedDay: article.datedDay ?? null,
      datedKind: article.datedKind ?? null,
    }))
  )
  await db.insert(campaignSeason).values(
    SEASONS.map((season) => ({
      campaignId: CAMPAIGN.id,
      day: season.day,
      label: season.label,
    }))
  )

  // ── Slots: the template materialized for every day 1..120 ──────────────────
  const slotRows = []
  for (let day = 1; day <= CURRENT_DAY; day++) {
    for (const [ordinal, entry] of DEFAULT_SLOT_TEMPLATE.entries()) {
      slotRows.push({
        id: slotId(day, ordinal),
        campaignId: CAMPAIGN.id,
        day,
        ordinal,
        label: entry.label,
      })
    }
  }
  for (let i = 0; i < slotRows.length; i += CHUNK) {
    await db.insert(campaignSlot).values(slotRows.slice(i, i + CHUNK))
  }

  // ── The update stream (the volume) ─────────────────────────────────────────
  const { updates, concerns } = buildUpdates()
  for (let i = 0; i < updates.length; i += CHUNK) {
    await db.insert(campaignUpdate).values(updates.slice(i, i + CHUNK))
  }
  for (let i = 0; i < concerns.length; i += CHUNK) {
    await db.insert(campaignUpdateConcern).values(concerns.slice(i, i + CHUNK))
  }

  console.log(
    `  ✓ long campaign "${CAMPAIGN.name}" (/campaigns/${CAMPAIGN.shortId}/chronicle) — ` +
      `Day ${CURRENT_DAY}, ${slotRows.length} slots, ${updates.length} updates, ${concerns.length} concerns`
  )
}

const slotId = (day: number, ordinal: number): string =>
  `seed-slot-${pad3(day)}-${ordinal}`

interface UpdateRow {
  id: string
  campaignId: string
  day: number
  primaryKind: ParticipantKind | null
  primaryId: string | null
  body: string
  category: UpdateCategory | null
  slotId: string | null
  resolvesArticleId: string | null
  authoredAt: Date
  updatedAt: Date
}

interface ConcernRow {
  updateId: string
  participantKind: ParticipantKind
  participantId: string
}

/**
 * Builds the whole update stream deterministically. Per day: downtime
 * activities (some substantive, some Idle-filled as a tied batch), a handful
 * of world updates (the antagonist concerned every day for filter depth), a
 * montage burst on montage days, and any ⚑ deadline marker.
 */
function buildUpdates(): { updates: UpdateRow[]; concerns: ConcernRow[] } {
  const updates: UpdateRow[] = []
  const concerns: ConcernRow[] = []
  const markerByDay = new Map<number, string>(
    MARKERS.map((marker) => [marker.day, marker.articleKey])
  )

  for (let day = 1; day <= CURRENT_DAY; day++) {
    let seq = 0
    const add = (fields: {
      authoredAt: Date
      primaryKind?: ParticipantKind | null
      primaryId?: string | null
      body?: string
      category?: UpdateCategory | null
      slotId?: string | null
      resolvesArticleId?: string | null
    }): string => {
      const id = `seed-upd-${pad3(day)}-${pad3(seq++)}`
      updates.push({
        id,
        campaignId: CAMPAIGN.id,
        day,
        primaryKind: fields.primaryKind ?? null,
        primaryId: fields.primaryId ?? null,
        body: fields.body ?? "",
        category: fields.category ?? null,
        slotId: fields.slotId ?? null,
        resolvesArticleId: fields.resolvesArticleId ?? null,
        authoredAt: fields.authoredAt,
        updatedAt: fields.authoredAt,
      })
      return id
    }
    const concern = (
      updateId: string,
      kind: ParticipantKind,
      id: string
    ): void => {
      concerns.push({ updateId, participantKind: kind, participantId: id })
    }

    // Downtime: one row per (slot, PC). ~2/3 substantive, the rest Idle-filled
    // at a single tied time per slot (the end-of-day fill batch).
    for (const ordinal of [0, 1]) {
      const baseHour = ordinal === 0 ? 9 : 19
      for (let p = 0; p < PARTY.length; p++) {
        const pcId = partyEntityId(PARTY[p]!.slug)
        const substantive = (day + ordinal + p) % 3 !== 0
        if (!substantive) {
          add({
            primaryKind: "character",
            primaryId: pcId,
            category: "idle",
            slotId: slotId(day, ordinal),
            authoredAt: at(day, baseHour + 2, 30),
          })
          continue
        }
        const category =
          NONIDLE_CATEGORIES[(day + p + ordinal) % NONIDLE_CATEGORIES.length]!
        const bodies = DOWNTIME_BODIES[category]
        const uid = add({
          primaryKind: "character",
          primaryId: pcId,
          body: bodies[(day + p) % bodies.length]!,
          category,
          slotId: slotId(day, ordinal),
          authoredAt: at(day, baseHour, p * 15),
        })
        if (category === "collaborator") {
          concern(uid, "npc", npcEntityId(NPCS[(day + p) % NPCS.length]!.key))
        }
      }
    }

    // World updates: the antagonist is concerned on the first one every day so
    // an `about=npc:hollow-king` filter stays full across every bucket.
    const worldCount = 4 + (day % 4)
    for (let w = 0; w < worldCount; w++) {
      const primary = worldPrimary(day, w)
      const uid = add({
        primaryKind: primary?.kind ?? null,
        primaryId: primary?.id ?? null,
        body: WORLD_BODIES[(day + w) % WORLD_BODIES.length]!,
        authoredAt: at(day, 13 + w, (day % 6) * 7),
      })
      if (w === 0) concern(uid, "npc", npcEntityId("hollow-king"))
      if (w % 3 === 1) concern(uid, "article", articleId("ashen-court"))
    }

    // Montage burst: a same-`authoredAt` batch of world updates.
    const montage = MONTAGES[day]
    if (montage) {
      const authoredAt = at(day, montage.hour, 0)
      for (let m = 0; m < montage.size; m++) {
        const uid = add({
          primaryKind: m % 4 === 0 ? "npc" : null,
          primaryId:
            m % 4 === 0 ? npcEntityId(NPCS[m % NPCS.length]!.key) : null,
          body: `The world turned during ${montage.label} — moment ${m + 1}.`,
          authoredAt,
        })
        if (m % 5 === 0) concern(uid, "npc", npcEntityId("hollow-king"))
      }
    }

    // ⚑ deadline resolution marker (a world update binding an article).
    const markerArticle = markerByDay.get(day)
    if (markerArticle) {
      add({
        body: `Resolved: ${ARTICLES.find((article) => article.key === markerArticle)!.name}.`,
        resolvesArticleId: articleId(markerArticle),
        authoredAt: at(day, 21, 0),
      })
    }
  }

  return { updates, concerns }
}

/** The rotating primary for a world update — null ("the world"), an NPC, an
 *  article (one of the plain first six), or a party character. */
function worldPrimary(
  day: number,
  w: number
): { kind: ParticipantKind; id: string } | null {
  switch ((day + w) % 4) {
    case 0:
      return null
    case 1:
      return {
        kind: "npc",
        id: npcEntityId(NPCS[(day + w) % NPCS.length]!.key),
      }
    case 2:
      return { kind: "article", id: articleId(ARTICLES[(day + w) % 6]!.key) }
    default:
      return {
        kind: "character",
        id: partyEntityId(PARTY[(day + w) % PARTY.length]!.slug),
      }
  }
}
