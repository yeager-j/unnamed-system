import { z } from "zod/v4"

/**
 * The persisted state shapes for every Archetype mechanic, plus the small
 * vocabulary each schema is built from. These are the contract that crosses the
 * `characterArchetypes.mechanicState` JSONB boundary, so they live in
 * `foundation` (the persisted-row types in {@link ./../character/records} depend
 * on the {@link MechanicState} union). The pure behaviour that operates on each
 * state — steppers, the `MechanicDefinition` objects, display labels — lives
 * next to its mechanic in `engine/mechanics/*` and imports the schema and
 * constants back from here.
 */

/** Healer — Path of Dawn: a single Dawn Mode flag (rulebook `Path of Dawn.md`). */
export const pathOfDawnStateSchema = z.object({
  kind: z.literal("path-of-dawn"),
  dawnMode: z.boolean(),
})

export type PathOfDawnState = z.infer<typeof pathOfDawnStateSchema>

/** Warlock — Path of Dusk: a single Dusk Mode flag (rulebook `Path of Dusk.md`). */
export const pathOfDuskStateSchema = z.object({
  kind: z.literal("path-of-dusk"),
  duskMode: z.boolean(),
})

export type PathOfDuskState = z.infer<typeof pathOfDuskStateSchema>

/** Knight — Valor: a 0–7 counter (rulebook `Valor.md`). */
export const VALOR_MAX = 7

export const valorStateSchema = z.object({
  kind: z.literal("valor"),
  value: z.number().int().min(0).max(VALOR_MAX),
})

export type ValorState = z.infer<typeof valorStateSchema>

/**
 * Mage — Stains: a fixed-length list of element slots (rulebook `Stains.md`).
 * The element set is restricted to Fire, Ice, Elec, Wind, and Light per the
 * rulebook's elemental Skill coverage; the Mage holds up to four at once.
 */
export const STAIN_ELEMENTS = ["fire", "ice", "elec", "wind", "light"] as const
export type StainElement = (typeof STAIN_ELEMENTS)[number]

export const STAIN_SLOT_COUNT = 4

export const stainsStateSchema = z.object({
  kind: z.literal("stains"),
  tokens: z.array(z.enum(STAIN_ELEMENTS).nullable()).length(STAIN_SLOT_COUNT),
})

export type StainsState = z.infer<typeof stainsStateSchema>

/**
 * Warrior — Perfection: the current step on the D → S chain (rulebook
 * `Perfection.md`). The rank is a 0-based index; `PERFECTION_MAX_RANK` (S) must
 * stay in lockstep with the length-5 `PERFECTION_RANK_LABELS` /
 * `PERFECTION_ATTACK_BONUSES` tuples in `engine/mechanics/warrior/perfection.ts`.
 */
export const PERFECTION_MAX_RANK = 4

export const perfectionStateSchema = z.object({
  kind: z.literal("perfection"),
  rank: z.number().int().min(0).max(PERFECTION_MAX_RANK),
})

export type PerfectionState = z.infer<typeof perfectionStateSchema>

/**
 * Discriminated union of every mechanic state shape. This schema is the
 * run-time validator for the union as it crosses persistence boundaries (the
 * `characterArchetypes.mechanicState` JSONB column).
 *
 * Adding a new mechanic is three lines: define its state schema above, append
 * it to the union below, and add the module to `MECHANICS` in `./index`.
 */
export const mechanicStateSchema = z.discriminatedUnion("kind", [
  perfectionStateSchema,
  valorStateSchema,
  pathOfDawnStateSchema,
  pathOfDuskStateSchema,
  stainsStateSchema,
])

export type MechanicState =
  | PerfectionState
  | ValorState
  | PathOfDawnState
  | StainsState
  | PathOfDuskState

export type MechanicKind = MechanicState["kind"]
