import { beforeEach, describe, expect, it, vi } from "vitest"

import { revalidateCharacterList, revalidateEntity } from "./revalidate"

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath }))

beforeEach(() => revalidatePath.mockReset())

describe("entity revalidation", () => {
  it("revalidates only the character subtree for an ordinary entity write", () => {
    revalidateEntity({ shortId: "abc123" })

    expect(revalidatePath).toHaveBeenCalledOnce()
    expect(revalidatePath).toHaveBeenCalledWith("/characters/abc123", "layout")
    expect(revalidatePath).not.toHaveBeenCalledWith("/")
  })

  it("revalidates My Characters through the explicit list invalidator", () => {
    revalidateCharacterList()

    expect(revalidatePath).toHaveBeenCalledOnce()
    expect(revalidatePath).toHaveBeenCalledWith("/")
  })
})
