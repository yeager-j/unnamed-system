import "server-only"

import { revalidatePath } from "next/cache"

import type { StampAccumulator } from "@workspace/headcanon"
import { throwMutationContention } from "@workspace/headcanon/drizzle"
import {
  acceptMutation,
  allowMutation,
  allowMutationScreening,
  denyMutation,
  refuseMutation,
} from "@workspace/headcanon/next/server"

import {
  mapGeometryEvents,
  mapRename,
  reduceMapGeometryEvents,
} from "@/domain/map/commit/protocol"
import type { ShowtimeMutationCommand } from "@/lib/actions/mutations/environment"
import type { Actor } from "@/lib/auth/actor"
import { mapAxis } from "@/lib/db/axes"
import type { WriteExecutor } from "@/lib/db/client"
import { loadMapRowById } from "@/lib/db/queries/load-map"
import type { MapRow } from "@/lib/db/schema/map"
import { renameMap, saveMapGeometry } from "@/lib/db/writes/map"
import { stageMapPath, stageMapsPath } from "@/lib/paths"

type MapMutation = typeof mapRename | typeof mapGeometryEvents
type MapMutationCommand<Mutation extends MapMutation> = ShowtimeMutationCommand<
  Mutation,
  { readonly shortId: string },
  MapRow
>

async function admitMap(executor: WriteExecutor, actor: Actor, mapId: string) {
  const map = await loadMapRowById(mapId, executor)
  return map && map.userId === actor.userId
    ? allowMutation(map)
    : denyMutation()
}

async function screenMap(executor: WriteExecutor, actor: Actor, mapId: string) {
  const admitted = await admitMap(executor, actor, mapId)
  return admitted.kind === "allowed"
    ? allowMutationScreening({ shortId: admitted.evidence.shortId })
    : admitted
}

function recordStoredMap(
  saved: Awaited<ReturnType<typeof renameMap>>,
  mapId: string,
  stamp: StampAccumulator
): void {
  if (!saved.ok) throwMutationContention()
  stamp.record(mapAxis(mapId), saved.value.version)
}

function revalidateMap(shortId: string, includeList: boolean): void {
  revalidatePath(stageMapPath(shortId))
  if (includeList) revalidatePath(stageMapsPath())
}

export const mapRenameCommand = {
  screen: ({ executor, actor, args }) => screenMap(executor, actor, args.mapId),
  admit: ({ tx, actor, args }) => admitMap(tx, actor, args.mapId),
  async execute({ tx, args, evidence, stamp }) {
    const saved = await renameMap(evidence.id, args.name, evidence.version, tx)
    recordStoredMap(saved, evidence.id, stamp)
    return acceptMutation()
  },
  finalizeAccepted({ projection }) {
    revalidateMap(projection.shortId, true)
  },
} satisfies MapMutationCommand<typeof mapRename>

export const mapGeometryEventsCommand = {
  screen: ({ executor, actor, args }) => screenMap(executor, actor, args.mapId),
  admit: ({ tx, actor, args }) => admitMap(tx, actor, args.mapId),
  async execute({ tx, args, evidence, stamp }) {
    let geometry
    try {
      geometry = reduceMapGeometryEvents(evidence.geometry, args.events)
    } catch {
      return refuseMutation("map-event-refused" as const)
    }
    const saved = await saveMapGeometry(
      evidence.id,
      geometry,
      evidence.version,
      tx
    )
    recordStoredMap(saved, evidence.id, stamp)
    return acceptMutation()
  },
  finalizeAccepted({ projection }) {
    revalidateMap(projection.shortId, false)
  },
} satisfies MapMutationCommand<typeof mapGeometryEvents>
