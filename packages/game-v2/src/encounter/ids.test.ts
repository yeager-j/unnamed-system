import { describe, expect, it } from "vitest"

import { asParticipantId, type ParticipantId } from "./ids"

/**
 * The brand lock-in (UNN-519 class). The whole point of branding only the
 * participant id is that a plain `string` — in particular an `Entity.id` — must NOT
 * flow into a roster-id position. If the brand ever leaks (a bare `string` becomes
 * assignable to {@link ParticipantId}), the `@ts-expect-error` below goes unused and
 * the typecheck fails — so the guarantee cannot silently regress.
 */
describe("ParticipantId brand", () => {
  it("brands a trusted string and erases at runtime (value unchanged)", () => {
    expect(asParticipantId("p1")).toBe("p1")
  })

  it("rejects a bare string / entity id where a ParticipantId is required", () => {
    const entityId: string = "entity-1"
    // @ts-expect-error — a bare string (e.g. an Entity.id) is not a ParticipantId.
    const rosterId: ParticipantId = entityId
    expect(rosterId).toBe("entity-1")
  })
})
