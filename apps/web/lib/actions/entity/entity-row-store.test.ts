import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/game-v2/kernel/result"

import { commitEntityWrite } from "./entity-row-store"

/**
 * The durable Store's native commit path (UNN-551). The auth gate and the guarded
 * column write are stubbed; the real assemble seam + the real Writers run — the
 * contract under test is that a component write flows auth → assemble → pure Writer
 * → guarded patch with **v2 semantics** (signed depletion, no v1 clamp), and that a
 * refusal short-circuits before the guard.
 */
const requireOwnerOrCampaignDMForEntity = vi.fn()
const requireEntityOwner = vi.fn()
const bumpEntityVersionGuarded = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireOwnerOrCampaignDMForEntity: (id: string) =>
    requireOwnerOrCampaignDMForEntity(id),
  requireEntityOwner: (id: string) => requireEntityOwner(id),
}))
vi.mock("./version-guard", () => ({
  bumpEntityVersionGuarded: (
    id: string,
    cls: string,
    v: number,
    patch: unknown
  ) => bumpEntityVersionGuarded(id, cls, v, patch),
}))

/** A minimal `entity` row the assemble seam projects — only the columns a test
 *  reads need be present; absent component columns are simply absent components. */
function row(overrides: Record<string, unknown>) {
  return {
    id: "e1",
    shortId: "s1",
    name: "Momo",
    portraitUrl: null,
    pronouns: null,
    ...overrides,
  }
}

beforeEach(() => {
  requireOwnerOrCampaignDMForEntity.mockReset()
  requireEntityOwner.mockReset()
  bumpEntityVersionGuarded.mockReset().mockResolvedValue(ok({ version: 8 }))
})

describe("commitEntityWrite — native durable component writes", () => {
  it("commits a vitals damage patch on the vitals class, keyed to the entity", async () => {
    requireOwnerOrCampaignDMForEntity.mockResolvedValue(
      row({ vitals: { base: 20, damage: 0 } })
    )

    const result = await commitEntityWrite(
      "e1",
      { component: "vitals", op: "damage", amount: 7 },
      3
    )

    expect(result).toEqual(ok({ version: 8, shortId: "s1" }))
    expect(bumpEntityVersionGuarded).toHaveBeenCalledWith("e1", "vitals", 3, {
      vitals: { base: 20, damage: 7 },
    })
  })

  it("over-max HP works on a durable row (heal preserves negative depletion — no v1 clamp)", async () => {
    requireOwnerOrCampaignDMForEntity.mockResolvedValue(
      row({ vitals: { base: 20, damage: -3 } })
    )

    await commitEntityWrite(
      "e1",
      { component: "vitals", op: "heal", amount: 5 },
      3
    )

    // v1 would have clamped currentHP to maxHP (damage floored at 0); v2 keeps the
    // over-max balance as negative `damage`.
    expect(bumpEntityVersionGuarded).toHaveBeenCalledWith("e1", "vitals", 3, {
      vitals: { base: 20, damage: -3 },
    })
  })

  it("setMax is a real write on a durable row now (no `unsupported-durable-write`)", async () => {
    requireOwnerOrCampaignDMForEntity.mockResolvedValue(
      row({ vitals: { base: 20, damage: 4 } })
    )

    const result = await commitEntityWrite(
      "e1",
      { component: "vitals", op: "setMax", amount: 40 },
      3
    )

    expect(result.ok).toBe(true)
    expect(bumpEntityVersionGuarded).toHaveBeenCalledWith("e1", "vitals", 3, {
      vitals: { base: 40, damage: 4 },
    })
  })

  it("refuses a write against an absent component before the guard", async () => {
    requireOwnerOrCampaignDMForEntity.mockResolvedValue(
      row({ vitals: { base: 20, damage: 0 } })
    )

    const result = await commitEntityWrite(
      "e1",
      { component: "skillPool", op: "damage", amount: 2 },
      3
    )

    expect(result).toEqual({ ok: false, error: "capability-missing" })
    expect(bumpEntityVersionGuarded).not.toHaveBeenCalled()
  })

  it("gates a vitals-class write owner-or-campaign-DM, never the strict-owner gate", async () => {
    requireOwnerOrCampaignDMForEntity.mockResolvedValue(
      row({ vitals: { base: 20, damage: 0 } })
    )

    await commitEntityWrite(
      "e1",
      { component: "vitals", op: "damage", amount: 1 },
      3
    )

    expect(requireOwnerOrCampaignDMForEntity).toHaveBeenCalledWith("e1")
    expect(requireEntityOwner).not.toHaveBeenCalled()
  })

  it("gates a non-vitals-class write strict-owner — a campaign DM cannot rewrite creation/identity state", async () => {
    requireEntityOwner.mockResolvedValue(row({}))

    const result = await commitEntityWrite(
      "e1",
      {
        component: "narrative",
        op: "setField",
        field: "secrets",
        value: "only mine",
      },
      3
    )

    expect(requireEntityOwner).toHaveBeenCalledWith("e1")
    expect(requireOwnerOrCampaignDMForEntity).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
  })

  it("errs `entity-load-failed` when the stored components are malformed", async () => {
    requireOwnerOrCampaignDMForEntity.mockResolvedValue(
      row({ vitals: { base: "not-a-number" } })
    )

    const result = await commitEntityWrite(
      "e1",
      { component: "vitals", op: "damage", amount: 1 },
      3
    )

    expect(result).toEqual({ ok: false, error: "entity-load-failed" })
    expect(bumpEntityVersionGuarded).not.toHaveBeenCalled()
  })
})
