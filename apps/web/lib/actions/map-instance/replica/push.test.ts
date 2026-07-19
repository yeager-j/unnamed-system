import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { MapInstancePushContext } from "./processor"
import { pushMapInstanceMutationAction } from "./push"

const authorizeCampaignDMForMapInstance = vi.fn()
const processor = vi.fn()
const publishEncounterInstancePing = vi.fn()
const publishDungeonInstancePing = vi.fn()
const revalidateEncounter = vi.fn()
const revalidateDungeon = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  authorizeCampaignDMForMapInstance: (id: string) =>
    authorizeCampaignDMForMapInstance(id),
}))
vi.mock("./processor", () => ({
  createMapInstancePushProcessor: () => processor,
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishEncounterInstancePing: (shortId: string, version: number) =>
    publishEncounterInstancePing(shortId, version),
  publishDungeonInstancePing: (shortId: string, version: number) =>
    publishDungeonInstancePing(shortId, version),
}))
vi.mock("../../encounter/revalidate", () => ({
  revalidateEncounter: (row: unknown) => revalidateEncounter(row),
}))
vi.mock("../../dungeon/revalidate", () => ({
  revalidateDungeon: (row: unknown) => revalidateDungeon(row),
}))

const access = {
  mapInstanceId: "mi-1",
  campaignId: "c-1",
  encounters: [{ shortId: "enc-1" }],
  dungeons: [{ shortId: "dng-1" }],
}

const input = {
  mapInstanceId: "mi-1",
  envelope: {
    clientGroupId: "map-instance:mi-1",
    clientId: "tab-1",
    mutationId: 1,
    invocation: {
      name: "map.instance.intent",
      args: { event: { kind: "renameZone", zoneId: "a", name: "Atrium" } },
    },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  authorizeCampaignDMForMapInstance.mockResolvedValue(ok(access))
  processor.mockResolvedValue(ok(undefined))
})

describe("pushMapInstanceMutationAction", () => {
  it("rejects malformed transport input before authorization", async () => {
    expect(
      await pushMapInstanceMutationAction({ mapInstanceId: "mi-1" } as never)
    ).toEqual(err("invalid-input"))
    expect(authorizeCampaignDMForMapInstance).not.toHaveBeenCalled()
  })

  it("passes the typed authorization verdict to the processor", async () => {
    await pushMapInstanceMutationAction(input)
    const [, context] = processor.mock.calls[0] as [
      unknown,
      MapInstancePushContext,
    ]
    expect(context.authorization).toEqual(ok(access))
  })

  it("invalidates every application route only for a real commit", async () => {
    processor.mockImplementation(
      (_envelope: unknown, context: MapInstancePushContext) => {
        context.committed = { version: 7 }
        return Promise.resolve(ok(undefined))
      }
    )

    expect(await pushMapInstanceMutationAction(input)).toEqual(ok(undefined))
    expect(publishEncounterInstancePing).toHaveBeenCalledWith("enc-1", 7)
    expect(publishDungeonInstancePing).toHaveBeenCalledWith("dng-1", 7)
    expect(revalidateEncounter).toHaveBeenCalledWith({ shortId: "enc-1" })
    expect(revalidateDungeon).toHaveBeenCalledWith({ shortId: "dng-1" })
  })

  it("keeps a deduplicated replay silent", async () => {
    expect(await pushMapInstanceMutationAction(input)).toEqual(ok(undefined))
    expect(publishEncounterInstancePing).not.toHaveBeenCalled()
    expect(publishDungeonInstancePing).not.toHaveBeenCalled()
  })
})
