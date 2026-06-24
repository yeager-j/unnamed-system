import { z } from "zod/v4"

import {
  MECHANIC_KINDS,
  type MechanicKind,
} from "@workspace/game-v2/kernel/vocab/mechanics"
import { enchantmentStateSchema } from "@workspace/game-v2/mechanics/bard/enchantment"
import { frenzyStateSchema } from "@workspace/game-v2/mechanics/berserker/frenzy"
import { pathOfDawnStateSchema } from "@workspace/game-v2/mechanics/healer/path-of-dawn"
import { valorStateSchema } from "@workspace/game-v2/mechanics/knight/valor"
import { stainsStateSchema } from "@workspace/game-v2/mechanics/mage/stains"
import { elementalLarcenyStateSchema } from "@workspace/game-v2/mechanics/thief/elemental-larceny"
import { thiefsInsightStateSchema } from "@workspace/game-v2/mechanics/thief/thiefs-insight"
import { pathOfDuskStateSchema } from "@workspace/game-v2/mechanics/warlock/path-of-dusk"
import { perfectionStateSchema } from "@workspace/game-v2/mechanics/warrior/perfection"

/**
 * The persisted mechanic-state union + the **Mechanics** component (D17/D36).
 *
 * Each mechanic owns its own state schema, co-located with its definition in
 * `mechanics/<lineage>/*` (so a 30-mechanic roster never grows one god-file); this
 * module only **assembles** them — one import + one union member per mechanic. The
 * discriminated union is the run-time validator the load seam applies at the
 * `Mechanics` jsonb boundary.
 */
export const mechanicStateSchema = z.discriminatedUnion("kind", [
  perfectionStateSchema,
  valorStateSchema,
  pathOfDawnStateSchema,
  pathOfDuskStateSchema,
  stainsStateSchema,
  thiefsInsightStateSchema,
  elementalLarcenyStateSchema,
  enchantmentStateSchema,
  frenzyStateSchema,
])

export type MechanicState = z.infer<typeof mechanicStateSchema>

/**
 * Compile-time proof that the state union's discriminants exactly cover the
 * {@link MechanicKind} vocab — a state shape whose `kind` drifts from the tuple (or
 * a vocab entry with no state) is a type error here, not a latent bug.
 */
type _StateKindsCoverVocab = MechanicState["kind"] extends MechanicKind
  ? MechanicKind extends MechanicState["kind"]
    ? true
    : never
  : never
const _stateKindsCoverVocab: _StateKindsCoverVocab = true
void _stateKindsCoverVocab

/**
 * The **Mechanics** component — an entity's per-mechanic persisted state, keyed by
 * mechanic `kind`. A capability *any* entity may carry (a PC's Archetype mechanic,
 * an enemy's Arcana-swap), so it is its own component, not folded onto `Archetypes`
 * (D36): `Archetypes.active` says *which* mechanic is active; `resolve` reads its
 * state from here.
 *
 * **Partial** by design — a key is present only when the entity owns that mechanic
 * (presence = ownership, like every capability, D3). A read path coerces an
 * absent-but-owned mechanic to its `initialState()` via
 * {@link import("./registry").initialStateFor} without persisting one. The record
 * value is the discriminated {@link mechanicStateSchema}; the load seam validates
 * it, so `states[k].kind === k` is an authoring invariant, not enforced here.
 */
export const mechanicsSchema = z.object({
  states: z
    .partialRecord(z.enum(MECHANIC_KINDS), mechanicStateSchema)
    .default({}),
})

export type Mechanics = z.infer<typeof mechanicsSchema>
