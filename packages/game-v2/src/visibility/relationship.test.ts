import { describe, expect, it } from "vitest"

import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import { dm, player, spectator } from "./__fixtures__/redaction"
import { relationship, type RelationshipSubject } from "./relationship"

/** A subject carrying a side (the merged-view allegiance), or none. */
function subject(side?: CombatSide, id = "e1"): RelationshipSubject {
  return { id, components: side ? { allegiance: { side } } : {} }
}

describe("relationship — viewer↔entity, computed once (CD11; ADR §2.6)", () => {
  it("dm short-circuits to `dm`, beating ownership and side", () => {
    // A DM who also happens to own the entity AND share its side still reads `dm` —
    // the short-circuit is first, so no later arm can downgrade it.
    const owningSameSideDm = {
      isDm: true,
      side: "players" as const,
      ownedEntityIds: new Set(["e1"]),
    }
    expect(relationship(subject("players"), owningSameSideDm)).toBe("dm")
    expect(relationship(subject("enemies"), dm())).toBe("dm")
  })

  it("`own` by ownership capability — even when the entity fights the other side (charmed PC)", () => {
    // The entity sits on `enemies`; its controller is a `players` viewer. Ownership
    // is keyed on entity id, not side, so it reads `own` — never `opponent`.
    const controller = player("players", ["e1"])
    expect(relationship(subject("enemies"), controller)).toBe("own")
  })

  it("`own` beats `spectator` (a sideless viewer who still owns the entity)", () => {
    const sidelessOwner = {
      isDm: false,
      side: null,
      ownedEntityIds: new Set(["e1"]),
    }
    expect(relationship(subject("players"), sidelessOwner)).toBe("own")
  })

  it("`spectator` for a sideless viewer that owns nothing", () => {
    expect(relationship(subject("players"), spectator())).toBe("spectator")
  })

  it("`spectator` fail-safe when the entity carries no allegiance (least privilege)", () => {
    // A sided viewer, but the entity has no side to compare against ⇒ least-privilege
    // spectator rather than a guessed ally/opponent.
    expect(relationship(subject(undefined), player("players"))).toBe(
      "spectator"
    )
  })

  it("`ally` on a side match", () => {
    expect(relationship(subject("players"), player("players"))).toBe("ally")
  })

  it("`opponent` on a side mismatch", () => {
    expect(relationship(subject("enemies"), player("players"))).toBe("opponent")
  })
})
