import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"

import {
  DEFAULT_PAGE_ID,
  defaultPages,
  type MapConnection,
  type MapGeometry,
  type MapPage,
  type MapZone,
} from "../geometry.schema"
import type { MapInstanceEvent } from "../map-instance-event"
import type { MapInstanceState, MapToken } from "../map-instance.schema"
import { reduceMapInstance } from "../reduce-map-instance"

/**
 * Spatial-reducer test builders (S2–S4). Every slice defaults empty (blank
 * geometry/occupancy/enchantment/reveal); a test seeds only the spatial state its
 * transition reads — built from these helpers, never balance numbers. Cloned per call
 * so a mutation in one test can't leak into another. Mirrors v1's
 * `engine/__fixtures__/encounter.ts` map builders, re-typed for v2 (occupancy keyed by
 * opaque `tokenKey`; engagement targets branded `ParticipantId`).
 */

/** Brands a trusted test id as a {@link ParticipantId}. */
export const pid = asParticipantId

/** A {@link MapInstanceState}; override what a test asserts. */
export const makeMapInstanceState = (
  overrides: Partial<MapInstanceState> = {}
): MapInstanceState => ({
  geometry: { pages: defaultPages(), zones: {}, connections: {} },
  occupancy: {},
  enchantment: null,
  reveal: {
    revealedZoneIds: [],
    revealedConnectionIds: [],
    unlockedConnectionIds: [],
  },
  lastMovedTokenKey: null,
  ...overrides,
})

/** A {@link MapZone} with sensible defaults; override what a test asserts. */
export const makeZone = (
  id: string,
  overrides: Partial<MapZone> = {}
): MapZone => ({
  id,
  name: id,
  description: "",
  dmNotes: "",
  position: { x: 0, y: 0 },
  pageId: DEFAULT_PAGE_ID,
  ...overrides,
})

/** A {@link MapPage}; override what a test asserts. */
export const makePage = (
  id: string,
  overrides: Partial<MapPage> = {}
): MapPage => ({
  id,
  name: id,
  ...overrides,
})

/** A {@link MapConnection} between two zones; flags default off. */
export const makeConnection = (
  id: string,
  fromZoneId: string,
  toZoneId: string,
  overrides: Partial<MapConnection> = {}
): MapConnection => ({
  id,
  fromZoneId,
  toZoneId,
  hidden: false,
  locked: false,
  ...overrides,
})

/**
 * A {@link MapGeometry} from zone + connection lists, keyed by id — the rich shape the
 * Instance carries. Pass to `makeMapInstanceState({ geometry })`. `pages` defaults to
 * the default page **unioned with every page the given zones reference**, so a
 * `makeZone("z", { pageId: "p2" })` never dangles; pass `pages` explicitly to pin
 * names or an exact set.
 */
export const makeGeometry = (
  zones: MapZone[] = [],
  connections: MapConnection[] = [],
  pages?: MapPage[]
): MapGeometry => ({
  pages:
    pages !== undefined
      ? Object.fromEntries(pages.map((page) => [page.id, page]))
      : {
          ...defaultPages(),
          ...Object.fromEntries(
            zones
              .filter((zone) => zone.pageId !== DEFAULT_PAGE_ID)
              .map((zone) => [zone.pageId, makePage(zone.pageId)])
          ),
        },
  zones: Object.fromEntries(zones.map((zone) => [zone.id, zone])),
  connections: Object.fromEntries(connections.map((conn) => [conn.id, conn])),
})

/** A Free occupancy token in `zoneId`. */
export const free = (zoneId: string): MapToken => ({
  zoneId,
  engagement: { status: "free" },
})

/** An occupancy token in `zoneId` engaged with `targets` (branded). */
export const engaged = (zoneId: string, targets: string[]): MapToken => ({
  zoneId,
  engagement: {
    status: "engaged",
    targetCombatantIds: targets.map(asParticipantId),
  },
})

/** Applies one {@link MapInstanceEvent}; `newId` defaults to a stable counter so an
 *  `addZone` without an id is deterministic. */
export const reduceInstance = (
  state: MapInstanceState,
  event: MapInstanceEvent,
  newId: () => string = sequentialZoneIds()
): MapInstanceState => reduceMapInstance(newId)(state, event)

function sequentialZoneIds() {
  let n = 0
  return () => `zone-${n++}`
}
