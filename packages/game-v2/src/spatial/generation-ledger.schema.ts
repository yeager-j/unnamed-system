import { z } from "zod/v4"

import { generationStubSchema } from "./generation-stub.schema"

/**
 * The **draw ledger** — the visit-lifetime generation bookkeeping on
 * `DungeonState` (procedural-dungeons tech design D4, UNN-590), brother of the
 * turn counter. Everything here dies with the expedition; nothing folds to the
 * Region. Zod-only, importing only the neutral stub primitive — `dungeon.schema.ts`
 * composes it and the ledger events (`dungeon-event.ts`) carry its shapes as
 * fully resolved payloads (D1).
 *
 * The one law that spans every field: **`streamCursors` only ever advance.**
 * `revertMint` replays a mint's recorded inverse but never rewinds a cursor — a
 * re-expand after retract consumes fresh stream positions and rolls a *different*
 * result; without the cursor rule, pure-function determinism would re-roll the
 * identical zone and the escape hatch couldn't escape.
 */

/**
 * One **site declaration** — "template X should appear within K qualifying
 * expansions past depth D" (PRD objectives; scheduling lands P4). `sequence` is
 * creation order: the due-collision priority (D6) and the mint-record referent.
 * `secretIndex` (N ∈ 1..k, rolled at declaration) is the draw's hidden landing
 * slot — never serialized to any player surface, and the console shows only
 * eligibility, never N.
 */
export const declarationSchema = z.object({
  id: z.string(),
  sequence: z.number().int().nonnegative(),
  templateKey: z.string(),
  minDepth: z.number().int().nonnegative().default(0),
  k: z.number().int().positive(),
  secretIndex: z.number().int().positive(),
  qualifyingCount: z.number().int().nonnegative().default(0),
  resolvedZoneId: z.string().optional(),
})
export type Declaration = z.infer<typeof declarationSchema>

/** One recorded effect a mint had on a declaration — the unit `revertMint` replays. */
export const mintEffectSchema = z.object({
  declarationId: z.string(),
  incremented: z.boolean(),
  resolved: z.boolean(),
})
export type MintEffect = z.infer<typeof mintEffectSchema>

/**
 * The per-mint ledger record — the exact inverse `revertMint` replays (D4).
 * `unique` records whether the mint entered `mintedUniqueKeys` (one field beyond
 * D4's published shape, so revert is pure replay rather than inference), and
 * `effects` records which declarations the mint incremented/resolved. **This is
 * what makes the PRD's any-unrevealed-leaf, non-LIFO retract sound**: declarations
 * created after the mint — or resolved by later mints — must be untouched, and
 * "decrement every declaration the mint incremented" is unrecoverable from
 * aggregate counts.
 *
 * UNN-642 grew the record with the retract inverse's spatial half, on the same
 * pure-replay doctrine:
 *
 * - **`stub`** — the consumed pre-mint stub, verbatim. `retractZone` restores it
 *   byte-identical (D10: id, zoneId, bearing, stored anchor); the bearing is
 *   otherwise unrecoverable once the mint deletes the stub (layout may have
 *   nudged the placed zone off the pure bearing line).
 * - **`childStubIds`** — the stubs the mint sprouted. The doc-literal leaf rule
 *   ("none of its stubs consumed") is checkable only against this list: a
 *   dead-ended child vanishes from `generation.stubs` without any other trace.
 *
 * Both fields are required: nothing emitted `recordMint` before UNN-642, so no
 * stored blob carries a record without them.
 */
export const mintRecordSchema = z.object({
  sequence: z.number().int().nonnegative(),
  templateKey: z.string(),
  unique: z.boolean(),
  stub: generationStubSchema,
  childStubIds: z.array(z.string()),
  effects: z.array(mintEffectSchema).default([]),
})
export type MintRecord = z.infer<typeof mintRecordSchema>

/**
 * The ledger itself. `seed` is minted once at expedition start (`""` on ordinary
 * dungeons — a dungeon row that never generates keeps the zero ledger);
 * `streamCursors` are the per-purpose RNG positions (see `generation/rng.ts`),
 * bumped by the events that consume rolls and **never rewound**;
 * `mintedUniqueKeys` enforces one-per-expedition uniqueness (seeded from bound
 * authored `unique` templates at start — the ledger law's fourth case);
 * `declarations` + `mints` are per {@link declarationSchema} / {@link mintRecordSchema}
 * (`mints` keyed by minted zoneId). Every field `.default()`s so a pre-P3 blob
 * (no `generation` key) heals on read.
 */
export const generationLedgerSchema = z.object({
  seed: z.string().default(""),
  streamCursors: z
    .record(z.string(), z.number().int().nonnegative())
    .default({}),
  declarations: z.array(declarationSchema).default([]),
  mintedUniqueKeys: z.array(z.string()).default([]),
  mints: z.record(z.string(), mintRecordSchema).default({}),
})
export type GenerationLedger = z.infer<typeof generationLedgerSchema>

/** The zero ledger — what a fresh or pre-P3 dungeon blob parses to. */
export const emptyGenerationLedger = (): GenerationLedger =>
  generationLedgerSchema.parse({})
