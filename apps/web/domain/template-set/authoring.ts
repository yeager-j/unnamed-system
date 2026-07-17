/**
 * The app-side seam for the Template Set editor: the engine's pure authoring
 * contracts re-exported so `app/**`/`components/**` source them from `@/domain/**`
 * (the route + kit tiers are hard-gated against `@workspace/game*`; only
 * `domain`/`lib` may import the engine). Pure re-exports — the schema, its types,
 * the advisory lint, and the d100 projection — with no shaping of its own; the
 * one import boundary a future engine move would touch (the
 * `enemy-catalog-view.ts` pattern).
 */
export {
  templateSetContentSchema,
  tableEntrySchema,
  contentTableRowSchema,
  contentTableSchema,
  zoneTemplateSchema,
  zoneTemplateSiteSchema,
  zoneTemplateExitSchema,
  contentRollSchema,
  d100Ranges,
  lintTemplateSet,
  DEFAULT_CLOSURE_CHANCE,
} from "@workspace/game-v2/generation"
export type {
  TemplateSetContent,
  TableEntry,
  ContentTable,
  ContentTableRow,
  ZoneTemplate,
  ZoneTemplateSite,
  ZoneTemplateExit,
  ContentRoll,
  D100Range,
  LintFinding,
  LintRule,
  LintVocab,
} from "@workspace/game-v2/generation"
