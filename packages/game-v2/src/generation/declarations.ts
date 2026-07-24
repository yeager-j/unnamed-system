import type { DungeonEvent } from "@workspace/game-v2/spatial/dungeon-event"
import type {
  Declaration,
  GenerationLedger,
  MintEffect,
} from "@workspace/game-v2/spatial/generation-ledger.schema"
import type { MapGeometry } from "@workspace/game-v2/spatial/geometry.schema"
import { err, ok, type Result } from "@workspace/result"

import { isTombstoned, templateLabel } from "./lint"
import { makeStream } from "./rng"
import {
  zoneTemplateSiteSchema,
  type TemplateSetContent,
} from "./template-set.schema"

/** The authored urgency presets for ordinary site declarations. */
export const SITE_URGENCY_K = {
  session: 6,
  eventually: 15,
} as const

/** An authored declaration urgency exposed by the delve-setup checklist. */
export type SiteUrgency = keyof typeof SITE_URGENCY_K

/** The declaration intent the authority resolves into a concrete K value. */
export type SiteDeclarationIntent = SiteUrgency | "force-place"

/** One server-derived site row for setup and force-place controls. */
export interface SiteChecklistItem {
  templateKey: string
  name: string
  appearByDefault: boolean
  defaultMinDepth: number
  defaultUrgency: SiteUrgency
  unique: boolean
  authoredZoneId?: string
}

/**
 * Derives the Region's ordered site catalog from its live Template Set.
 * Tombstoned templates disappear from new-declaration surfaces while existing
 * declarations remain resolvable by the scheduler.
 */
export function siteChecklistItems(
  set: TemplateSetContent,
  geometry?: MapGeometry
): SiteChecklistItem[] {
  const authoredZoneIds = new Map<string, string[]>()
  if (geometry !== undefined) {
    for (const zone of Object.values(geometry.zones)) {
      if (zone.templateKey === undefined) continue
      const ids = authoredZoneIds.get(zone.templateKey) ?? []
      ids.push(zone.id)
      authoredZoneIds.set(zone.templateKey, ids)
    }
  }

  const items: SiteChecklistItem[] = []
  for (const templateKey of set.templateOrder) {
    const template = set.templates[templateKey]
    if (template === undefined || isTombstoned(template)) continue
    if (!template.unique && template.portalMapId === undefined) continue
    const site = zoneTemplateSiteSchema.parse(template.site ?? {})
    const authoredZoneId = authoredZoneIds
      .get(templateKey)
      ?.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))[0]
    items.push({
      templateKey,
      name: templateLabel(templateKey, template),
      appearByDefault: site.appearByDefault,
      defaultMinDepth: site.defaultMinDepth,
      defaultUrgency: site.defaultUrgency,
      unique: template.unique,
      ...(authoredZoneId === undefined ? {} : { authoredZoneId }),
    })
  }
  return items
}

export type DeclareSiteError = "unseeded-ledger" | "site-already-pending"

/**
 * Emits one fully resolved declaration plus its named-stream cursor advance.
 * Identity, sequence, K, and the hidden placement index are all authority-owned;
 * callers provide only intent and the optional authored-zone resolution.
 */
export function emitSiteDeclaration(input: {
  ledger: GenerationLedger
  templateKey: string
  minDepth: number
  intent: SiteDeclarationIntent
  resolvedZoneId?: string
  newId: () => string
}): Result<DungeonEvent[], DeclareSiteError> {
  if (input.ledger.seed === "") return err("unseeded-ledger")
  if (
    input.ledger.declarations.some(
      (declaration) =>
        declaration.templateKey === input.templateKey &&
        declaration.resolvedZoneId === undefined
    )
  ) {
    return err("site-already-pending")
  }

  const k = input.intent === "force-place" ? 1 : SITE_URGENCY_K[input.intent]
  const stream = makeStream(
    input.ledger.seed,
    "draws",
    input.ledger.streamCursors["draws"] ?? 0
  )
  const secretIndex = Math.floor(stream.next() * k) + 1
  const sequences = input.ledger.declarations.map(
    (declaration) => declaration.sequence
  )
  const sequence = sequences.length === 0 ? 0 : Math.max(...sequences) + 1
  const declaration: Declaration = {
    id: input.newId(),
    sequence,
    templateKey: input.templateKey,
    minDepth: input.minDepth,
    k,
    secretIndex,
    qualifyingCount: 0,
    ...(input.resolvedZoneId === undefined
      ? {}
      : { resolvedZoneId: input.resolvedZoneId }),
  }

  return ok([
    { kind: "declareSite", declaration },
    { kind: "advanceCursors", consumed: { draws: stream.consumed() } },
  ])
}

/** Whether random selection must withhold this template for a pending draw. */
export function isTemplateWithdrawn(
  ledger: GenerationLedger,
  templateKey: string
): boolean {
  return ledger.declarations.some(
    (declaration) =>
      declaration.templateKey === templateKey &&
      declaration.resolvedZoneId === undefined
  )
}

/**
 * Selects the one declaration whose template replaces the next qualifying
 * random mint. Force-place declarations preempt ordinary declarations; ties
 * preserve creation sequence.
 */
export function scheduledDeclaration(
  ledger: GenerationLedger,
  mintedDepth: number
): Declaration | undefined {
  return ledger.declarations
    .filter(
      (declaration) =>
        declaration.resolvedZoneId === undefined &&
        mintedDepth >= declaration.minDepth &&
        declaration.qualifyingCount + 1 >= declaration.secretIndex
    )
    .sort((a, b) => {
      const aForce = a.k === 1
      const bForce = b.k === 1
      if (aForce !== bForce) return aForce ? -1 : 1
      return a.sequence - b.sequence
    })[0]
}

/**
 * Records the exact declaration effects of a successful mint. Every eligible
 * declaration advances; the one whose template minted resolves, including an
 * explicit force-pick before its hidden due index.
 */
export function mintDeclarationEffects(
  ledger: GenerationLedger,
  mintedDepth: number,
  templateKey: string
): MintEffect[] {
  return ledger.declarations.flatMap((declaration) => {
    if (declaration.resolvedZoneId !== undefined) return []
    const incremented = mintedDepth >= declaration.minDepth
    const resolved = declaration.templateKey === templateKey
    return incremented || resolved
      ? [{ declarationId: declaration.id, incremented, resolved }]
      : []
  })
}
