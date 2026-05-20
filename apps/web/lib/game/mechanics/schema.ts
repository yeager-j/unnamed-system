import { z } from "zod/v4"
import { perfectionStateSchema, type PerfectionState } from "./perfection"
import { valorStateSchema, type ValorState } from "./valor"
import { pathOfDawnStateSchema, type PathOfDawnState } from "./path-of-dawn"
import { stainsStateSchema, type StainsState } from "./stains"

/**
 * Discriminated union of every mechanic state shape. The registry in
 * {@link ./index} composes per-mechanic modules; this schema is the run-time
 * validator for the union as it crosses persistence boundaries (the
 * `characterArchetypes.mechanicState` JSONB column).
 *
 * Adding a new mechanic is three lines: import its state schema, append it to
 * the union below, and add the module to `MECHANICS` in `./index`.
 */
export const mechanicStateSchema = z.discriminatedUnion("kind", [
  perfectionStateSchema,
  valorStateSchema,
  pathOfDawnStateSchema,
  stainsStateSchema,
])

export type MechanicState =
  | PerfectionState
  | ValorState
  | PathOfDawnState
  | StainsState

export type MechanicKind = MechanicState["kind"]
