import { beforeEach, describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import { entityAxisFor } from "@/lib/db/axes"

const admitEntityWrite = vi.fn()
const commitAdmittedEntityWrite = vi.fn()
const admitIdentityWrite = vi.fn()
const commitAdmittedIdentityWrite = vi.fn()
const loadPlayerCharacterById = vi.fn()
const loadEntityRow = vi.fn()
const buildFinalizePatch = vi.fn()
const advanceEntityAxisGuarded = vi.fn()
const setStatus = vi.fn()
const whereStatus = vi.fn()
const revalidateCharacterList = vi.fn()
const revalidateEntity = vi.fn()
const publishCharacterPing = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("../entity-row-store", () => ({
  admitEntityWrite: (...args: unknown[]) => admitEntityWrite(...args),
  commitAdmittedEntityWrite: (...args: unknown[]) =>
    commitAdmittedEntityWrite(...args),
}))
vi.mock("../identity-store", () => ({
  admitIdentityWrite: (...args: unknown[]) => admitIdentityWrite(...args),
  commitAdmittedIdentityWrite: (...args: unknown[]) =>
    commitAdmittedIdentityWrite(...args),
}))
vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (...args: unknown[]) =>
    loadPlayerCharacterById(...args),
}))
vi.mock("@/domain/game-v2/entity-row-to-bag", () => ({
  loadEntityRow: (...args: unknown[]) => loadEntityRow(...args),
}))
vi.mock("@/domain/entity/finalize", () => ({
  buildFinalizePatch: (...args: unknown[]) => buildFinalizePatch(...args),
}))
vi.mock("@/domain/game-engine-v2", () => ({
  getArchetype: vi.fn(),
  startingWeaponForLineage: vi.fn(),
}))
vi.mock("../version-guard", () => ({
  advanceEntityAxisGuarded: (...args: unknown[]) =>
    advanceEntityAxisGuarded(...args),
}))
vi.mock("../revalidate", () => ({
  revalidateCharacterList: () => revalidateCharacterList(),
  revalidateEntity: (...args: unknown[]) => revalidateEntity(...args),
}))
vi.mock("@/lib/realtime/publish", () => ({
  publishCharacterPing: (...args: unknown[]) => publishCharacterPing(...args),
}))

const { entityFinalizeCommand, entityIdentityCommand, entityWriteCommand } =
  await import("./commands")

const ACTOR = { userId: "user-1", email: "user-1@example.com" }
const ENTITY = {
  id: "e1",
  shortId: "short-1",
  name: "Vela",
  identityVersion: 3,
}
const PC = {
  entityId: ENTITY.id,
  userId: ACTOR.userId,
  status: "draft" as const,
  entity: ENTITY,
} as unknown as Parameters<
  typeof entityFinalizeCommand.execute
>[0]["evidence"]["pc"]
const TX = {
  update: () => ({
    set: (value: unknown) => {
      setStatus(value)
      return { where: (condition: unknown) => whereStatus(condition) }
    },
  }),
} as unknown as Parameters<typeof entityFinalizeCommand.execute>[0]["tx"]

beforeEach(() => {
  vi.clearAllMocks()
  loadPlayerCharacterById.mockResolvedValue(PC)
  loadEntityRow.mockReturnValue(ok({ components: { archetypes: {} } }))
  buildFinalizePatch.mockReturnValue(
    ok({ status: "finalized", equipment: { items: [], currency: 0 } })
  )
  advanceEntityAxisGuarded.mockResolvedValue(4)
})

describe("entity mutation commands", () => {
  it("turns write admission failures into package denial", async () => {
    admitEntityWrite.mockResolvedValue(err("unauthorized"))

    const admitted = await entityWriteCommand.admit({
      tx: TX,
      actor: ACTOR,
      args: {
        entityId: ENTITY.id,
        write: { component: "vitals", op: "damage", amount: 1 },
      },
    })

    expect(admitted).toEqual({ kind: "denied" })
  })

  it("executes an admitted write through the split Store implementation", async () => {
    const evidence = { pc: PC, versionClass: "vitals" as const }
    commitAdmittedEntityWrite.mockResolvedValue(
      ok({ version: 4, shortId: ENTITY.shortId, versionClass: "vitals" })
    )
    const stamp = createStampAccumulator()
    const args = {
      entityId: ENTITY.id,
      write: { component: "vitals", op: "damage", amount: 1 } as const,
    }

    const decision = await entityWriteCommand.execute({
      tx: TX,
      actor: ACTOR,
      args,
      evidence,
      stamp,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(commitAdmittedEntityWrite).toHaveBeenCalledWith(
      TX,
      args,
      evidence,
      stamp
    )
  })

  it("preserves the structured finalize refusal", async () => {
    const refusal = {
      kind: "missing-requirement" as const,
      stepSlug: "persona" as const,
      reason: "Name your character.",
    }
    buildFinalizePatch.mockReturnValue(err(refusal))

    const decision = await entityFinalizeCommand.execute({
      tx: TX,
      actor: ACTOR,
      args: { entityId: ENTITY.id },
      evidence: { pc: PC },
      stamp: createStampAccumulator(),
    })

    expect(decision).toEqual({ kind: "refused", error: refusal })
    expect(advanceEntityAxisGuarded).not.toHaveBeenCalled()
    expect(setStatus).not.toHaveBeenCalled()
  })

  it("commits finalize's axis patch and subtype status together", async () => {
    const stamp = createStampAccumulator()

    const decision = await entityFinalizeCommand.execute({
      tx: TX,
      actor: ACTOR,
      args: { entityId: ENTITY.id },
      evidence: { pc: PC },
      stamp,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(advanceEntityAxisGuarded).toHaveBeenCalledWith(
      TX,
      ENTITY,
      "identity",
      { equipment: { items: [], currency: 0 } },
      stamp
    )
    expect(setStatus).toHaveBeenCalledWith({ status: "finalized" })
    expect(whereStatus).toHaveBeenCalledOnce()
  })

  it("keeps accepted projections repeat-safe and selected beside the command", async () => {
    const stamp = createStampAccumulator()
    stamp.record(entityAxisFor.identity(ENTITY.id), 4)
    const accepted = stamp.accepted()
    const context = {
      actor: ACTOR,
      args: {
        entityId: ENTITY.id,
        write: { field: "name", value: "Next" } as const,
      },
      stamp: accepted,
      projection: { shortId: ENTITY.shortId },
    }

    await entityIdentityCommand.finalizeAccepted(context)
    await entityIdentityCommand.finalizeAccepted(context)

    expect(revalidateEntity).toHaveBeenCalledTimes(2)
    expect(revalidateCharacterList).toHaveBeenCalledTimes(2)
    expect(publishCharacterPing).toHaveBeenCalledTimes(2)
    expect(publishCharacterPing).toHaveBeenLastCalledWith(
      ENTITY.shortId,
      "entity",
      { identity: 4 }
    )
  })
})
