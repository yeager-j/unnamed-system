import { describe, expect, it } from "vitest"

import {
  dungeonAxis,
  dungeonRosterMembershipAxis,
  encounterAxis,
  entityAxisFor,
  entityIdentityAxis,
  entityInventoryAxis,
  entityProgressionAxis,
  entityVitalsAxis,
  mapInstanceAxis,
  mapInstanceEncounterMembershipAxis,
  regionAxis,
} from "./axes"
import { VERSION_CLASSES } from "./version-classes"

/**
 * The axis address scheme is a **deployed protocol** — a stale tab may compare an
 * axis it observes against a newer server, so a silent change to any string here
 * would strand invalidations. These assertions pin the wire strings; changing one
 * is a protocol-version decision, not a refactor.
 */
describe("entity axis namespace", () => {
  const id = "entity-123"

  it("addresses each storage axis by primary id", () => {
    expect(entityIdentityAxis(id)).toBe("entity/entity-123/identity")
    expect(entityVitalsAxis(id)).toBe("entity/entity-123/vitals")
    expect(entityInventoryAxis(id)).toBe("entity/entity-123/inventory")
    expect(entityProgressionAxis(id)).toBe("entity/entity-123/progression")
    expect(encounterAxis(id)).toBe("encounter/entity-123")
    expect(mapInstanceAxis(id)).toBe("map-instance/entity-123")
    expect(mapInstanceEncounterMembershipAxis(id)).toBe(
      "map-instance/entity-123/encounter-membership"
    )
    expect(dungeonAxis(id)).toBe("dungeon/entity-123")
    expect(dungeonRosterMembershipAxis(id)).toBe(
      "dungeon/entity-123/roster-membership"
    )
    expect(regionAxis(id)).toBe("region/entity-123")
  })

  it("maps every write class to its entity axis", () => {
    // Total over VersionClass so a new class can't silently miss an axis.
    expect(Object.keys(entityAxisFor).sort()).toEqual(
      [...VERSION_CLASSES].sort()
    )
    expect(entityAxisFor.identity(id)).toBe(entityIdentityAxis(id))
    expect(entityAxisFor.vitals(id)).toBe(entityVitalsAxis(id))
    expect(entityAxisFor.inventory(id)).toBe(entityInventoryAxis(id))
    expect(entityAxisFor.progression(id)).toBe(entityProgressionAxis(id))
  })
})
