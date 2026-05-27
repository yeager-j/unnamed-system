import { z } from "zod/v4"

import type { MechanicDefinition } from "../types"

/**
 * Mage — Stains. Elemental Skills cast on the Mage's turn leave residue that
 * empowers later Skills (rulebook `Skills/Mechanics/Stains.md`). The Mage may
 * hold up to four Stains at once; some Skills consume matching Stains
 * automatically when cast.
 *
 * State is a fixed-length slot list (4 slots), each holding an element token
 * or null. Skill-cast generation/consumption is a write path — out of MVP
 * scope; this module just owns the persisted shape. The element set is
 * restricted to Fire, Ice, Elec, Wind, and Light per the rulebook's elemental
 * Skill coverage.
 */

export const STAIN_ELEMENTS = ["fire", "ice", "elec", "wind", "light"] as const
export type StainElement = (typeof STAIN_ELEMENTS)[number]

export const STAIN_SLOT_COUNT = 4

export const STAIN_ELEMENT_LABELS: Record<StainElement, string> = {
  fire: "Fire",
  ice: "Ice",
  elec: "Elec",
  wind: "Wind",
  light: "Light",
}

export const stainsStateSchema = z.object({
  kind: z.literal("stains"),
  tokens: z.array(z.enum(STAIN_ELEMENTS).nullable()).length(STAIN_SLOT_COUNT),
})

export type StainsState = z.infer<typeof stainsStateSchema>

export const stains: MechanicDefinition<StainsState> = {
  kind: "stains",
  displayName: "Stains",
  tagline:
    "Elemental Skills leave Stains behind that later Skills consume for bonus effects.",
  description: `The elemental Skills you cast on your turn leave behind residue that empowers the Skills you cast in the future.

***Generating Stains.*** Some Skills generate Stains when cast. You gain these Stains whether or not the attack hits or does damage. You can have up to 4 Stains at any one time. If you would exceed this limit, choose one or more of your Stains to replace.

***Consuming Stains.*** Some Skills consume Stains to produce additional effects. You do not choose whether or not to consume Stains; if the Stain(s) is available, it is consumed.`,
  schema: stainsStateSchema,
  initialState: () => ({
    kind: "stains",
    tokens: Array.from({ length: STAIN_SLOT_COUNT }, () => null),
  }),
  resetOn: "encounter",
}
