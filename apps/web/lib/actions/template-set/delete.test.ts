import { beforeEach, describe, expect, it, vi } from "vitest"

import { ok } from "@workspace/result"

import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { deleteTemplateSetAction } from "./delete"

// Stub the owner gate, the in-use check, the soft delete, and `revalidatePath`
// (imports `server-only` transitively) so this is a pure unit of the delete
// orchestration — including the UNN-589 refusal when a Region rolls from the set.
// `requireTemplateSetOwner` throws `forbidden()`; stub it to throw a sentinel.
const requireTemplateSetOwner = vi.fn()
const regionReferencesTemplateSet = vi.fn()
const softDeleteTemplateSet = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/lib/auth/template-set-access", () => ({
  requireTemplateSetOwner: (id: string) => requireTemplateSetOwner(id),
}))
vi.mock("@/lib/db/queries/load-region", () => ({
  regionReferencesTemplateSet: (id: string) => regionReferencesTemplateSet(id),
}))
vi.mock("@/lib/db/writes/template-set", () => ({
  softDeleteTemplateSet: (id: string) => softDeleteTemplateSet(id),
}))
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}))

const SET_ID = "set-1"
const FORBIDDEN = new Error("forbidden")

beforeEach(() => {
  vi.clearAllMocks()
  requireTemplateSetOwner.mockResolvedValue({ id: SET_ID } as TemplateSetRow)
  regionReferencesTemplateSet.mockResolvedValue(false)
})

describe("deleteTemplateSetAction", () => {
  it("lets a non-owner rejection from the gate propagate", async () => {
    requireTemplateSetOwner.mockRejectedValue(FORBIDDEN)

    await expect(
      deleteTemplateSetAction({ templateSetId: SET_ID })
    ).rejects.toBe(FORBIDDEN)
    expect(softDeleteTemplateSet).not.toHaveBeenCalled()
  })

  it("refuses when a Region rolls from the set", async () => {
    regionReferencesTemplateSet.mockResolvedValue(true)

    const result = await deleteTemplateSetAction({ templateSetId: SET_ID })

    expect(result).toEqual({ ok: false, error: "template-set-in-use" })
    expect(softDeleteTemplateSet).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("soft-deletes and revalidates when no Region references it", async () => {
    const result = await deleteTemplateSetAction({ templateSetId: SET_ID })

    expect(result).toEqual(ok(undefined))
    expect(softDeleteTemplateSet).toHaveBeenCalledWith(SET_ID)
    expect(revalidatePath).toHaveBeenCalledWith("/stage/sets")
  })
})
