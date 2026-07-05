/**
 * # The durable write factory — runnable-grade sketch (ADR §2.4; CH5, CH15, CH18)
 *
 * Companion to `ADR.md`, mirroring the combat ADR's `write-router.example.ts`
 * precedent. **Illustrative, not binding** — names and file split are the
 * ADR's; exact types land in S0. The point of this file is that the pattern
 * is NOT new machinery: it is the shipped combat router
 * (`apps/web/lib/combat/commit/writers.ts` + `write.schema.ts`, UNN-520) with
 * exactly three deltas, each cited to its decision:
 *
 *   1. the patch widens from one component to `Partial<StoredComponents>`
 *      (CH5 — Rest spans vitals+skillPool+resources+exhaustion),
 *   2. `durableClass` spreads across all four version classes instead of
 *      always `"vitals"` (CH4 — the class is a fact of the Writer), and
 *   3. the optimistic client frame is produced by a client-side
 *      `resolveEntity` re-fold (CH18 — depletion makes displayed values
 *      derived, so the fold must run where the optimism is).
 *
 * There is no Store *choice* in sections 1–4: a character write is always
 * `Writer ∘ entityRowStore` — the durable-vs-inline home fork is the OTHER
 * factory (CH20), decided at participant mint and derived by combat's shipped
 * `storeFor`; §5 shows it and why character surfaces are branchless
 * downstream of it. Auth lives on the Store, once.
 */

import { z } from "zod/v4"

// ─────────────────────────────────────────────────────────────────────────────
// 1. The descriptor — one serializable shape every component write travels as
//    (client dispatch → Server Action). Extends combat's combatantWriteSchema
//    vocabulary with the character families. NO storage field, NO version
//    class on the wire — the class is derived from the Writer server-side.
// ─────────────────────────────────────────────────────────────────────────────

export const entityWriteSchema = z.union([
  // Pools — identical to combat's arm; the SAME Writer serves both surfaces.
  z.object({
    component: z.enum(["vitals", "skillPool"]),
    op: z.enum(["damage", "heal"]), // setMax is combat/DM-only; a PC max derives
    amount: z.number().int().positive(),
  }),

  // Rest — the multi-component op that forced the CH5 patch widening.
  z.object({
    component: z.literal("rest"),
    op: z.enum(["fullRest", "partialRest", "respite"]),
    diceSpent: z.number().int().nonnegative(),
  }),

  // Narrative (CH16) — per-FIELD set ops + whole-list knife/chain replaces.
  // A descriptor is structurally a per-field write: the server reads, applies,
  // merges — "client composes the full post-state" is unrepresentable (UNN-226).
  z.object({
    component: z.literal("narrative"),
    op: z.literal("setField"),
    field: z.enum([
      "ancestry",
      "background",
      "backstory",
      "personality",
      "hopes",
      "dreams",
      "fears",
      "secrets",
    ]),
    value: z.string(),
  }),
  z.object({
    component: z.literal("narrative"),
    op: z.literal("setList"),
    list: z.enum(["knives", "chains"]),
    entries: z.array(
      z.object({ title: z.string(), description: z.string().nullable() })
    ),
  }),

  // Virtues (CH17) — spark accrual + the forced rank-up (rulebook 1.2).
  z.object({
    component: z.literal("virtues"),
    op: z.literal("addSpark"),
    virtue: z.enum(["expression", "empathy", "wisdom", "focus"]),
  }),
  z.object({
    component: z.literal("virtues"),
    op: z.literal("rankUp"),
    virtue: z.enum(["expression", "empathy", "wisdom", "focus"]),
  }),
])

export type EntityWrite = z.infer<typeof entityWriteSchema>

// Per-family arms (the combat precedent: Extract once, so each Writer's
// applyOp narrows exactly — no union re-checks inside the bodies).
type PoolWrite = Extract<EntityWrite, { component: "vitals" | "skillPool" }>
type RestWrite = Extract<EntityWrite, { component: "rest" }>
type NarrativeWrite = Extract<EntityWrite, { component: "narrative" }>
type VirtueWrite = Extract<EntityWrite, { component: "virtues" }>

// The action envelope wraps the descriptor with identity + concurrency —
// same shape discipline as today's characterMutationBase:
//   { entityId, expectedVersion, write: EntityWrite }
// expectedVersion is the token of the WRITER's class (below), supplied by the
// client from its loaded pair and guarded by the Store.

// ─────────────────────────────────────────────────────────────────────────────
// 2. The Writer — pure, storage-blind, shared verbatim by client prediction
//    and server commit. Delta #1: the patch is entity-level. Delta #2: the
//    class varies per entry. Everything else is combat's ComponentWriter.
// ─────────────────────────────────────────────────────────────────────────────

type StoredComponents = Record<string, unknown> // Partial<DurableComponentRegistry> in S0
type Patch = Partial<StoredComponents> //          may span components (CH5: Rest)
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export type VersionClass = "identity" | "vitals" | "inventory" | "progression"

export interface EntityWriter<W extends EntityWrite = EntityWrite> {
  component: W["component"]
  /** CH4: the class is a fact of the Writer — declared once, both layers read it. */
  durableClass: VersionClass
  /** Pure. Client runs it to predict; server runs it to commit. Same fn. */
  applyOp(
    components: StoredComponents,
    write: W,
    deps: WriterDeps
  ): Result<Patch, WriteRefusal>
}

/** Resolved values a validation needs (caps, maxes). Derived independently by
 *  client (its view) and server (its own resolve) — never trusted off the wire. */
export interface WriterDeps {
  maxPrisma?: number
  maxHP?: number
}

export type WriteRefusal =
  | "capability-missing"
  | "log-full"
  | "not-eligible"
  | "cannot-afford"

declare const applyDamage: Function,
  applySpendSP: Function,
  applyFullRest: Function,
  addSpark: Function,
  rankUpVirtue: Function

// The annotated map (combat's WriterMap precedent): each key pairs with its
// exact write arm, so applyOp bodies narrow without union re-checks.
type WriterMap = {
  vitals: EntityWriter<PoolWrite>
  skillPool: EntityWriter<PoolWrite>
  rest: EntityWriter<RestWrite>
  narrative: EntityWriter<NarrativeWrite>
  virtues: EntityWriter<VirtueWrite>
}

export const ENTITY_WRITERS: WriterMap = {
  // Conforming existing combat Writers — a single-component patch is just the
  // degenerate case of the widened type. The SAME entries serve sheet + console;
  // vitals/skillPool are two entries varying the noun (combat precedent).
  vitals: {
    component: "vitals",
    durableClass: "vitals",
    applyOp: (components, write) =>
      components.vitals === undefined
        ? { ok: false, error: "capability-missing" }
        : {
            ok: true,
            value: { vitals: applyDamage(components.vitals, write) },
          },
  },
  skillPool: {
    component: "skillPool",
    durableClass: "vitals",
    applyOp: (components, write) =>
      components.skillPool === undefined
        ? { ok: false, error: "capability-missing" }
        : {
            ok: true,
            value: { skillPool: applySpendSP(components.skillPool, write) },
          },
  },

  // The widening in action: E2's pure rest transition returns a patch that
  // spans four components — ONE descriptor, ONE class ("vitals", v1 parity),
  // ONE guarded UPDATE that SETs four columns (CH15 makes that atomic + class-
  // disjoint from, say, a concurrent narrative save, structurally).
  rest: {
    component: "rest",
    durableClass: "vitals",
    applyOp: (components, write, deps) =>
      applyFullRest(components, write, deps) as Result<
        Pick<
          StoredComponents,
          "vitals" | "skillPool" | "resources" | "exhaustion"
        >,
        WriteRefusal
      >,
  },

  // CH16: prose autosaves ride the same rail as HP clicks.
  narrative: {
    component: "narrative",
    durableClass: "identity",
    applyOp: (components, write) => ({
      ok: true,
      value: {
        narrative:
          write.op === "setField"
            ? { ...(components.narrative ?? {}), [write.field]: write.value }
            : { ...(components.narrative ?? {}), [write.list]: write.entries },
      },
    }),
  },

  // CH17: progression class; refusals mirror v1's leveling.ts exactly
  // ("log-full" at 7 Sparks forces the rank-up; rank-up clears the log).
  virtues: {
    component: "virtues",
    durableClass: "progression",
    applyOp: (components, write) =>
      (write.op === "addSpark" ? addSpark : rankUpVirtue)(
        components,
        write.virtue
      ) as Result<
        Pick<StoredComponents, "virtues" | "sparkLog">, // rank-up touches both
        WriteRefusal
      >,
  },
}

/**
 * The correlated dispatch (combat's `applyCombatantWrite` precedent) — the ONE
 * entry point both the optimistic client and the Server Action call, so the
 * component→Writer pairing is decided once with exact narrowing.
 */
export function applyEntityWrite(
  components: StoredComponents,
  write: EntityWrite,
  deps: WriterDeps
): Result<Patch, WriteRefusal> {
  switch (write.component) {
    case "vitals":
      return ENTITY_WRITERS.vitals.applyOp(components, write, deps)
    case "skillPool":
      return ENTITY_WRITERS.skillPool.applyOp(components, write, deps)
    case "rest":
      return ENTITY_WRITERS.rest.applyOp(components, write, deps)
    case "narrative":
      return ENTITY_WRITERS.narrative.applyOp(components, write, deps)
    case "virtues":
      return ENTITY_WRITERS.virtues.applyOp(components, write, deps)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. The Store + Server Action — server-only. Branchless past the registry
//    lookup. CH15 is what makes this safe: the patch's keys map 1:1 to
//    component COLUMNS, so the guarded UPDATE touches exactly the written
//    components and cannot clobber a sibling class's column.
// ─────────────────────────────────────────────────────────────────────────────

export async function applyEntityWriteAction(input: unknown) {
  // 1. Parse — never trust the wire. (Envelope + descriptor schemas.)
  const { entityId, expectedVersion, write } = parseEnvelope(input)

  // 2. Authorize — the Store's gate, decided once (owner-or-campaign-DM,
  //    v1 parity: a player writes their own PC; the DM may too).
  const row = await requireOwnerOrCampaignDM(entityId)

  // 3. The correlated dispatch is the ONLY branching. No storage branch —
  //    durable always; no class branch — the Writer declares it.
  const durableClass = ENTITY_WRITERS[write.component].durableClass

  // 4. Assemble → pure op → guarded column write. `assemble` is CH15's
  //    non-null-columns → bag projection (the loader's move, reused).
  const result = applyEntityWrite(assemble(row), write, serverDeps(row))
  if (!result.ok) return result // refusal surfaces; never silently dropped

  // 5. UPDATE entity SET <column per patch key> = <value>,
  //        <durableClass>Version = <durableClass>Version + 1
  //    WHERE id = ? AND <durableClass>Version = expectedVersion
  //    → 0 rows ⇒ err("stale") (same contract as bumpCharacterVersionGuarded).
  return commitPatch(entityId, durableClass, expectedVersion, result.value)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The client half — useEntityWrite (CH18). Reducer-form useOptimistic
//    (the UNN-226 stale-closure lesson: predict against the LATEST frame,
//    never a captured one), then the same pure Writer, then a client-side
//    resolveEntity re-fold so DERIVED values (currentHP under depletion) move
//    instantly. One strategy for every write — the cheap-algebra shortcut is
//    rejected (CH18).
// ─────────────────────────────────────────────────────────────────────────────

export function useEntityWrite(/* loaded pair from the route provider */) {
  // const [frame, applyLocal] = useOptimistic(loaded, (prev, write: EntityWrite) => {
  //   const predicted = applyEntityWrite(prev.entity.components, write, clientDeps(prev))
  //   if (!predicted.ok) return prev                    // refusal → no optimistic lie
  //   const entity = mergePatch(prev.entity, predicted.value)
  //   return { entity, resolved: resolveEntity(entity) } // ← CH18: the re-fold
  // })
  //
  // dispatch = (write) => startTransition(async () => {
  //   applyLocal(write)
  //   const result = await applyEntityWriteAction({ entityId, expectedVersion, write })
  //   if (!result.ok) toastAndRevert(result.error)       // "stale" → refresh prompt
  // })
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. The OTHER factory — the home fork (CH20; CD18/CD19, SHIPPED as combat's
//    `storeFor` in lib/actions/combat/commit/). Some entities live on the
//    session, some on durable rows — both are entities, and the UI never
//    learns which. The #9 anatomy:
//
//    DECIDED once, at participant mint — the stored shape IS the decision:
//
//      type StoredEntityLocator =
//        | { storage: "durable"; entityId: string }   // PC / reusable NPC
//        | { storage: "inline";  entity: StoredEntity } // session-blob combatant
//
//    DERIVED at the two boundaries that need it (projection, not policy):
//
//      // server (combat's commit action) — the Store + auth gate fall out:
//      const store =
//        locator.storage === "durable"
//          ? entityRowStore(locator.entityId, writer.durableClass) // owner-or-DM; entity class token
//          : sessionStore(encounterId)                             // DM-only; encounter version
//      // client (console optimistic) — the prediction strategy falls out of
//      // the same fact read from its own view: inline → run the pure session
//      // reducer locally; durable → merge patch + resolveEntity (CH18).
//
//    UNREPRESENTABLE to the UI — the descriptor above has no storage field.
//
//    The character surfaces (this file's sections 3–4) contain NO fork by
//    design: the fork only exists where both homes coexist — inside an
//    encounter. A character route addresses a durable row by construction, so
//    its door is Writer ∘ entityRowStore, branchless. Re-checking the home at
//    the sheet would re-decide a distinction already resolved at mint — the
//    multiplicity smell #9 names.
//
//    WIDGET BLINDNESS RULE: a write-capable component takes `dispatch` from
//    its surface's provider (useEntityWrite | useCombatantWrite) and never
//    imports a Server Action. Door chosen once per surface at its composition
//    root; home chosen once per participant at mint; the widget knows neither.
//
//    ONE PIPELINE, TWO DOORS (CH20 refinement): at S0 no sibling factory
//    survives — combat's COMPONENT_WRITERS absorb into ENTITY_WRITERS (they
//    are the conforming subset), combatantWriteSchema becomes the
//    encounter-wire SUBSET of entityWriteSchema, and combat's durable arm
//    forwards to the exact `Writer ∘ entityRowStore` composition above. The
//    doors differ only by ADDRESS TYPE (entityId vs encounterId+participantId)
//    — write logic exists once, and none of it reads PC vs NPC.
// ─────────────────────────────────────────────────────────────────────────────

// ── stubs so the sketch reads top-to-bottom ──────────────────────────────────
declare function parseEnvelope(i: unknown): {
  entityId: string
  expectedVersion: number
  write: EntityWrite
}
declare function requireOwnerOrCampaignDM(
  id: string
): Promise<Record<string, unknown>>
declare function assemble(row: Record<string, unknown>): StoredComponents
declare function serverDeps(row: Record<string, unknown>): WriterDeps
declare function commitPatch(
  id: string,
  cls: VersionClass,
  v: number,
  p: Patch
): Promise<unknown>
