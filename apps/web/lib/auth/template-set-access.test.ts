import { beforeEach, describe, expect, it, vi } from "vitest"

import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { requireTemplateSetOwner } from "./template-set-access"

// The gate touches two seams: the session (`auth` from ./index) and the
// Template Set loader. Stub both so this stays a pure unit test with no
// next-auth / DB chain. `forbidden()` normally throws a Next redirect-class
// error; stub it to throw a sentinel so rejections are assertable.
const auth = vi.fn()
const loadTemplateSetRowById = vi.fn()

vi.mock("./index", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/queries/load-template-set", () => ({
  loadTemplateSetRowById: (id: string) => loadTemplateSetRowById(id),
}))
vi.mock("next/navigation", () => ({
  forbidden: () => {
    throw new Error("forbidden")
  },
}))

const OWNER_ID = "user-owner"
const OTHER_ID = "user-other"
const SET_ID = "set-1"

function makeSet(overrides: Partial<TemplateSetRow>): TemplateSetRow {
  return { id: SET_ID, userId: OWNER_ID, ...overrides } as TemplateSetRow
}

function signedInAs(userId: string) {
  auth.mockResolvedValue({ user: { id: userId } })
}

describe("requireTemplateSetOwner", () => {
  beforeEach(() => {
    auth.mockReset()
    loadTemplateSetRowById.mockReset()
  })

  it("allows the owner and returns the row", async () => {
    signedInAs(OWNER_ID)
    const set = makeSet({ userId: OWNER_ID })
    loadTemplateSetRowById.mockResolvedValue(set)

    await expect(requireTemplateSetOwner(SET_ID)).resolves.toBe(set)
  })

  it("forbids a missing session (and never queries)", async () => {
    auth.mockResolvedValue(null)

    await expect(requireTemplateSetOwner(SET_ID)).rejects.toThrow("forbidden")
    expect(loadTemplateSetRowById).not.toHaveBeenCalled()
  })

  it("forbids a missing (or soft-deleted) Set", async () => {
    signedInAs(OWNER_ID)
    loadTemplateSetRowById.mockResolvedValue(null)

    await expect(requireTemplateSetOwner(SET_ID)).rejects.toThrow("forbidden")
  })

  it("forbids a signed-in non-owner", async () => {
    signedInAs(OTHER_ID)
    loadTemplateSetRowById.mockResolvedValue(makeSet({ userId: OWNER_ID }))

    await expect(requireTemplateSetOwner(SET_ID)).rejects.toThrow("forbidden")
  })
})
