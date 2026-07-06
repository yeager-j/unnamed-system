import { z } from "zod/v4"

import { MECHANIC_KINDS } from "@workspace/game-v2/kernel/vocab/mechanics"
import { getMechanic } from "@workspace/game-v2/mechanics"

/**
 * The **serializable entity-write descriptor** (UNN-520/UNN-551; CD19) — the one
 * shape every durable-component write travels as, from the optimistic client
 * dispatch to the Server Action. It is the shared write vocabulary: the character
 * surfaces dispatch it to the entity door, and combat dispatches it to the
 * encounter door (which resolves the participant's home, then forwards a durable
 * write to the *same* Writers). There is no parallel "combatant write" type — the
 * encounter wire validates this schema directly.
 *
 * Today's arms, one per write-side component family:
 *
 * - `vitals` / `skillPool` — the depletion pools (`damage`/`heal`/`setMax`,
 *   positive amounts; each op owns its clamp).
 * - `resources` — consumable charges (`usePrisma`).
 * - `mechanics` — one mechanic-state transition, its `transition` payload
 *   validated **per-mechanic** against the registry's own `transitions.schema`
 *   (a mechanic that ships no write surface rejects here, at the boundary).
 *
 * Character-only families (rest, narrative, virtues) join this union as their
 * slices land (E1/E2 + the sheet); when the first one does, the encounter wire
 * narrows to the combat-relevant subset (with a test that it rejects the rest).
 *
 * **No storage field** — the entity's durable-vs-inline home is never on the
 * wire; the server derives it from the authoritative out-of-band locator map, so
 * a client claim could never be read. The descriptor is *what* to write; *where*
 * is the router's decision (ADR §2.4/§2.9).
 */
export const entityWriteSchema = z.union([
  z.object({
    component: z.enum(["vitals", "skillPool"]),
    op: z.enum(["damage", "heal", "setMax"]),
    amount: z.number().int().positive(),
  }),
  z.object({
    component: z.literal("resources"),
    op: z.literal("usePrisma"),
  }),
  z
    .object({
      component: z.literal("mechanics"),
      mechanic: z.enum(MECHANIC_KINDS),
      transition: z.unknown(),
    })
    .check((ctx) => {
      const write = ctx.value
      const transitions = getMechanic(write.mechanic)?.transitions
      if (!transitions) {
        ctx.issues.push({
          code: "custom",
          message: `mechanic ${write.mechanic} has no write surface`,
          input: write,
        })
        return
      }
      if (!transitions.schema.safeParse(write.transition).success) {
        ctx.issues.push({
          code: "custom",
          message: `invalid ${write.mechanic} transition descriptor`,
          input: write,
        })
      }
    }),
])

export type EntityWrite = z.infer<typeof entityWriteSchema>

/** The pools arm alone (the shape the vitals/skillPool Writers consume). */
export type PoolWrite = Extract<
  EntityWrite,
  { component: "vitals" | "skillPool" }
>

/** The mechanics arm alone. */
export type MechanicWrite = Extract<EntityWrite, { component: "mechanics" }>
