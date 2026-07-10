/**
 * The **resolve pipeline** — the composition tier that sits above every domain
 * (D33). `resolve.ts` is the pure base fold (`createResolve`/`applyForm`); it
 * composes each domain's derivation. `resolve-entity.ts` is the mechanic-aware
 * entry point that layers the active mechanic's form + effects on top. Reconciled
 * here so the pipeline has one coherent home (UNN-512), not split across folders.
 */
export * from "./creation-archetype-skills"
export * from "./resolve"
export * from "./resolve-entity"
