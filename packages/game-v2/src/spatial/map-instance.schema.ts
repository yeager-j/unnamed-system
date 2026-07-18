import { z } from "zod/v4"

import { engagementSchema } from "@workspace/game-v2/kernel/vocab/engagement"
import { zoneEnchantmentSchema } from "@workspace/game-v2/mechanics/zone-enchantment.schema"

import { mapGeometrySchema } from "./geometry.schema"

/**
 * The **Map-Instance** state — the per-run spatial truth the Dungeon Map feature
 * layers combat and exploration over. Re-declared in v2 as pure Zod (D32). Persisted
 * as one versioned jsonb blob on the `mapInstance` row; the `version` is a row
 * column, never part of this shape. `reduceMapInstance` (PR2) is the sole writer.
 *
 * It carries the snapshotted authored {@link import("./geometry.schema").MapGeometry}
 * plus the runtime overlays: token occupancy, the {@link RevealState} fog overlay,
 * and the Bard's single Zone {@link import("@workspace/game-v2/mechanics/zone-enchantment.schema").ZoneEnchantment}.
 */

/**
 * One occupancy token — a combatant's spatial presence: where it stands (a bare
 * `zoneId`) and who it's engaged with. The token stores a **bare `zoneId` string**,
 * not a `Position` component — the combat-side loader wraps it into `Position` for
 * the read-bag (so spatial owns the *fact* of placement without naming the
 * *component*). Keyed in {@link MapInstanceState.occupancy} **opaquely**: by the
 * combatant's `participantId` during combat, by its `characterId` during
 * exploration (so the delve roster derives from occupancy directly).
 */
export const mapTokenSchema = z.object({
  zoneId: z.string(),
  engagement: engagementSchema,
})
export type MapToken = z.infer<typeof mapTokenSchema>

/**
 * The runtime fog overlay on top of the snapshotted, immutable connection
 * `hidden`/`locked` flags. All three are sets-as-arrays keyed by geometry id:
 *
 * - `revealedZoneIds` — Zones the party has discovered. The `move → reveal` rule
 *   adds the entered Zone; the DM may also reveal/hide a Zone manually.
 * - `revealedConnectionIds` — **hidden** connections the DM has manually surfaced.
 *   A non-hidden connection needs no entry: it is a *known-exit silhouette* the
 *   moment one of its endpoints is revealed (derived, never stored here).
 * - `unlockedConnectionIds` — **locked** connections the DM has opened; a locked
 *   connection shows as a known-exit but blocks movement until its id is here.
 */
export const revealStateSchema = z.object({
  revealedZoneIds: z.array(z.string()).default([]),
  revealedConnectionIds: z.array(z.string()).default([]),
  unlockedConnectionIds: z.array(z.string()).default([]),
})
export type RevealState = z.infer<typeof revealStateSchema>

/**
 * One Zone's **provenance** — where the Zone came from, which decides two predicates
 * an expedition needs (procedural-dungeons tech design D4/D5):
 *
 * - **`authored`** — snapshotted from the seed (or a grafted static) Map. Only an
 *   authored Zone's reveal **folds** back to the Region's `staticReveal` at
 *   expedition finish (knowledge about a stable place is worth carrying forward);
 *   generated and manual space dies with the run. Stamped once at expedition start
 *   by `withAuthoredProvenance` over the fresh snapshot.
 * - **`generated`** — minted mid-run by the procedural roller (P3). The only source
 *   `retractZone` (P3) may target — an authored or manual Zone is never retracted.
 * - **`manual`** — DM hand-added mid-run via `editGeometry` (or the direct `addZone`
 *   event); stamped in the reducer at that boundary. Visit-scoped like generated:
 *   permanent space is authored on the seed Map, not on the run.
 *
 * **Missing provenance ⇒ treated as non-authored** — the fold fails safe (an
 * under-fold, never an over-fold: an unstamped Zone never leaks into the Region's
 * chart).
 *
 * P3 (UNN-590) grew the row with the generation facts:
 *
 * - **`templateKey?`** — the template this Zone was minted from (generated) or
 *   bound to (authored, stamped from the authored `mapZoneSchema.templateKey` at
 *   expedition start). DM-only; never serializes to the player snapshot.
 * - **`depth`** — distance from the nearest starting Zone (multi-source BFS at
 *   expedition start for authored space; parent + 1 at mint for generated space).
 *   `.default(0)` heals pre-P3 blobs on read; authored depths are recomputed at
 *   every start, so a defaulted 0 is only transiently wrong. Manual Zones stamp 0
 *   (unused — manual space never draws or retracts).
 *
 * P5 adds the DM-only `manifest?` (staged content) — deferred with its consumer.
 */
export const zoneProvenanceSchema = z.object({
  source: z.enum(["authored", "generated", "manual"]),
  templateKey: z.string().optional(),
  depth: z.number().int().nonnegative().default(0),
})
export type ZoneProvenance = z.infer<typeof zoneProvenanceSchema>

/**
 * A stub's stored rim anchor — the wall of its parent Zone the stub opens through
 * plus the along-wall coordinate normalized to that edge (0..1). **Stored, not
 * derived** (D10): an authored exit's anchor derives from *both* endpoint
 * footprints, which a stub cannot supply (it has no far Zone — the shipped
 * derivation would silently fall back to `{side:"n", offset:0.5}` and give the
 * stub away). Computed once at sprout from the parent's footprint + the stub's
 * bearing, projected verbatim into the snapshot, and restored byte-identical on
 * retract.
 */
export const stubAnchorSchema = z.object({
  side: z.enum(["n", "e", "s", "w"]),
  offset: z.number().min(0).max(1),
})
export type StubAnchor = z.infer<typeof stubAnchorSchema>

/**
 * One **stub** — an open generated exit hanging off `zoneId`, the expandable
 * frontier of procedural space (D4). `bearing` is the outward direction the mint
 * will grow along (radians, canvas convention: x right, y down); `anchor` is the
 * stored rim placement ({@link stubAnchorSchema}). The stub's `id` becomes the
 * minted connection's id at expansion (exit-id continuity, D10), and the player
 * snapshot projects a stub as a {@link import("../visibility/spatial-snapshot").SnapshotExit}
 * byte-shape-identical to an authored unexplored exit.
 */
export const generationStubSchema = z.object({
  id: z.string(),
  zoneId: z.string(),
  bearing: z.number(),
  anchor: stubAnchorSchema,
})
export type GenerationStub = z.infer<typeof generationStubSchema>

/**
 * The Instance's **generation** slice (procedural-dungeons tech design D4) — a
 * sibling of `occupancy`/`reveal`, carrying the per-run generation bookkeeping the
 * expedition lifecycle reads:
 *
 * - **`zones`** — provenance keyed by Zone id (the {@link ZoneProvenance} above).
 * - **`stubs`** — open generated exits keyed by stub id ({@link generationStubSchema}),
 *   sprouted at expedition start and by every mint; consumed by mint/closure/dead-end.
 * - **`connections`** — provenance for generation-minted connections, keyed by
 *   connection id and stamped by both `mintZone` and `closeLoop`. A deliberate
 *   one-record addition to D4's published shape (D6's ADR-0001 rider): a loop
 *   closure between two *authored* Zones has no generated endpoint, so future
 *   provenance consumers can't otherwise identify it. Retract and zone-deletion
 *   prune it.
 * - **`grafts`** — keyed by *source* mapId, the pages each grafted static Map
 *   contributed (P6 portal grafting). It is **empty until P6**, but present now so
 *   the `staticReveal` fold's zone→source-Map attribution signature is stable: the
 *   fold reads `grafts` to decide which Map a folded Zone attributes to, and seed
 *   pages (claimed by no graft) attribute to the seed Map.
 *
 * Every field `.default()`s empty so an old stored blob (no `generation` key, or a
 * pre-P3 one without `stubs`/`connections`) heals on read — the file's own
 * graceful-boundary doctrine.
 */
export const generationStateSchema = z.object({
  zones: z.record(z.string(), zoneProvenanceSchema).default({}),
  stubs: z.record(z.string(), generationStubSchema).default({}),
  connections: z
    .record(z.string(), z.object({ source: z.literal("generated") }))
    .default({}),
  grafts: z
    .record(z.string(), z.object({ pageIds: z.array(z.string()).default([]) }))
    .default({}),
})
export type GenerationState = z.infer<typeof generationStateSchema>

/**
 * The Map-Instance's jsonb `state`. `geometry` is the snapshot of the Map's authored
 * geometry; `occupancy` maps a token key to its {@link MapToken}; `reveal` is the
 * runtime fog overlay; `enchantment` is the Bard's single active Zone Enchantment (a
 * nullable singleton — a second Enchant overwrites); `generation` is the per-run
 * provenance/graft bookkeeping ({@link GenerationState}). `lastMovedTokenKey` is the
 * token that most recently moved or was placed (UNN-586) — the watch's
 * follow-the-party page hint (D3); an opaque dual-lifecycle key that may dangle
 * after a combat prune, so readers resolve it defensively and never trust it raw.
 * Every field `.default()`s empty so a freshly-minted Instance parses.
 */
export const mapInstanceStateSchema = z.object({
  geometry: mapGeometrySchema.default(() => mapGeometrySchema.parse({})),
  occupancy: z.record(z.string(), mapTokenSchema).default({}),
  enchantment: zoneEnchantmentSchema.nullable().default(null),
  reveal: revealStateSchema.default({
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  }),
  generation: generationStateSchema.default({
    zones: {},
    stubs: {},
    connections: {},
    grafts: {},
  }),
  lastMovedTokenKey: z.string().nullable().default(null),
})
export type MapInstanceState = z.infer<typeof mapInstanceStateSchema>
