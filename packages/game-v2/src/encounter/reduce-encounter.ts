import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial/map-instance-event"
import type { MapInstanceState } from "@workspace/game-v2/spatial/map-instance.schema"
import {
  addOccupant,
  removeOccupant,
} from "@workspace/game-v2/spatial/occupancy"
import { reduceMapInstance as createReduceMapInstance } from "@workspace/game-v2/spatial/reduce-map-instance"

import { createReduceSession } from "./reduce-session"
import type { Session } from "./session"
import type { CombatEvent } from "./session-event"

/**
 * The pure **composition tier** over the combat {@link Session} **and** the spatial
 * {@link MapInstanceState} (spatial ADR §2.9 — the cross-track join). PR2's combat
 * root carried the instance **opaque**; this PR fills it in: `EncounterState` pairs
 * the session with the concrete Map-Instance state, and the root reducer routes each
 * event to the arm that owns it.
 */
export interface EncounterState {
  session: Session
  mapInstance: MapInstanceState
}

/**
 * The events the {@link createReduceEncounter} root dispatches: the generic combat
 * wire ({@link CombatEvent} → the session reducer) **and** the spatial wire ({@link
 * MapInstanceEvent} → `reduceMapInstance`). The two unions are **disjoint by
 * `kind`**, so {@link isMapInstanceEvent} routes each unambiguously.
 */
export type EncounterEvent = CombatEvent | MapInstanceEvent

/**
 * Routes a trusted (already-validated) event to the spatial arm. The combat and
 * spatial unions share no `kind`, so the discriminated-union parse is effectively a
 * cheap discriminator check — it fails fast on a non-spatial `kind` without
 * deep-validating, matching the "route by parse, not a hand-maintained kind list"
 * doctrine the spatial event vocab documents. Only `.success` is read; the original
 * (branded) event is dispatched, never the re-parsed copy.
 */
function isMapInstanceEvent(event: EncounterEvent): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}

/**
 * Builds the pure `reduceEncounter` root (spatial ADR §2.9). It routes each event to
 * the single reducer that owns it — {@link MapInstanceEvent} → `reduceMapInstance`
 * (the spatial arm), every other event → the session reducer — and **preserves the
 * same-ref no-op contract end-to-end** (R24.1): when the routed reducer returns its
 * input reference, this returns the original `EncounterState` reference rather than
 * allocating a new wrapper.
 *
 * The cross-row gestures that touch **both** the session roster and the Map-Instance
 * occupancy — the birth co-mint, the add/remove pairing, and combat-end's
 * `pruneCombat` — are **not** routed through this single-event switch (an
 * `addParticipant`'s placement zone isn't on the combat wire, and the co-mint must
 * control the shared id). They are the explicit pure helpers below ({@link
 * comintMapInstance}, {@link addParticipantPaired}, {@link removeParticipantPaired}),
 * which the impure two-row `guardMany` transaction (apps/web, C1) composes — the
 * version-guarded atomicity is a persistence concern, the pure state transition is
 * here.
 */
export function createReduceEncounter(newId: () => string) {
  const reduceSession = createReduceSession(newId)
  const reduceMapInstance = createReduceMapInstance(newId)

  return (state: EncounterState, event: EncounterEvent): EncounterState => {
    if (isMapInstanceEvent(event)) {
      const mapInstance = reduceMapInstance(state.mapInstance, event)
      return mapInstance === state.mapInstance
        ? state
        : { ...state, mapInstance }
    }
    const session = reduceSession(state.session, event)
    return session === state.session ? state : { ...state, session }
  }
}

/** A fresh, empty Map-Instance — no geometry, occupancy, enchantment, or reveal. The
 *  co-mint default for a mapless / standalone encounter; a delve passes the
 *  geometry-snapshotted Map-Instance as `base`. */
function emptyMapInstance(): MapInstanceState {
  return {
    geometry: { zones: {}, connections: {} },
    occupancy: {},
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
  }
}

/**
 * The **birth co-mint** (R1.3 / CD16): given a freshly-minted {@link Session} and a
 * `placement` of roster id → zone, lays down one occupancy token per **placed**
 * participant, **keyed by the participant's own id** — so `participantId === token
 * key` holds structurally (the keys are read off `session.participants`, they can't
 * disagree). An unplaced participant (absent from `placement`) gets no token, so
 * `zoneOf → undefined` stays honest (free-entry placement is the C2/C3 authoring
 * call, open-item #4; the engine reads placement presence either way). `base` carries
 * the snapshotted Map geometry for a delve; it defaults empty for a standalone
 * encounter. Pure — `addOccupant` never mutates `base`.
 */
export function comintMapInstance(
  session: Session,
  placement: Record<ParticipantId, string>,
  base: MapInstanceState = emptyMapInstance()
): MapInstanceState {
  let mapInstance = base
  for (const participant of session.participants) {
    const zoneId = placement[participant.id]
    if (zoneId === undefined) continue
    mapInstance = addOccupant(mapInstance, participant.id, {
      zoneId,
      engagement: { status: "free" },
    })
  }
  return mapInstance
}

/**
 * The `addParticipant ↔ addOccupant` paired cross-write (spatial ADR §2.9): runs the
 * session-reducer roster append **and** places the joiner's occupancy token in one
 * pure step, both keyed by the **same** id. The id is resolved here (the supplied
 * `setup.id`, else a single `newId()`) and threaded into the session event so the
 * roster slot and the token can't disagree — closing the gap where the roster
 * reducer would otherwise mint an id this helper can't see.
 */
export function addParticipantPaired(newId: () => string) {
  const reduceSession = createReduceSession(newId)
  return (
    state: EncounterState,
    event: Extract<CombatEvent, { kind: "addParticipant" }>,
    zoneId: string
  ): EncounterState => {
    const id = event.setup.id ?? asParticipantId(newId())
    const session = reduceSession(state.session, {
      ...event,
      setup: { ...event.setup, id },
    })
    const mapInstance = addOccupant(state.mapInstance, id, {
      zoneId,
      engagement: { status: "free" },
    })
    return { session, mapInstance }
  }
}

/**
 * The `removeParticipant ↔ removeOccupant`-sever paired cross-write (spatial ADR
 * §2.9; R6.3 / R23.2): drops the roster slot **and** the occupancy token, the latter
 * **severing every survivor's engagement** to the departed id (the obligation the
 * roster reducer deliberately omits). `newId` threads to the shared session reducer;
 * `removeParticipant` itself mints nothing.
 */
export function removeParticipantPaired(newId: () => string) {
  const reduceSession = createReduceSession(newId)
  return (
    state: EncounterState,
    event: Extract<CombatEvent, { kind: "removeParticipant" }>
  ): EncounterState => {
    const session = reduceSession(state.session, event)
    const mapInstance = removeOccupant(state.mapInstance, event.participantId)
    return { session, mapInstance }
  }
}
