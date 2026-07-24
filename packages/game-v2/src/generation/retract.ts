import type { DungeonEvent } from "@workspace/game-v2/spatial/dungeon-event"
import type { GenerationLedger } from "@workspace/game-v2/spatial/generation-ledger.schema"
import type { MapInstanceEvent } from "@workspace/game-v2/spatial/map-instance-event"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import { err, ok, type Result } from "@workspace/result"

/**
 * The **retract builder** (procedural-dungeons tech design D4/D8, UNN-642) —
 * the DM's escape hatch for a mis-rolled room. Emits the paired inverse of a
 * mint: `retractZone` (instance side — deletes the zone, restores the consumed
 * stub **byte-identical** from the mint record, D10) + `revertMint` (dungeon
 * side — replays the recorded ledger inverse; **never rewinds cursors**, so a
 * re-expand rolls a different result). No turn cost: retract is the escape
 * hatch, not play.
 *
 * Legality is split by where the facts live: everything checkable from the
 * instance state + ledger is refused **here** (one authority for retract
 * grammar); the executor adds the DB facts (dungeon status active, no live
 * encounter on the instance).
 *
 * The leaf rule is doc-literal **strict** (settled 2026-07-23): every recorded
 * child stub must still be open — a child consumed by a mint, a closure, *or a
 * dead end* blocks retract — and no connection may touch the zone besides its
 * entry (which also refuses a closure that landed *on* the zone from elsewhere;
 * the reducer's retract arm deletes every touching connection, so a looser rule
 * would destroy another stub's consumed exit).
 */

export type RetractError =
  | "unknown-zone"
  | "not-generated"
  /** Generated provenance but no surviving mint record — corrupt state (the
   *  record is created with the mint and deleted only by revert). */
  | "no-mint-record"
  | "revealed"
  | "occupied"
  | "not-leaf"

export interface RetractionDeps {
  instanceState: MapInstanceState
  ledger: GenerationLedger
  zoneId: string
}

export function buildRetraction(
  deps: RetractionDeps
): Result<
  { instanceEvents: MapInstanceEvent[]; dungeonEvents: DungeonEvent[] },
  RetractError
> {
  const { instanceState, ledger, zoneId } = deps

  const zone = instanceState.geometry.zones[zoneId]
  if (zone === undefined) return err("unknown-zone")
  if (instanceState.generation.zones[zoneId]?.source !== "generated") {
    return err("not-generated")
  }
  const record = ledger.mints[zoneId]
  if (record === undefined) return err("no-mint-record")

  if (instanceState.reveal.revealedZoneIds.includes(zoneId)) {
    return err("revealed")
  }
  // Occupancy keys are dual-lifecycle (characterIds in exploration,
  // participantIds in combat) — one check covers both.
  const occupied = Object.values(instanceState.occupancy).some(
    (token) => token.zoneId === zoneId
  )
  if (occupied) return err("occupied")

  // Strict leaf, half one: every sprouted child stub is still open.
  const childOpen = record.childStubIds.every(
    (childId) => instanceState.generation.stubs[childId] !== undefined
  )
  if (!childOpen) return err("not-leaf")
  // Strict leaf, half two: only the entry connection (id := the consumed
  // stub's id, exit-id continuity) touches the zone.
  const strayConnection = Object.values(
    instanceState.geometry.connections
  ).some(
    (connection) =>
      connection.id !== record.stub.id &&
      (connection.fromZoneId === zoneId || connection.toZoneId === zoneId)
  )
  if (strayConnection) return err("not-leaf")

  return ok({
    instanceEvents: [
      { kind: "retractZone", zoneId, restoredStub: record.stub },
    ],
    dungeonEvents: [{ kind: "revertMint", zoneId }],
  })
}
