import { describe, expect, it } from "vitest"

import { emptyNarrative } from "@workspace/game-v2/narrative"

import type { LoadedCharacter } from "./load"
import { redactLoadedCharacterForViewer } from "./redact"

function loadedWithSecret(): LoadedCharacter {
  const narrative = { ...emptyNarrative(), hopes: "peace", secrets: "hidden" }
  return {
    profile: { id: "p" } as LoadedCharacter["profile"],
    entity: { id: "e", components: { narrative } },
    resolved: { id: "e", components: { narrative } },
  } as LoadedCharacter
}

describe("redactLoadedCharacterForViewer", () => {
  it("passes the owner's triple through untouched (same reference)", () => {
    const loaded = loadedWithSecret()
    expect(redactLoadedCharacterForViewer(loaded, "owner")).toBe(loaded)
  })

  it.each(["signed-in-other", "signed-out"] as const)(
    "nulls secrets in both narrative homes for %s viewers",
    (role) => {
      const loaded = loadedWithSecret()
      const redacted = redactLoadedCharacterForViewer(loaded, role)

      expect(redacted.entity.components.narrative?.secrets).toBeNull()
      expect(redacted.resolved.components.narrative?.secrets).toBeNull()
      // Public narrative survives; the input is never mutated (React-cached).
      expect(redacted.entity.components.narrative?.hopes).toBe("peace")
      expect(loaded.entity.components.narrative?.secrets).toBe("hidden")
    }
  )

  it("leaves a narrative-less entity unchanged", () => {
    const loaded = loadedWithSecret()
    loaded.entity.components = {}
    loaded.resolved.components = {}
    const redacted = redactLoadedCharacterForViewer(loaded, "signed-out")
    expect(redacted.entity.components).toEqual({})
  })
})
