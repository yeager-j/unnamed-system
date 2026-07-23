import type { DungeonEvent } from "@workspace/game-v2/spatial/dungeon-event"
import { footprintOf, rectOfZone } from "@workspace/game-v2/spatial/footprints"
import type {
  GenerationLedger,
  MintEffect,
  MintRecord,
} from "@workspace/game-v2/spatial/generation-ledger.schema"
import type { MapZone } from "@workspace/game-v2/spatial/geometry.schema"
import type { MapInstanceEvent } from "@workspace/game-v2/spatial/map-instance-event"
import type {
  GenerationStub,
  MapInstanceState,
} from "@workspace/game-v2/spatial/map-instance.schema"
import { err, ok, type Result } from "@workspace/result"

import { findClosureCandidate } from "./closure"
import {
  anchorFromBearing,
  CLOSURE_RADIUS_FACTOR,
  edgeHalfPlane,
  fanBearings,
  pageSpacing,
  placeMintedZone,
  projectedPosition,
  type HalfPlane,
} from "./layout"
import { isTombstoned, pairLegal, templateLabel } from "./lint"
import { makeStream, type RngStream } from "./rng"
import { DEFAULT_OPTIONAL_EXIT_CULL } from "./start"
import type { TemplateSetContent, ZoneTemplate } from "./template-set.schema"

/**
 * The **expand-loop roller** (procedural-dungeons tech design D1/D6, UNN-642) —
 * the pure, server-resolved heart of the one-click expand gesture. One call, one
 * stub, exactly one of three outcomes, **never a dead click**:
 *
 * 1. **Mint** — a legal template rolled (two-way accepts, weights, uniques,
 *    tombstones honored), laid out through the directional fan, sprouting its
 *    own onward stubs. Costs a turn: `[advanceTurn, recordMint, advanceCursors]`.
 * 2. **Loop closure** — fires at the set's `closureChance`; the stub connects to
 *    a nearby legal existing zone. Free and non-qualifying: `[advanceCursors]`.
 * 3. **Dead end** — empty candidate pool (after the connector fallback) or an
 *    exhausted layout search; the stub is consumed as narrated collapsed rubble.
 *    Free and non-qualifying: `[advanceCursors]`.
 *
 * Randomness deviates from D1's published sketch deliberately: there is **no
 * injected `rng` dep**. The roller opens the ledger's named streams itself
 * (`makeStream(seed, purpose, cursor)`) because determinism lives in the
 * *cursors* — an injected raw `() => number` could neither report per-purpose
 * `consumed()` for `advanceCursors` nor honor the never-rewind law. Tests
 * control the seed, the cursors, and `closureChance` (0 forbids, 1 forces).
 *
 * Consumption per outcome (the table the laws pin):
 *
 * | outcome                        | closure | templates               | layout      |
 * | ------------------------------ | ------- | ----------------------- | ----------- |
 * | closeLoop                      | 1       | 0                       | 0           |
 * | dead end (empty pool)          | 1       | 0                       | 0           |
 * | dead end (no-space after pick) | 1       | 1                       | 0           |
 * | mint, random pick              | 1       | 1 + optional-exit culls | child count |
 * | mint, connector fallback       | 1       | optional-exit culls     | child count |
 * | mint, forced                   | 0       | optional-exit culls     | child count |
 *
 * The closure draw is **unconditional on the random path** (fixed consumption):
 * it makes "every random outcome consumed a roll" true by construction — the
 * zod-valid non-empty `advanceCursors` D4 requires — and the closure cursor
 * counts expansion attempts, a clean law. The template pick is consume-as-needed
 * (an empty-pool pick draw would buy nothing), and the **layout** stream draws
 * one per surviving child exit — the fan's per-exit orientation jitter — but
 * only after a successful placement (a no-space dead end never fans).
 */

export type ExpansionError =
  // Context resolution — the executor screens the benign consumed-stub case
  // *before* calling, so these two indicate corrupt state, not a retry.
  | "unknown-stub"
  | "unknown-parent-zone"
  // Forced-pick refusals (D7 fudging philosophy caps at hard ledger/liveness
  // invariants: the DM may override weights and sockets, never uniqueness or a
  // tombstone).
  | "unknown-template"
  | "template-tombstoned"
  | "unique-already-minted"
  // Forced path only — the bounded layout search found no room. The random path
  // resolves the same failure as a dead end (never a dead click); the forced
  // path surfaces it because silently consuming the stub the DM aimed a
  // specific template at would be hostile.
  | "no-space"

export interface ExpansionDeps {
  set: TemplateSetContent
  instanceState: MapInstanceState
  ledger: GenerationLedger
  stubId: string
  /** Mints the zone id and child stub ids (house pattern, as in `start.ts`). */
  newId: () => string
}

export interface ExpansionOutcome {
  /** Exactly one of `mintZone` | `closeLoop` | `resolveDeadEnd`. */
  instanceEvents: MapInstanceEvent[]
  /** Mint: `[advanceTurn, recordMint, advanceCursors]` (the carve-vs-cross turn
   *  cost is the roller's call — minting space costs a turn, crossing into
   *  existing space doesn't). Closure/dead end: `[advanceCursors]`. A forced
   *  mint of a zero-optional-exit template consumes nothing and omits
   *  `advanceCursors` (its `consumed` record must be non-empty and positive). */
  dungeonEvents: DungeonEvent[]
}

/**
 * The P4 seam: which declarations this mint incremented/resolved. Nothing can
 * create a declaration until P4 (`declareSite` has no emitter), so the empty
 * list is vacuously correct — and if a declaration somehow existed, an empty
 * effects list merely under-qualifies it (fail-shallow, never a false resolve).
 * P4 replaces this one body with the qualifying/due-collision scheduler without
 * touching the mint emitter or the event assembly.
 */
function computeMintEffects(_ledger: GenerationLedger): MintEffect[] {
  return []
}

/** Max-plus-one over the surviving records — never a count: non-LIFO retract
 *  deletes records, and a count would re-issue a live sequence. */
function nextMintSequence(ledger: GenerationLedger): number {
  const sequences = Object.values(ledger.mints).map((mint) => mint.sequence)
  return sequences.length === 0 ? 0 : Math.max(...sequences) + 1
}

/**
 * Best-effort mint lineage for the closure grandparent rule (D6): among
 * generation-stamped connections *into* the parent (the mint reducer's
 * direction: `toZoneId` is the minted side), take `fromZoneId`, tie-broken by
 * lowest connection id so the pick is total. A closure *into* the parent can
 * shadow the true mint parent here — harmless, since every zone already
 * connected to the parent is excluded from closure candidacy anyway; the
 * explicit input only matters after a hand-deleted connection. Authored parents
 * (no generated inbound connection) yield `undefined`.
 */
function mintGrandparentOf(
  instanceState: MapInstanceState,
  parentZoneId: string
): string | undefined {
  let best: { connectionId: string; fromZoneId: string } | undefined
  for (const [connectionId, connection] of Object.entries(
    instanceState.geometry.connections
  )) {
    if (instanceState.generation.connections[connectionId] === undefined) {
      continue
    }
    if (connection.toZoneId !== parentZoneId) continue
    if (best === undefined || connectionId < best.connectionId) {
      best = { connectionId, fromZoneId: connection.fromZoneId }
    }
  }
  return best?.fromZoneId
}

/** Everything the pipeline resolves once from the stub before rolling. */
interface ExpansionContext {
  set: TemplateSetContent
  instanceState: MapInstanceState
  ledger: GenerationLedger
  stub: GenerationStub
  parent: MapZone
  parentTemplate: ZoneTemplate | undefined
  parentDepth: number
  pageId: string
  growth: "edge" | "open"
  spacing: number
  halfPlane: HalfPlane | undefined
  newId: () => string
}

function resolveContext(
  deps: ExpansionDeps
): Result<ExpansionContext, ExpansionError> {
  const stub = deps.instanceState.generation.stubs[deps.stubId]
  if (stub === undefined) return err("unknown-stub")
  const parent = deps.instanceState.geometry.zones[stub.zoneId]
  if (parent === undefined) return err("unknown-parent-zone")

  const { geometry } = deps.instanceState
  const pageId = parent.pageId
  // Growth is a page fact (D6), not a region setting.
  const growth = geometry.pages[pageId]?.growth ?? "edge"
  return ok({
    set: deps.set,
    instanceState: deps.instanceState,
    ledger: deps.ledger,
    stub,
    parent,
    // Tombstoned still resolves — tombstone gates random *appearance*, not
    // existing references (D2).
    parentTemplate:
      parent.templateKey !== undefined
        ? deps.set.templates[parent.templateKey]
        : undefined,
    parentDepth: deps.instanceState.generation.zones[parent.id]?.depth ?? 0,
    pageId,
    growth,
    spacing: pageSpacing(
      geometry,
      pageId,
      deps.instanceState.generation.connections
    ),
    halfPlane:
      growth === "edge"
        ? edgeHalfPlane(
            geometry,
            pageId,
            deps.instanceState.generation.startingZoneIds
          )
        : undefined,
    newId: deps.newId,
  })
}

/** Folds each stream's `consumed()` into the `advanceCursors` event; positive
 *  counts only, and no event at all when nothing was consumed (the schema
 *  refuses zero counts and an empty record buys nothing). */
function advanceCursorsEvent(
  streams: Record<string, RngStream>
): DungeonEvent | undefined {
  const consumed: Record<string, number> = {}
  for (const [purpose, stream] of Object.entries(streams)) {
    if (stream.consumed() > 0) consumed[purpose] = stream.consumed()
  }
  return Object.keys(consumed).length === 0
    ? undefined
    : { kind: "advanceCursors", consumed }
}

/**
 * The single mint emitter — the random pick, the connector fallback, and the
 * forced pick all pass through here, so the AC's "random and forced cannot
 * diverge" is structural: there is no second path to drift.
 *
 * Layout runs first (before the child-exit culls), so a `no-space` failure has
 * consumed no `templates` draws beyond the pick; the caller decides whether it
 * resolves as a dead end (random) or an error (forced).
 */
function emitMint(
  ctx: ExpansionContext,
  templateKey: string,
  template: ZoneTemplate,
  streams: Record<string, RngStream>,
  templatesStream: RngStream,
  layoutStream: RngStream
): Result<ExpansionOutcome, "no-space"> {
  const placed = placeMintedZone({
    geometry: ctx.instanceState.geometry,
    pageId: ctx.pageId,
    parentZoneId: ctx.stub.zoneId,
    bearing: ctx.stub.bearing,
    anchorSide: ctx.stub.anchor.side,
    // Templates carry no size; the mint stores none and renders/collides as the
    // M default — layout placed an M rect, so the two stay consistent.
    size: undefined,
    spacing: ctx.spacing,
    growth: ctx.growth,
    halfPlane: ctx.halfPlane,
  })
  if (!placed.ok) return err("no-space")

  const zoneId = ctx.newId()
  const zone: MapZone = {
    id: zoneId,
    // The zone schema requires a non-empty name; templateLabel is the one
    // label authority (trimmed name, else key).
    name: templateLabel(templateKey, template),
    description: template.description,
    dmNotes: template.dmNotes,
    position: placed.value,
    pageId: ctx.pageId,
    templateKey,
    ...(template.portalMapId !== undefined
      ? { portalMapId: template.portalMapId }
      : {}),
  }

  // Child stubs — the minted zone's onward frontier, mirroring start.ts's
  // per-zone body: non-optional exits survive; each optional exit consumes one
  // "templates" draw, kept or culled; the incoming minted connection debits one
  // exit slot (the mint-time analogue of start's authored-connection debit).
  let surviving = 0
  for (const exit of template.exits) {
    if (!exit.optional) {
      surviving += 1
      continue
    }
    const roll = templatesStream.next()
    if (roll >= DEFAULT_OPTIONAL_EXIT_CULL) surviving += 1
  }
  const budget = Math.max(0, surviving - 1)
  // Each child exit samples one "layout" draw for its orientation — the fan is
  // no longer a fixed geometric spread, so two seeds grow different shapes and
  // exits reach walls beyond the parent's heading (UNN-642 tuning). Consumed
  // only after a successful placement (a no-space dead end touched no layout).
  const bearings = fanBearings(
    ctx.stub.bearing,
    budget,
    ctx.growth,
    layoutStream.next
  )
  const footprint = footprintOf(undefined)
  const childStubs: GenerationStub[] = bearings.map((bearing) => {
    const id = ctx.newId()
    return {
      id,
      zoneId,
      bearing,
      anchor: anchorFromBearing(footprint, bearing),
    }
  })

  const record: MintRecord = {
    sequence: nextMintSequence(ctx.ledger),
    templateKey,
    unique: template.unique,
    // The retract inverse's spatial half (UNN-642): the consumed stub restored
    // byte-identical, and the sprouted children the strict leaf rule audits.
    stub: ctx.stub,
    childStubIds: childStubs.map((child) => child.id),
    effects: computeMintEffects(ctx.ledger),
  }

  const cursors = advanceCursorsEvent(streams)
  return ok({
    instanceEvents: [
      {
        kind: "mintZone",
        stubId: ctx.stub.id,
        zone,
        // Exit-id continuity (D10): the minted connection takes the stub's id.
        connectionId: ctx.stub.id,
        stubs: childStubs,
        provenance: {
          source: "generated",
          templateKey,
          depth: ctx.parentDepth + 1,
        },
      },
    ],
    dungeonEvents: [
      { kind: "advanceTurn" },
      { kind: "recordMint", zoneId, record },
      ...(cursors === undefined ? [] : [cursors]),
    ],
  })
}

/** The dead-end outcome — the stub consumed as narrated collapsed rubble. */
function deadEnd(
  ctx: ExpansionContext,
  streams: Record<string, RngStream>
): ExpansionOutcome {
  const cursors = advanceCursorsEvent(streams)
  return {
    instanceEvents: [{ kind: "resolveDeadEnd", stubId: ctx.stub.id }],
    dungeonEvents: cursors === undefined ? [] : [cursors],
  }
}

/** A template is mintable **for this ledger** — the uniqueness half of the
 *  candidate filter, shared by the pool, the connector, and the forced path. */
function uniqueFresh(
  ledger: GenerationLedger,
  templateKey: string,
  template: ZoneTemplate
): boolean {
  return !(template.unique && ledger.mintedUniqueKeys.includes(templateKey))
}

/**
 * Rolls one expansion for `stubId` — see the module doc for the outcome grammar
 * and consumption table. Pure and deterministic: the outcome is a function of
 * the deps alone (`newId` supplies identity, never randomness).
 *
 * `options.forcedTemplateKey` is the DM's force-pick (D8): it skips the closure
 * and pick draws and every soft filter — weight (weight-0 site-by-choice
 * templates exist to be force-picked) and two-way accepts (the click is the
 * DM's declaration) — refusing only an unknown key, a tombstoned template (a
 * deleted room should never reappear), and a spent unique (a hard ledger
 * invariant). Both paths share {@link emitMint}.
 */
export function rollExpansion(
  deps: ExpansionDeps,
  options?: { forcedTemplateKey?: string }
): Result<ExpansionOutcome, ExpansionError> {
  const resolved = resolveContext(deps)
  if (!resolved.ok) return resolved
  const ctx = resolved.value
  const { set, ledger } = ctx

  const templatesStream = makeStream(
    ledger.seed,
    "templates",
    ledger.streamCursors["templates"] ?? 0
  )
  const layoutStream = makeStream(
    ledger.seed,
    "layout",
    ledger.streamCursors["layout"] ?? 0
  )

  // ————— Forced path: no closure draw, no pick draw.
  if (options?.forcedTemplateKey !== undefined) {
    const key = options.forcedTemplateKey
    const template = set.templates[key]
    if (template === undefined) return err("unknown-template")
    if (isTombstoned(template)) return err("template-tombstoned")
    if (!uniqueFresh(ledger, key, template)) {
      return err("unique-already-minted")
    }
    return emitMint(
      ctx,
      key,
      template,
      { templates: templatesStream, layout: layoutStream },
      templatesStream,
      layoutStream
    )
  }

  // ————— Random path.
  const closureStream = makeStream(
    ledger.seed,
    "closure",
    ledger.streamCursors["closure"] ?? 0
  )
  const streams = {
    closure: closureStream,
    templates: templatesStream,
    layout: layoutStream,
  }

  // Closure stage — one unconditional draw (fixed consumption; the closure
  // cursor counts expansion attempts). Fires iff the draw lands under the
  // set's closureChance AND a legal candidate stands in radius; a fired roll
  // with no candidate falls through to the mint stage.
  const closureRoll = closureStream.next()
  if (closureRoll < set.closureChance) {
    const candidate = findClosureCandidate({
      geometry: ctx.instanceState.geometry,
      pageId: ctx.pageId,
      parentZoneId: ctx.stub.zoneId,
      grandparentZoneId: mintGrandparentOf(ctx.instanceState, ctx.stub.zoneId),
      projected: projectedPosition(
        rectOfZone(ctx.parent),
        ctx.stub.bearing,
        ctx.spacing
      ),
      radius: CLOSURE_RADIUS_FACTOR * ctx.spacing,
      acceptsZone: (zoneId) => {
        if (ctx.parentTemplate === undefined) return false
        const candidateZone = ctx.instanceState.geometry.zones[zoneId]
        if (candidateZone?.templateKey === undefined) return false
        const candidateTemplate = set.templates[candidateZone.templateKey]
        if (candidateTemplate === undefined) return false
        // Tombstone irrelevant here — the candidate zone already exists.
        return pairLegal(ctx.parentTemplate, candidateTemplate)
      },
      halfPlane: ctx.halfPlane,
    })
    if (candidate !== undefined) {
      const cursors = advanceCursorsEvent(streams)
      return ok({
        instanceEvents: [
          {
            kind: "closeLoop",
            stubId: ctx.stub.id,
            // Exit-id continuity (D10), same as the mint.
            connectionId: ctx.stub.id,
            toZoneId: candidate,
          },
        ],
        dungeonEvents: cursors === undefined ? [] : [cursors],
      })
    }
  }

  // Candidate pool — walk templateOrder (the schema-reconciled total order),
  // never Object.keys (jsonb order doctrine). An unresolvable/unbound parent
  // template yields an empty pool: graceful blob-boundary degradation through
  // the fallback chain rather than an error.
  const pool: { key: string; template: ZoneTemplate }[] = []
  for (const key of set.templateOrder) {
    const template = set.templates[key]
    if (template === undefined) continue
    if (isTombstoned(template)) continue
    if (template.weight <= 0) continue
    if (!uniqueFresh(ledger, key, template)) continue
    if (ctx.parentTemplate === undefined) continue
    if (!pairLegal(ctx.parentTemplate, template)) continue
    pool.push({ key, template })
  }

  if (pool.length > 0) {
    // Weighted pick — one draw, cumulative walk in templateOrder order.
    const totalWeight = pool.reduce(
      (sum, entry) => sum + entry.template.weight,
      0
    )
    const u = templatesStream.next() * totalWeight
    let cumulative = 0
    let picked = pool[pool.length - 1]!
    for (const entry of pool) {
      cumulative += entry.template.weight
      if (u < cumulative) {
        picked = entry
        break
      }
    }
    const minted = emitMint(
      ctx,
      picked.key,
      picked.template,
      streams,
      templatesStream,
      layoutStream
    )
    // The bounded layout search came up empty — for the random path that is a
    // dead end (never a dead click), not an error.
    return ok(minted.ok ? minted.value : deadEnd(ctx, streams))
  }

  // Empty pool → connector fallback (D9's lint rules exist because each of
  // these checks can fail): resolves, non-tombstoned, unique-fresh, pair-legal.
  const connectorKey = set.connectorTemplateKey
  const connector =
    connectorKey !== undefined ? set.templates[connectorKey] : undefined
  if (
    connectorKey !== undefined &&
    connector !== undefined &&
    !isTombstoned(connector) &&
    uniqueFresh(ledger, connectorKey, connector) &&
    ctx.parentTemplate !== undefined &&
    pairLegal(ctx.parentTemplate, connector)
  ) {
    const minted = emitMint(
      ctx,
      connectorKey,
      connector,
      streams,
      templatesStream,
      layoutStream
    )
    return ok(minted.ok ? minted.value : deadEnd(ctx, streams))
  }

  return ok(deadEnd(ctx, streams))
}
