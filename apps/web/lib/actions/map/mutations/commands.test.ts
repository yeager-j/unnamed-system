import { beforeEach, describe, expect, it, vi } from "vitest"

import { mapGeometrySchema } from "@workspace/game-v2/spatial"
import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import { mapAxis } from "@/lib/db/axes"
import type { MapRow } from "@/lib/db/schema/map"

const loadMapRowById = vi.fn()
const renameMap = vi.fn()
const saveMapGeometry = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/queries/load-map", () => ({
  loadMapRowById: (...args: unknown[]) => loadMapRowById(...args),
}))
vi.mock("@/lib/db/writes/map", () => ({
  renameMap: (...args: unknown[]) => renameMap(...args),
  saveMapGeometry: (...args: unknown[]) => saveMapGeometry(...args),
}))

const { mapGeometryEventsCommand, mapRenameCommand } =
  await import("./commands")

const actor = { userId: "user-1", email: "user@example.com" }
const mutationId = "00000000-0000-4000-8000-000000000001"
const map = {
  id: "map-1",
  shortId: "map-short",
  userId: actor.userId,
  name: "Atlas",
  geometry: mapGeometrySchema.parse({}),
  version: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies MapRow
const tx = {} as Parameters<typeof mapGeometryEventsCommand.execute>[0]["tx"]

beforeEach(() => {
  vi.clearAllMocks()
  loadMapRowById.mockResolvedValue(map)
  renameMap.mockResolvedValue(ok({ version: 4 }))
  saveMapGeometry.mockResolvedValue(ok({ version: 4 }))
})

describe("map mutation commands", () => {
  it("screens and rechecks ownership inside the authority attempt", async () => {
    loadMapRowById.mockResolvedValueOnce({ ...map, userId: "other" })

    await expect(
      mapRenameCommand.screen({
        executor: tx,
        actor,
        args: { mapId: map.id, name: "Meridian" },
      })
    ).resolves.toEqual({ kind: "denied" })

    loadMapRowById.mockResolvedValueOnce({ ...map, userId: "other" })
    await expect(
      mapRenameCommand.admit({
        tx,
        actor,
        args: { mapId: map.id, name: "Meridian" },
      })
    ).resolves.toEqual({ kind: "denied" })
    expect(loadMapRowById).toHaveBeenLastCalledWith(map.id, tx)
  })

  it("applies geometry intents to the attempt's current row and stamps it", async () => {
    const stamp = createStampAccumulator()
    const args = {
      mapId: map.id,
      events: [
        {
          kind: "addZone" as const,
          id: "z1",
          pageId: "default",
          position: { x: 1, y: 2 },
        },
      ],
    }

    const decision = await mapGeometryEventsCommand.execute({
      tx,
      actor,
      args,
      evidence: map,
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(saveMapGeometry).toHaveBeenCalledWith(
      map.id,
      expect.objectContaining({
        zones: expect.objectContaining({ z1: expect.any(Object) }),
      }),
      map.version,
      tx
    )
    expect(stamp.accepted().revisions[mapAxis(map.id)]).toBe(4)
  })

  it("refuses an event invalidated by current state without writing", async () => {
    const stamp = createStampAccumulator()
    const decision = await mapGeometryEventsCommand.execute({
      tx,
      actor,
      args: {
        mapId: map.id,
        events: [{ kind: "renameZone", zoneId: "missing", name: "Gone" }],
      },
      evidence: map,
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "refused", error: "map-event-refused" })
    expect(saveMapGeometry).not.toHaveBeenCalled()
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("turns a lost row guard into whole-command contention", async () => {
    renameMap.mockResolvedValue(err("stale"))

    await expect(
      mapRenameCommand.execute({
        tx,
        actor,
        args: { mapId: map.id, name: "Meridian" },
        evidence: map,
        stamp: createStampAccumulator(),
        mutationId,
      })
    ).rejects.toBeInstanceOf(MutationContentionError)
  })
})
