import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { saveTemplateSetAction } from "./save"

// Stub the owner gate + the two writes so this is a pure unit test of the
// autosave orchestration — that the discriminated `patch` routes to the right
// version-guarded write, gated by `requireTemplateSetOwner`. `forbidden()`
// throws a sentinel so a refusal is assertable.
const requireTemplateSetOwner = vi.fn()
const renameTemplateSet = vi.fn()
const saveTemplateSetContent = vi.fn()

vi.mock("@/lib/auth/template-set-access", () => ({
  requireTemplateSetOwner: (id: string) => requireTemplateSetOwner(id),
}))
vi.mock("@/lib/db/writes/template-set", () => ({
  renameTemplateSet: (id: string, name: string, version: number) =>
    renameTemplateSet(id, name, version),
  saveTemplateSetContent: (id: string, content: unknown, version: number) =>
    saveTemplateSetContent(id, content, version),
}))

const SET_ID = "set-1"

const EMPTY_CONTENT = {
  templates: {},
  tables: {},
  templateOrder: [],
  tableOrder: [],
  closureChance: 0.1,
}

beforeEach(() => {
  vi.clearAllMocks()
  requireTemplateSetOwner.mockResolvedValue({ id: SET_ID } as TemplateSetRow)
  renameTemplateSet.mockResolvedValue(ok({ version: 1 }))
  saveTemplateSetContent.mockResolvedValue(ok({ version: 1 }))
})

describe("saveTemplateSetAction", () => {
  it("routes a name patch to renameTemplateSet (gated)", async () => {
    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      expectedVersion: 0,
      patch: { field: "name", name: "  Slums  " },
    })

    expect(result).toEqual(ok({ version: 1 }))
    expect(requireTemplateSetOwner).toHaveBeenCalledWith(SET_ID)
    expect(renameTemplateSet).toHaveBeenCalledWith(SET_ID, "Slums", 0)
    expect(saveTemplateSetContent).not.toHaveBeenCalled()
  })

  it("routes a content patch to saveTemplateSetContent (gated)", async () => {
    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      expectedVersion: 3,
      patch: { field: "content", content: EMPTY_CONTENT },
    })

    expect(result).toEqual(ok({ version: 1 }))
    // The action forwards the schema-parsed content, so assert the shape lands.
    expect(saveTemplateSetContent).toHaveBeenCalledWith(
      SET_ID,
      EMPTY_CONTENT,
      3
    )
    expect(renameTemplateSet).not.toHaveBeenCalled()
  })

  it("rejects invalid input before touching the gate", async () => {
    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      expectedVersion: 0,
      patch: { field: "name", name: "" },
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireTemplateSetOwner).not.toHaveBeenCalled()
  })

  it("propagates a stale write error to the caller", async () => {
    renameTemplateSet.mockResolvedValue(err("stale"))

    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      expectedVersion: 0,
      patch: { field: "name", name: "Slums" },
    })

    expect(result).toEqual(err("stale"))
  })

  it("propagates a template-set-not-found write error to the caller", async () => {
    saveTemplateSetContent.mockResolvedValue(err("template-set-not-found"))

    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      expectedVersion: 0,
      patch: { field: "content", content: EMPTY_CONTENT },
    })

    expect(result).toEqual(err("template-set-not-found"))
  })
})
