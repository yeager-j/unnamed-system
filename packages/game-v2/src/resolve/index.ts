/**
 * The **resolve pipeline** — the composition tier that sits above every domain
 * (D33). `resolve.ts` is the pure base fold (`createResolve`); it composes each
 * domain's derivation. `form-swap-policy.ts` is the pre-resolve form layer — the
 * per-component `FORM_SWAP_POLICY` table and its `applyForm` fold (D47).
 * `resolve-entity.ts` is the mechanic-aware entry point that layers the active
 * mechanic's form + effects on top. Reconciled here so the pipeline has one
 * coherent home (UNN-512), not split across folders.
 */
export * from "./creation-archetype-skills"
export * from "./form-swap-policy"
export * from "./resolve"
export * from "./resolve-entity"
