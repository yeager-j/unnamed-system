/**
 * The `kernel/` public surface — the component substrate every domain builds on
 * (D33). Re-exports the entity machinery, the registries, the load seam, the
 * shared effects primitive, the `Result` type, the catalog port, and the
 * re-declared vocab.
 */
export * from "./bonus-pool"
export * from "./component"
export * from "./component-registry"
export * from "./effects.schema"
export * from "./entity"
export * from "./identity.schema"
export * from "./load-seam"
export * from "./ports"
export * from "./result"
export * from "./vocab"
