import { beforeEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import type { TemplateSetRow } from "@/lib/db/schema/template-set"

import { saveTemplateSetAction } from "./save"

// Stub the owner gate + the two writes so this is a pure unit test of the
// autosave orchestration — that the discriminated `patch` routes to the right
// field-scoped write, gated by `requireTemplateSetOwner`. `forbidden()`
// throws a sentinel so a refusal is assertable.
const requireTemplateSetOwner = vi.fn()
const renameTemplateSet = vi.fn()
const saveTemplateSetContent = vi.fn()

vi.mock("@/lib/auth/template-set-access", () => ({
  requireTemplateSetOwner: (id: string) => requireTemplateSetOwner(id),
}))
vi.mock("@/lib/db/writes/template-set", () => ({
  renameTemplateSet: (id: string, name: string) => renameTemplateSet(id, name),
  saveTemplateSetContent: (id: string, content: unknown) =>
    saveTemplateSetContent(id, content),
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
  renameTemplateSet.mockResolvedValue(ok(undefined))
  saveTemplateSetContent.mockResolvedValue(ok(undefined))
})

describe("saveTemplateSetAction", () => {
  it("routes a name patch to renameTemplateSet (gated)", async () => {
    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      patch: { field: "name", name: "  Slums  " },
    })

    expect(result).toEqual(ok(undefined))
    expect(requireTemplateSetOwner).toHaveBeenCalledWith(SET_ID)
    expect(renameTemplateSet).toHaveBeenCalledWith(SET_ID, "Slums")
    expect(saveTemplateSetContent).not.toHaveBeenCalled()
  })

  it("routes a content patch to saveTemplateSetContent (gated)", async () => {
    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      patch: { field: "content", content: EMPTY_CONTENT },
    })

    expect(result).toEqual(ok(undefined))
    // The action forwards the schema-parsed content, so assert the shape lands.
    expect(saveTemplateSetContent).toHaveBeenCalledWith(SET_ID, EMPTY_CONTENT)
    expect(renameTemplateSet).not.toHaveBeenCalled()
  })

  it("rejects invalid input before touching the gate", async () => {
    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      patch: { field: "name", name: "" },
    })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireTemplateSetOwner).not.toHaveBeenCalled()
  })

  it("propagates a template-set-not-found write error to the caller", async () => {
    saveTemplateSetContent.mockResolvedValue(err("template-set-not-found"))

    const result = await saveTemplateSetAction({
      templateSetId: SET_ID,
      patch: { field: "content", content: EMPTY_CONTENT },
    })

    expect(result).toEqual(err("template-set-not-found"))
  })
})
