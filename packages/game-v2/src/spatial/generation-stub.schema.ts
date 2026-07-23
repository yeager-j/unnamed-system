import { z } from "zod/v4"

/**
 * The **stub primitive** — extracted to a neutral module (UNN-642) because two
 * sibling aggregates carry the same shape as authority-preserving payload:
 * the Instance's `generation.stubs` (the live frontier) and the Dungeon
 * ledger's `MintRecord.stub` (the recorded pre-mint payload `retractZone`
 * restores byte-identical). Neither aggregate schema imports the other;
 * both import this.
 */

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
