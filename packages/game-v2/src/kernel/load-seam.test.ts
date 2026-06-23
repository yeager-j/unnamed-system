import { describe, expect, it } from "vitest"

import {
  ENTITY_LOAD_KEY,
  loadEntity,
} from "@workspace/game-v2/kernel/load-seam"

describe("loadEntity (the F6 load seam)", () => {
  it("round-trips a valid component blob into an Entity", () => {
    const result = loadEntity("e1", {
      identity: { id: "e1", name: "Iris Vey" },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.id).toBe("e1")
      expect(result.value.components.identity).toEqual({
        id: "e1",
        name: "Iris Vey",
      })
    }
  })

  it("fails with an issue naming the component whose shape is invalid", () => {
    const result = loadEntity("e1", {
      identity: { id: "", name: 42 },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.some((issue) => issue.key === "identity")).toBe(true)
    }
  })

  it("ignores unknown component keys (forward-compatible migrations)", () => {
    const result = loadEntity("e1", {
      identity: { id: "e1", name: "Iris Vey" },
      retiredComponent: { whatever: 1 },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect("retiredComponent" in result.value.components).toBe(false)
    }
  })

  it("treats an absent component as absent, not an error (presence is the guard's job)", () => {
    const result = loadEntity("e1", {})

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.components.identity).toBeUndefined()
    }
  })

  it("fails with the entity sentinel when the blob isn't an object", () => {
    const result = loadEntity("e1", "not-an-object")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.some((issue) => issue.key === ENTITY_LOAD_KEY)).toBe(
        true
      )
    }
  })
})
