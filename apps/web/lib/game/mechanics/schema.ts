import { z } from "zod/v4"

import {
  pathOfDawnStateSchema,
  type PathOfDawnState,
} from "./healer/path-of-dawn"
import { valorStateSchema, type ValorState } from "./knight/valor"
import { stainsStateSchema, type StainsState } from "./mage/stains"
import { PathOfDuskState, pathOfDuskStateSchema } from "./warlock/path-of-dusk"
import {
  perfectionStateSchema,
  type PerfectionState,
} from "./warrior/perfection"

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
