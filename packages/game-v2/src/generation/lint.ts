import type { TemplateSetContent, ZoneTemplate } from "./template-set.schema"

/**
 * The set **lint** (tech design §3, D9; PRD, *Template Sets*) — a v1 requirement,
 * not a nicety. Pure advisory validations over a {@link TemplateSetContent}: they
 * surface authoring mistakes the generation roll would otherwise trip over
 * (unsatisfiable adjacency, a missing empty-pool connector, dangling references)
 * but **never block the autosave**, exactly like `spatial/geometry-warnings`. The
 * editor renders them in a lint rail; each finding selects the offending item.
 *
 * Catalog membership is **injected** through {@link LintVocab}, never imported —
 * the same ports-not-catalog discipline `depcheck.mjs` hard-gates on engine
 * logic. The lint validates a reference's *referent* (does this enemy key exist?),
 * which only the app-composed vocab knows; the schema validates only its *shape*.
 */

/** The catalog/world membership the lint resolves references against. `mapIds` is
 *  optional: the portal rule only runs when the caller supplies the user's Map
 *  ids, so a set editor without them simply skips portal-target checks. */
export interface LintVocab {
  enemyKeys: ReadonlySet<string>
  itemKeys: ReadonlySet<string>
  mapIds?: ReadonlySet<string>
}

/** The closed set of lint rules (tech design §3). */
export type LintRule =
  | "unmintable-template"
  | "missing-connector"
  | "non-universal-connector"
  | "dangling-table-ref"
  | "unresolvable-enemy-ref"
  | "unresolvable-item-ref"
  | "unresolvable-portal-ref"
  | "site-missing-declaration-defaults"

/** One advisory finding. `target` names the item the editor selects when the
 *  finding is clicked: a `template`/`table` by its key, or the `set` itself. */
export interface LintFinding {
  rule: LintRule
  message: string
  target: { kind: "template" | "table" | "set"; key?: string }
}

/** A template paired with its authoritative record key (never the possibly-stale
 *  `template.key` field) — the identity every rule reasons over. */
interface KeyedTemplate {
  key: string
  template: ZoneTemplate
}

/** Tombstone gates random appearance and the checklist; existing references
 *  still resolve. Shared with the roller (UNN-642). */
export const isTombstoned = (template: ZoneTemplate): boolean =>
  template.tombstoned === true

/** A template is a **site** — the checklist's unique-and-portal templates
 *  (PRD:133) — when it is unique or bound to a portal Map. */
const isSite = (template: ZoneTemplate): boolean =>
  template.unique || template.portalMapId !== undefined

const intersects = (a: readonly string[], b: readonly string[]): boolean => {
  const set = new Set(b)
  return a.some((value) => set.has(value))
}

/**
 * **Two-way** pair legality (the socket rule flattened to template granularity):
 * a template `a` may sit adjacent to `b` iff each side's `tags` satisfies the
 * other's `accepts`. Symmetric by construction. Exported (UNN-642) as the one
 * adjacency authority — the roller's candidate pool and closure predicate must
 * agree with the lint, or an "unmintable" finding and a real roll could diverge.
 */
export const pairLegal = (a: ZoneTemplate, b: ZoneTemplate): boolean =>
  intersects(a.tags, b.accepts) && intersects(b.tags, a.accepts)

/** The display/name-fallback authority: a template's trimmed name, else its key.
 *  Exported (UNN-642) so the minted Zone's `name` (schema requires min(1)) can't
 *  drift from the label the lint and editor show. */
export const templateLabel = (key: string, template: ZoneTemplate): string =>
  template.name.trim() || key

/**
 * Runs every lint rule over `content`, resolving references against `vocab`.
 * Returns all findings (advisory — the caller never blocks on them). Rules:
 *
 * - **unmintable-template** — a non-tombstoned template with no legal partner.
 *   Partners are all non-tombstoned templates (weight-0 count — they exist by
 *   declaration); a non-unique template may partner itself, a unique one may not.
 * - **missing-connector** — `connectorTemplateKey` unset, dangling, or tombstoned.
 * - **non-universal-connector** — a valid connector that some non-tombstoned
 *   template is not pair-legal with (so the empty-pool fallback could still fail).
 * - **dangling-table-ref** — a template `contentRolls` naming an absent table.
 * - **unresolvable-enemy-ref / unresolvable-item-ref** — a table entry whose
 *   catalog key is not in the vocab.
 * - **unresolvable-portal-ref** — a `portalMapId` not among `vocab.mapIds` (only
 *   when `mapIds` is provided).
 * - **site-missing-declaration-defaults** — a site (unique or portal) with no
 *   `site` block, so the checklist has no defaults to present.
 */
export function lintTemplateSet(
  content: TemplateSetContent,
  vocab: LintVocab
): LintFinding[] {
  const findings: LintFinding[] = []
  const keyed: KeyedTemplate[] = Object.entries(content.templates).map(
    ([key, template]) => ({ key, template })
  )
  const partners = keyed.filter(({ template }) => !isTombstoned(template))

  for (const { key, template } of keyed) {
    if (isTombstoned(template)) continue

    const hasPartner = partners.some(
      (candidate) =>
        !(candidate.key === key && template.unique) &&
        pairLegal(template, candidate.template)
    )
    if (!hasPartner) {
      findings.push({
        rule: "unmintable-template",
        message: `"${templateLabel(key, template)}" has no legal neighbour — nothing satisfies its accepts/tags both ways, so it can never be minted.`,
        target: { kind: "template", key },
      })
    }
  }

  const connectorKey = content.connectorTemplateKey
  const connector =
    connectorKey !== undefined ? content.templates[connectorKey] : undefined
  if (!connector || isTombstoned(connector)) {
    findings.push({
      rule: "missing-connector",
      message:
        "No always-legal connector template is designated, so an empty-pool expansion has no fallback but a dead end.",
      target: { kind: "set" },
    })
  } else {
    for (const { key, template } of partners) {
      if (!pairLegal(connector, template)) {
        findings.push({
          rule: "non-universal-connector",
          message: `The connector is not legal beside "${templateLabel(key, template)}", so it can't rescue every empty-pool socket.`,
          target: { kind: "template", key },
        })
      }
    }
  }

  for (const { key, template } of keyed) {
    for (const roll of template.contentRolls) {
      if (!content.tables[roll.tableKey]) {
        findings.push({
          rule: "dangling-table-ref",
          message: `"${templateLabel(key, template)}" rolls on a table that doesn't exist.`,
          target: { kind: "template", key },
        })
      }
    }

    if (
      template.portalMapId !== undefined &&
      vocab.mapIds !== undefined &&
      !vocab.mapIds.has(template.portalMapId)
    ) {
      findings.push({
        rule: "unresolvable-portal-ref",
        message: `"${templateLabel(key, template)}" is a portal to a Map you don't own or that no longer exists.`,
        target: { kind: "template", key },
      })
    }

    if (isSite(template) && template.site === undefined) {
      findings.push({
        rule: "site-missing-declaration-defaults",
        message: `"${templateLabel(key, template)}" is a site (unique or portal) but has no declaration defaults for the delve checklist.`,
        target: { kind: "template", key },
      })
    }
  }

  for (const [key, table] of Object.entries(content.tables)) {
    const label = table.name.trim() || key
    for (const row of table.rows) {
      for (const entry of row.entries) {
        if (entry.kind === "enemy" && !vocab.enemyKeys.has(entry.enemyKey)) {
          findings.push({
            rule: "unresolvable-enemy-ref",
            message: `Table "${label}" references an unknown enemy.`,
            target: { kind: "table", key },
          })
        }
        if (entry.kind === "item" && !vocab.itemKeys.has(entry.itemKey)) {
          findings.push({
            rule: "unresolvable-item-ref",
            message: `Table "${label}" references an unknown item.`,
            target: { kind: "table", key },
          })
        }
      }
    }
  }

  return findings
}
