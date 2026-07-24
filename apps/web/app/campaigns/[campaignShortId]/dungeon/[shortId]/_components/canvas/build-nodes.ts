import {
  connectionFogState,
  crossPageLinksForPage,
  firstPageId,
  isConnectionLocked,
  type CrossPageLink,
  type MapInstanceState,
  type MapZone,
} from "@workspace/game-v2/spatial"

import { type DungeonConnectionEdge as DungeonConnectionEdgeType } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/connection-edge"
import { GHOST_SIZE } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/stub-ghost-node"
import { type DungeonZoneToken } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node"
import {
  type CanvasNode,
  type DungeonCanvasMode,
  type DungeonRosterEntry,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import { connectionAriaLabel } from "@/components/shared/canvas/geometry-to-flow"
import type { RailRow, RosterView } from "@/domain/combat/view/roster-view"
import { zoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"
import { footprintOf } from "@/domain/map/view/footprints"

/** The party tokens standing in each Zone (play mode), keyed by Zone id. Tokens
 *  whose occupant isn't in the delve roster are dropped — during exploration the
 *  only such keys are leftover enemy-combatant tokens from a just-ended fight,
 *  pruned for real in UNN-469; rendering them as "Unknown" would mislead. Shared
 *  with the Edit-mode canvas (UNN-486), which draws the same chips as Zone overlays. */
export function tokensByZone(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>
): Record<string, DungeonZoneToken[]> {
  const byZone: Record<string, DungeonZoneToken[]> = {}
  for (const [characterId, token] of Object.entries(instance.occupancy)) {
    const entry = roster[characterId]
    if (!entry) continue
    ;(byZone[token.zoneId] ??= []).push({
      characterId,
      name: entry.name,
      portraitUrl: entry.portraitUrl,
      hp: entry.hp,
      sp: entry.sp,
    })
  }
  return byZone
}

/** A cross-page link plus the count of occupants/combatants standing in the far
 *  Zone — the console chip's badge, so a split party or fight stays loud. */
export type DungeonPageLink = CrossPageLink & { count: number }

function pageLinksFor(
  links: CrossPageLink[],
  zoneId: string,
  countFor: (farZoneId: string) => number
): DungeonPageLink[] {
  return links
    .filter((link) => link.zoneId === zoneId)
    .map((link) => ({ ...link, count: countFor(link.farZoneId) }))
}

/** Re-derive the React Flow node array from the (optimistic) Instance — the
 *  {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").DungeonCanvas} runs this on
 *  every Instance change, keyed off the {@link DungeonCanvasMode}: the exploration
 *  **play** board or the combat battlefield (UNN-536). One page at a time
 *  (UNN-586): zones filter to `activePageId` (default: first page in canonical
 *  order) and cross-page connections surface as chip data on the node. */
export function buildNodes(
  instance: MapInstanceState,
  mode: DungeonCanvasMode,
  activePageId?: string
): CanvasNode[] {
  const pageId = activePageId ?? firstPageId(instance.geometry)
  return mode.kind === "combat"
    ? buildCombatNodes(instance, mode.roster, pageId)
    : buildPlayNodes(instance, mode.roster, pageId)
}

function buildPlayNodes(
  instance: MapInstanceState,
  roster: Record<string, DungeonRosterEntry>,
  pageId: string
): CanvasNode[] {
  const byZone = tokensByZone(instance, roster)
  const links = crossPageLinksForPage(instance.geometry, pageId)
  const zoneNodes: CanvasNode[] = Object.values(instance.geometry.zones)
    .filter((zone) => zone.pageId === pageId)
    .map((zone) => {
      const { w, h } = footprintOf(zone.size)
      return {
        id: zone.id,
        type: "dungeonZone" as const,
        position: zone.position,
        draggable: false,
        width: w,
        height: h,
        style: { width: w, height: h },
        data: {
          zone,
          revealed: instance.reveal.revealedZoneIds.includes(zone.id),
          tokens: byZone[zone.id] ?? [],
          crossPageLinks: pageLinksFor(
            links,
            zone.id,
            (farZoneId) => byZone[farZoneId]?.length ?? 0
          ),
          // Affordance visibility only (UNN-642) — the server re-checks every
          // retract precondition; deliberately loose so refusal toasts teach
          // the finer rules (unrevealed, leaf, unoccupied) instead of the
          // client replicating them.
          retractable:
            instance.generation.zones[zone.id]?.source === "generated",
        },
      }
    })
  return [...zoneNodes, ...buildStubGhostNodes(instance, pageId)]
}

/** How far past the parent's rim a ghost sits — render-only (the real mint
 *  layout distance is the engine's spacing; this just floats the frontier
 *  legibly off the wall). */
const GHOST_DISTANCE = 80

/**
 * The exploration board's **stub ghosts** (UNN-590, D8): one inert dashed node
 * per generation stub whose parent Zone sits on the active page, floated off
 * the parent's rim along the stub's bearing. Derived at render — a stub stores
 * bearing + anchor, never a position. Combat and Edit boards deliberately skip
 * ghosts (P3a); the expand gesture arrives P3b.
 */
function buildStubGhostNodes(
  instance: MapInstanceState,
  pageId: string
): CanvasNode[] {
  return Object.values(instance.generation.stubs).flatMap((stub) => {
    const parent = instance.geometry.zones[stub.zoneId]
    if (parent === undefined || parent.pageId !== pageId) return []
    const { w, h } = footprintOf(parent.size)
    const center = {
      x: parent.position.x + w / 2,
      y: parent.position.y + h / 2,
    }
    // Rim exit point along the bearing, pushed out by the ghost distance.
    const rim = Math.min(w, h) / 2
    const distance = rim + GHOST_DISTANCE
    return [
      {
        id: `stub-ghost-${stub.id}`,
        type: "stubGhost" as const,
        position: {
          x: center.x + Math.cos(stub.bearing) * distance - GHOST_SIZE.w / 2,
          y: center.y + Math.sin(stub.bearing) * distance - GHOST_SIZE.h / 2,
        },
        draggable: false,
        selectable: false,
        width: GHOST_SIZE.w,
        height: GHOST_SIZE.h,
        style: { width: GHOST_SIZE.w, height: GHOST_SIZE.h },
        data: { stubId: stub.id, parentZoneName: parent.name },
      },
    ]
  })
}

/** The combatants standing in each Zone (combat mode), keyed by Zone id — grouped
 *  from the console {@link RosterView} by their live occupancy. Shared by the
 *  battlefield node build and the roster inspector, which rebuilds one zone's view. */
export function rowsByZone(
  instance: MapInstanceState,
  roster: RosterView
): Record<string, RailRow[]> {
  const byZone: Record<string, RailRow[]> = {}
  for (const row of [...roster.players, ...roster.enemies]) {
    const zoneId = instance.occupancy[row.id]?.zoneId
    if (zoneId === undefined) continue
    ;(byZone[zoneId] ??= []).push(row)
  }
  return byZone
}

/** The combat battlefield's nodes: each authored Zone with the combatants standing
 *  in it (grouped from the console {@link RosterView} by their occupancy zone), the
 *  both-sides-present **Engaged** flag, and the Zone's Bard Enchantment badge. The
 *  acting highlight + move affordances are read from the canvas context per node,
 *  not baked here. */
function buildCombatNodes(
  instance: MapInstanceState,
  roster: RosterView,
  pageId: string
): CanvasNode[] {
  const byZone = rowsByZone(instance, roster)
  const links = crossPageLinksForPage(instance.geometry, pageId)

  return Object.values(instance.geometry.zones)
    .filter((zone) => zone.pageId === pageId)
    .map((zone: MapZone) => {
      const rows = byZone[zone.id] ?? []
      const { w, h } = footprintOf(zone.size)
      return {
        id: zone.id,
        type: "dungeonCombatZone",
        position: zone.position,
        draggable: false,
        width: w,
        height: h,
        style: { width: w, height: h },
        data: {
          zone,
          revealed: instance.reveal.revealedZoneIds.includes(zone.id),
          rows,
          enchantment: zoneEnchantmentBadge(instance.enchantment, zone.id),
          crossPageLinks: pageLinksFor(
            links,
            zone.id,
            (farZoneId) => byZone[farZoneId]?.length ?? 0
          ),
        },
      }
    })
}

/** The Instance's connections as read-only rim-threshold floating edges. Not
 *  selectable (the console selects zones, not connections) but focusable, so the
 *  notches keep keyboard reach + pairing glow. */
export function buildEdges(
  instance: MapInstanceState,
  activePageId?: string
): DungeonConnectionEdgeType[] {
  const pageId = activePageId ?? firstPageId(instance.geometry)
  return Object.values(instance.geometry.connections)
    .filter(
      (connection) =>
        // Intra-page only — a cross-page connection renders as chips (UNN-586).
        instance.geometry.zones[connection.fromZoneId]?.pageId === pageId &&
        instance.geometry.zones[connection.toZoneId]?.pageId === pageId
    )
    .map((connection) => {
      const fromName =
        instance.geometry.zones[connection.fromZoneId]?.name ?? ""
      const toName = instance.geometry.zones[connection.toZoneId]?.name ?? ""
      const locked = isConnectionLocked(connection, instance.reveal)
      return {
        id: connection.id,
        type: "dungeonConnection",
        source: connection.fromZoneId,
        target: connection.toZoneId,
        selectable: false,
        focusable: true,
        ariaLabel: connectionAriaLabel(fromName, toName, {
          hidden: connection.hidden,
          locked,
        }),
        data: {
          fog: connectionFogState(connection, instance.reveal),
          locked,
          // The authored secret flag — distinct from the fog state, so the DM can
          // tell a deliberately-hidden passage apart from one players just haven't
          // discovered yet (which auto-surfaces as a silhouette on reveal).
          hidden: connection.hidden,
          fromName,
          toName,
        },
      }
    })
}
