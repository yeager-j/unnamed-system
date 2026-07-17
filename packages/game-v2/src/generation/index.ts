/**
 * The `generation/` public surface — the pure grammar layer for procedural
 * dungeons (tech design §3). P1 ships the authoring contracts: the Template Set
 * jsonb schema, the `d100Ranges` weight projection, and the advisory
 * `lintTemplateSet`. The generation runtime (roll/layout/closure/fold/graft) lands
 * in P3+. Like `spatial/`, this slice imports `kernel/` shapes only and takes its
 * catalog membership injected (`LintVocab`), never value-importing `catalog/`.
 */
export * from "./template-set.schema"
export * from "./d100-ranges"
export * from "./lint"
