"use server"

import { addOccupant, isRosterFullyPlaced } from "@workspace/game/engine"
import {
  err,
  ok,
  type CombatantSetup,
  type MapInstanceState,
  type Result,
} from "@workspace/game/foundation"

import { revalidateDungeon } from "@/lib/actions/dungeon/revalidate"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { type WriteExecutor } from "@/lib/db/client"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { loadLiveEncounterForCampaign } from "@/lib/db/queries/load-encounter"
import { loadMapInstanceById } from "@/lib/db/queries/map-instance"
import { createEncounter } from "@/lib/db/writes/encounter"
import { guardMany } from "@/lib/db/writes/guard-many"
import { saveMapInstanceState } from "@/lib/db/writes/map-instance"
import { createCombatSession, reduceCombatSession } from "@/lib/game-engine"
import {
  publishDungeonInstancePing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import {
  StartDungeonEncounterSchema,
  type StartDungeonEncounterError,
  type StartDungeonEncounterInput,
} from "./start-dungeon-encounter.schema"

/**
 * **Start combat on the dungeon** (UNN-467; ADR — *Combat on the dungeon*,
 * *Atomicity*): mint an already-`live` encounter on the **delve's own** Map
 * Instance — no copy, no carved sub-graph — and place the staged enemies onto it,
 * atomically via one {@link guardMany} transaction (the Instance enemy-token write
 * and the encounter insert commit together or not at all). Combat then runs over
 * the same Instance the delve uses, so the whole map is in play.
 *
 * The PC combatants reuse their `characterId` as the combatant `id`, so each PC's
 * **exploration token** (already on the Instance, keyed by `characterId`) *is* its
 * combat token — no duplicate, no re-placement, and PC tokens persist back into
 * exploration when the fight ends. Enemies get fresh ids + new occupancy tokens
 * (exploration has none to collide with). The session is built fresh and reduced
 * through `startCombat` so advantage/first side are recorded exactly as the
 * standalone start-combat flow does.
 *
 * Guards (read-then-act at the boundary, before the transaction): `requireCampaignDM`;
 * the delve must be `active`; the **one-live-encounter-per-campaign** rule (the
 * shipped guard) rejects start when the campaign already holds the live slot; and
 * the authoritative `isRosterFullyPlaced` check (the Setup UI gates it client-side
 * as an affordance). Returns the new encounter's public `shortId` so the console
 * can re-fork into its combat phase.
 */
export async function startDungeonEncounterAction(
  input: StartDungeonEncounterInput
): Promise<Result<{ shortId: string }, StartDungeonEncounterError>> {
  const parsed = StartDungeonEncounterSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const {
    dungeonId,
    expectedInstanceVersion,
    name,
    advantage,
    firstSide,
    partyCharacterIds,
    enemies,
  } = parsed.data

  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  if (dungeon.status !== "active") return err("delve-not-active")

  // One-live-encounter-per-campaign (UNN-302): mirror `applyStartCombat`'s guard
  // so a delve can't open a fight while the campaign already has one running
  // (here or on a standalone encounter).
  const live = await loadLiveEncounterForCampaign(dungeon.campaignId)
  if (live) return err("campaign-already-has-live-encounter")

  const instance = await loadMapInstanceById(dungeon.mapInstanceId)
  if (instance === null) return err("map-instance-not-found")

  // PC combatant id === characterId (ADR shared-row keying): the delve token at
  // `occupancy[characterId]` doubles as the combat token, so no PC token is
  // re-added — its zone is read straight off the Instance.
  const pcSetups: CombatantSetup[] = partyCharacterIds.map((characterId) => ({
    id: characterId,
    side: "players",
    ref: { kind: "pc", characterId },
    zoneId: instance.state.occupancy[characterId]?.zoneId ?? "",
  }))
  const enemySetups: CombatantSetup[] = enemies.flatMap(
    ({ enemyKey, zoneId, count }) =>
      Array.from({ length: count }, () => ({
        id: crypto.randomUUID(),
        side: "enemies" as const,
        ref: { kind: "catalog-enemy" as const, enemyKey },
        zoneId,
      }))
  )
  const setups = [...pcSetups, ...enemySetups]

  // Authoritative placement gate (the client mirrors it): once zones exist every
  // combatant must stand in one. PCs inherit their delve zone; only an unplaced
  // enemy (or a party member whose token is somehow gone) can fail.
  if (!isRosterFullyPlaced(setups, instance.state.geometry.zones)) {
    return err("encounter-has-unplaced-combatants")
  }

  const session = reduceCombatSession(createCombatSession(setups), {
    kind: "startCombat",
    advantage,
    firstSide,
  })

  // Only the enemy tokens are new — fold them onto the existing Instance state.
  const nextInstance: MapInstanceState = enemySetups.reduce(
    (state, setup) =>
      addOccupant(state, setup.id!, {
        zoneId: setup.zoneId,
        engagement: { status: "free" },
      }),
    instance.state
  )

  const result = await guardMany<
    { shortId: string; instanceVersion: number },
    StartDungeonEncounterError
  >(async (tx: WriteExecutor) => {
    const inst = await saveMapInstanceState(
      tx,
      dungeon.mapInstanceId,
      nextInstance,
      expectedInstanceVersion
    )
    if (!inst.ok) return inst
    const created = await createEncounter(
      {
        campaignId: dungeon.campaignId,
        name,
        session,
        mapInstanceId: dungeon.mapInstanceId,
        status: "live",
      },
      tx
    )
    return ok({ shortId: created.shortId, instanceVersion: inst.value.version })
  })
  if (!result.ok) return result

  // The encounter ping wakes the DM combat console + the encounter watch; the
  // dungeon-Instance ping wakes the fog player view (its dungeon channel hears the
  // shared Instance bump, refetches, and sees the new `combat` linkage — UNN-468).
  publishEncounterPing(result.value.shortId, { version: 0, status: "live" })
  publishDungeonInstancePing(dungeon.shortId, result.value.instanceVersion)
  revalidateDungeon(dungeon)
  return ok({ shortId: result.value.shortId })
}
