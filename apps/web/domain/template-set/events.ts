import { z } from "zod/v4"

import {
  contentRollSchema,
  contentTableRowSchema,
  zoneTemplateExitSchema,
  zoneTemplateSiteSchema,
  type ContentTable,
  type TemplateSetContent,
  type ZoneTemplate,
} from "./authoring"
import {
  addTable,
  addTemplate,
  removeTable,
  removeTemplate,
  restoreTemplate,
  setClosureChance,
  setConnectorTemplateKey,
  tombstoneTemplate,
  updateTable,
  updateTemplate,
} from "./edit"

const templatePatchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  dmNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  accepts: z.array(z.string()).optional(),
  exits: z.array(zoneTemplateExitSchema).optional(),
  weight: z.number().min(0).optional(),
  unique: z.boolean().optional(),
  portalMapId: z.string().nullable().optional(),
  site: zoneTemplateSiteSchema.nullable().optional(),
  contentRolls: z.array(contentRollSchema).optional(),
})

const tablePatchSchema = z.object({
  name: z.string().optional(),
  rows: z.array(contentTableRowSchema).optional(),
})

export const templateSetEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addTemplate"),
    key: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("duplicateTemplate"),
    sourceKey: z.string().min(1),
    key: z.string().min(1),
  }),
  z.object({
    kind: z.literal("updateTemplate"),
    key: z.string().min(1),
    patch: templatePatchSchema,
  }),
  z.object({ kind: z.literal("removeTemplate"), key: z.string().min(1) }),
  z.object({ kind: z.literal("restoreTemplate"), key: z.string().min(1) }),
  z.object({ kind: z.literal("tombstoneTemplate"), key: z.string().min(1) }),
  z.object({
    kind: z.literal("addTable"),
    key: z.string().min(1),
    name: z.string().optional(),
  }),
  z.object({
    kind: z.literal("duplicateTable"),
    sourceKey: z.string().min(1),
    key: z.string().min(1),
  }),
  z.object({
    kind: z.literal("updateTable"),
    key: z.string().min(1),
    patch: tablePatchSchema,
  }),
  z.object({ kind: z.literal("removeTable"), key: z.string().min(1) }),
  z.object({
    kind: z.literal("setClosureChance"),
    value: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal("setConnectorTemplateKey"),
    key: z.string().nullable(),
  }),
])

export type TemplateSetEvent = z.infer<typeof templateSetEventSchema>
export type TemplatePatch = z.infer<typeof templatePatchSchema>
export type TablePatch = z.infer<typeof tablePatchSchema>

function requireTemplate(content: TemplateSetContent, key: string): void {
  if (!content.templates[key]) throw new Error("template no longer exists")
}

function requireTable(content: TemplateSetContent, key: string): void {
  if (!content.tables[key]) throw new Error("table no longer exists")
}

function requireAvailableTemplateKey(
  content: TemplateSetContent,
  key: string
): void {
  if (content.templates[key])
    throw new Error("template event id is already used")
}

function requireAvailableTableKey(
  content: TemplateSetContent,
  key: string
): void {
  if (content.tables[key]) throw new Error("table event id is already used")
}

function applyTemplatePatch(
  content: TemplateSetContent,
  key: string,
  patch: TemplatePatch
): TemplateSetContent {
  const { portalMapId, site, ...values } = patch
  const normalized: Partial<ZoneTemplate> = values
  if (portalMapId !== undefined)
    normalized.portalMapId = portalMapId ?? undefined
  if (site !== undefined) normalized.site = site ?? undefined
  return updateTemplate(content, key, normalized)
}

function duplicateTemplate(
  content: TemplateSetContent,
  sourceKey: string,
  key: string
): TemplateSetContent {
  const source = content.templates[sourceKey]
  if (!source || content.templates[key]) return content
  const created = addTemplate(content, `${source.name} copy`, key).content
  return updateTemplate(created, key, {
    ...source,
    name: `${source.name} copy`,
  })
}

function duplicateTable(
  content: TemplateSetContent,
  sourceKey: string,
  key: string
): TemplateSetContent {
  const source = content.tables[sourceKey]
  if (!source || content.tables[key]) return content
  const created = addTable(content, `${source.name} copy`, key).content
  return updateTable(created, key, { ...source, name: `${source.name} copy` })
}

export function reduceTemplateSetEvent(
  content: TemplateSetContent,
  event: TemplateSetEvent
): TemplateSetContent {
  switch (event.kind) {
    case "addTemplate": {
      requireAvailableTemplateKey(content, event.key)
      return addTemplate(content, event.name, event.key).content
    }
    case "duplicateTemplate": {
      requireTemplate(content, event.sourceKey)
      requireAvailableTemplateKey(content, event.key)
      return duplicateTemplate(content, event.sourceKey, event.key)
    }
    case "updateTemplate": {
      requireTemplate(content, event.key)
      return applyTemplatePatch(content, event.key, event.patch)
    }
    case "removeTemplate": {
      requireTemplate(content, event.key)
      return removeTemplate(content, event.key)
    }
    case "restoreTemplate": {
      requireTemplate(content, event.key)
      return restoreTemplate(content, event.key)
    }
    case "tombstoneTemplate": {
      requireTemplate(content, event.key)
      return tombstoneTemplate(content, event.key)
    }
    case "addTable": {
      requireAvailableTableKey(content, event.key)
      return addTable(content, event.name, event.key).content
    }
    case "duplicateTable": {
      requireTable(content, event.sourceKey)
      requireAvailableTableKey(content, event.key)
      return duplicateTable(content, event.sourceKey, event.key)
    }
    case "updateTable": {
      requireTable(content, event.key)
      return updateTable(
        content,
        event.key,
        event.patch as Partial<ContentTable>
      )
    }
    case "removeTable": {
      requireTable(content, event.key)
      return removeTable(content, event.key)
    }
    case "setClosureChance":
      return setClosureChance(content, event.value)
    case "setConnectorTemplateKey": {
      if (event.key !== null) requireTemplate(content, event.key)
      return setConnectorTemplateKey(content, event.key ?? undefined)
    }
  }
}

export function reduceTemplateSetEvents(
  content: TemplateSetContent,
  events: readonly TemplateSetEvent[]
): TemplateSetContent {
  return events.reduce(reduceTemplateSetEvent, content)
}
