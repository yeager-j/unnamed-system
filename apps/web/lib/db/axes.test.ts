import { describe, expect, it } from "vitest"

import {
  dungeonAxis,
  encounterAxis,
  entityAxisFor,
  entityIdentityAxis,
  entityInventoryAxis,
  entityProgressionAxis,
  entityVitalsAxis,
  mapInstanceAxis,
  regionAxis,
} from "./axes"
import { VERSION_CLASSES } from "./version-classes"

/**
 * The canonical storage address is a deployed protocol even though the boundary
 * value is opaque. These assertions pin its externally relevant properties.
 */
describe("entity axis namespace", () => {
  const id = "entity-123"

  it("is deterministic, opaque, and distinct by storage address", () => {
    const axes = [
      entityIdentityAxis(id),
      entityVitalsAxis(id),
      entityInventoryAxis(id),
      entityProgressionAxis(id),
      encounterAxis(id),
      mapInstanceAxis(id),
      dungeonAxis(id),
      regionAxis(id),
    ]

    expect(entityVitalsAxis(id)).toBe(entityVitalsAxis(id))
    expect(new Set(axes)).toHaveLength(axes.length)
    for (const axis of axes) {
      expect(axis).toMatch(/^showtime:axis:v1:[a-f0-9]{64}$/)
      expect(axis).not.toContain(id)
    }
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
