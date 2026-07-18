/**
 * The `generation/` public surface — the pure grammar layer for procedural
 * dungeons (tech design §3). P1 ships the authoring contracts: the Template Set
 * jsonb schema, the `d100Ranges` weight projection, and the advisory
 * `lintTemplateSet`. P1 of the expedition lifecycle (UNN-589) adds the escrow
 * contracts that live at the generation ↔ spatial seam: the `staticReveal`
 * fold/apply (`fold.ts`), the start-time authored-provenance stamp
 * (`provenance.ts`), and the Region's authored generation settings
 * (`region-settings.schema.ts`). P3a (UNN-590) adds the algorithmic layer — the
 * seeded named-stream RNG (`rng.ts`), the directional-fan layout + stub anchors
 * (`layout.ts`), loop-closure candidate selection (`closure.ts`), and the
 * expedition-start helpers (`start.ts`: unique-key seeding, optional-exit
 * culling + stub sprouting). The expand-loop roller (`roll-expansion`) lands
 * P3b; graft lands P6. Like `spatial/`, this slice imports `kernel/` +
 * `spatial/` shapes only and takes its catalog membership injected
 * (`LintVocab`), never value-importing `catalog/`.
 */
export * from "./template-set.schema"
export * from "./d100-ranges"
export * from "./lint"
export * from "./fold"
export * from "./provenance"
export * from "./region-settings.schema"
export * from "./rng"
export * from "./layout"
export * from "./closure"
export * from "./start"
