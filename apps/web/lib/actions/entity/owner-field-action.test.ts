import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod/v4"

import { ok } from "@workspace/result"

import type { EntityRow } from "@/lib/db/schema/entity"

import { makeOwnerFieldAction } from "./owner-field-action"

const requireEntityOwner = vi.fn()

vi.mock("@/lib/auth/campaign-access", () => ({
  requireEntityOwner: (id: string) => requireEntityOwner(id),
}))

const schema = z.object({
  entityId: z.string().min(1),
  value: z.string().trim(),
})
const row = { id: "entity-1" } as EntityRow

beforeEach(() => {
  requireEntityOwner.mockReset().mockResolvedValue({ entity: row })
})

describe("makeOwnerFieldAction", () => {
  it("rejects invalid input before checking ownership", async () => {
    const handler = vi.fn()
    const action = makeOwnerFieldAction(schema, handler)

    const result = await action({ entityId: "", value: "new value" })

    expect(result).toEqual({ ok: false, error: "invalid-input" })
    expect(requireEntityOwner).not.toHaveBeenCalled()
    expect(handler).not.toHaveBeenCalled()
  })

  it("passes the loaded row and parsed input to the handler", async () => {
    const handler = vi.fn().mockResolvedValue(ok({ version: 2 }))
    const action = makeOwnerFieldAction(schema, handler)

    const result = await action({
      entityId: "entity-1",
      value: "  new value  ",
    })

    expect(requireEntityOwner).toHaveBeenCalledWith("entity-1")
    expect(handler).toHaveBeenCalledWith(row, {
      entityId: "entity-1",
      value: "new value",
    })
    expect(result).toEqual(ok({ version: 2 }))
  })
})
