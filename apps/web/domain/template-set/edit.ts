import { nanoid } from "nanoid"

import {
  contentTableSchema,
  zoneTemplateSchema,
  type ContentTable,
  type TemplateSetContent,
  type ZoneTemplate,
} from "./authoring"

/**
 * The pure content transforms the Template Set editor's forms call before handing
 * the whole re-derived blob to autosave (UNN-588). Every helper is an immutable
 * `TemplateSetContent → TemplateSetContent` step (spread, never mutate the input),
 * and every result stays a **fixed point** of `templateSetContentSchema.parse` —
 * the editor never re-parses between edits, so a transform that produced an
 * unparseable blob would only surface at the save boundary. Keys are opaque
 * `nanoid(8)` ids minted here (the schema imposes no format); a record's key and
 * its record's `key` field are kept in lockstep by these helpers.
 *
 * Pure model code — no `lib` runtime imports; types + schema come from the domain
 * seam (`./authoring`), not the engine directly.
 */

/** Strips `key` from an update patch so an edit can never rename a template/table
 *  out from under its record key (the record's own `key` field is authoritative,
 *  kept in sync by {@link addTemplate}/{@link addTable}). */
function withoutKey<T extends { key?: string }>(patch: T): Omit<T, "key"> {
  const copy = { ...patch }
  delete copy.key
  return copy
}

/** Mints a fresh template with an opaque `nanoid(8)` key and appends it to the
 *  display order. Returns the new key so the caller can select it. */
export function addTemplate(
  content: TemplateSetContent,
  name?: string
): { content: TemplateSetContent; key: string } {
  const key = nanoid(8)
  const template = zoneTemplateSchema.parse({
    key,
    name: name ?? "New template",
  })
  return {
    content: {
      ...content,
      templates: { ...content.templates, [key]: template },
      templateOrder: [...content.templateOrder, key],
    },
    key,
  }
}

/** Mints a fresh content table with an opaque `nanoid(8)` key and appends it to
 *  the display order. Returns the new key so the caller can select it. */
export function addTable(
  content: TemplateSetContent,
  name?: string
): { content: TemplateSetContent; key: string } {
  const key = nanoid(8)
  const table = contentTableSchema.parse({ key, name: name ?? "New table" })
  return {
    content: {
      ...content,
      tables: { ...content.tables, [key]: table },
      tableOrder: [...content.tableOrder, key],
    },
    key,
  }
}

/** Shallow-merges `patch` onto the template at `key`; a no-op if the key is
 *  absent. `key` is stripped from the patch — an update never renames the record. */
export function updateTemplate(
  content: TemplateSetContent,
  key: string,
  patch: Partial<ZoneTemplate>
): TemplateSetContent {
  const existing = content.templates[key]
  if (!existing) return content
  return {
    ...content,
    templates: {
      ...content.templates,
      [key]: { ...existing, ...withoutKey(patch) },
    },
  }
}

/** Shallow-merges `patch` onto the table at `key`; a no-op if the key is absent.
 *  `key` is stripped from the patch — an update never renames the record. */
export function updateTable(
  content: TemplateSetContent,
  key: string,
  patch: Partial<ContentTable>
): TemplateSetContent {
  const existing = content.tables[key]
  if (!existing) return content
  return {
    ...content,
    tables: {
      ...content.tables,
      [key]: { ...existing, ...withoutKey(patch) },
    },
  }
}

/** Sets the per-set loop-closure probability knob. */
export function setClosureChance(
  content: TemplateSetContent,
  closureChance: number
): TemplateSetContent {
  return { ...content, closureChance }
}

/** Designates (or clears, on `undefined`) the always-legal empty-pool fallback
 *  template. Clearing omits the key so the blob stays a clean parse fixed point. */
export function setConnectorTemplateKey(
  content: TemplateSetContent,
  key: string | undefined
): TemplateSetContent {
  if (key === undefined) {
    const { connectorTemplateKey: _dropped, ...rest } = content
    return rest
  }
  return { ...content, connectorTemplateKey: key }
}

/** Marks a template tombstoned — the non-destructive delete: it stops appearing in
 *  random rolls while existing references stay resolvable (PRD, *Template Sets*).
 *  A no-op if the key is absent. */
export function tombstoneTemplate(
  content: TemplateSetContent,
  key: string
): TemplateSetContent {
  return updateTemplate(content, key, { tombstoned: true })
}

/** Clears a template's tombstone, returning it to the random-roll pool. A no-op if
 *  the key is absent. */
export function restoreTemplate(
  content: TemplateSetContent,
  key: string
): TemplateSetContent {
  return updateTemplate(content, key, { tombstoned: false })
}

/**
 * The keys of templates a durable reference points at — the seam
 * {@link removeTemplate} consults to decide tombstone-vs-hard-delete. In P1 the
 * only durable reference is `connectorTemplateKey`; P2 extends this with seed-Map
 * bindings, pending declarations, and discovered-site entries.
 */
export function referencedTemplateKeys(
  content: TemplateSetContent
): ReadonlySet<string> {
  const keys = new Set<string>()
  if (content.connectorTemplateKey !== undefined)
    keys.add(content.connectorTemplateKey)
  return keys
}

/**
 * Removes a template. A **referenced** template (see {@link referencedTemplateKeys})
 * cannot vanish — a dangling reference would break the grammar — so it tombstones
 * instead. An unreferenced template is deleted from the record and spliced from the
 * display order. A no-op if the key is absent.
 */
export function removeTemplate(
  content: TemplateSetContent,
  key: string
): TemplateSetContent {
  if (referencedTemplateKeys(content).has(key))
    return tombstoneTemplate(content, key)
  if (!(key in content.templates)) return content

  const templates = { ...content.templates }
  delete templates[key]
  return {
    ...content,
    templates,
    templateOrder: content.templateOrder.filter((k) => k !== key),
  }
}

/**
 * Removes a content table from the record and splices the display order. Always a
 * hard delete — a template's `contentRolls` may still reference the removed table,
 * but a dangling `tableKey` is lint's advisory territory, not a blocked delete
 * (PRD, *Content rolls*). A no-op if the key is absent.
 */
export function removeTable(
  content: TemplateSetContent,
  key: string
): TemplateSetContent {
  if (!(key in content.tables)) return content

  const tables = { ...content.tables }
  delete tables[key]
  return {
    ...content,
    tables,
    tableOrder: content.tableOrder.filter((k) => k !== key),
  }
}
