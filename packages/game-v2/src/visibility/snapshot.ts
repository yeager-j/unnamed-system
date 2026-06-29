import type { ParticipantId } from "@workspace/game-v2/encounter/ids"
import type {
  ReadBag,
  ReadBagComponents,
} from "@workspace/game-v2/encounter/read-bag"
import type { Session } from "@workspace/game-v2/encounter/session"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import type { Viewer } from "./relationship"
import { visibleEntity } from "./visible-entity"

/**
 * One combatant as a watcher sees it — the `{ id, components }` shape of a
 * (redacted) entity with **no kind discriminant** (CD11/CD12). A dropped
 * component's key is **absent**, never `null`, so `"attributes" in
 * combatant.components` is `false` on the wire.
 *
 * **`id` is the participant / roster id**, not the entity id — it correlates with
 * {@link CurrentActorView.id} and the `engagement.targetCombatantIds` inside
 * `components`, which are all roster ids (a durable entity could appear on the
 * roster more than once; overlay + turn order key on the roster id, `session.ts`).
 * Ownership/relationship, by contrast, keys on the **entity** id (`bag.id`) — a
 * viewer owns characters/entities, not roster slots.
 */
export interface VisibleCombatant {
  id: ParticipantId
  components: Partial<ReadBagComponents>
}

/**
 * The acting combatant as the watch header shows it — the RED-5 public subset
 * (`{ id, name, side }`), or `null` before anyone is drafted / between rounds.
 * `id` is the participant / roster id (same namespace as {@link
 * VisibleCombatant.id}).
 */
export interface CurrentActorView {
  id: ParticipantId
  name: string
  side: CombatSide
}

/**
 * The encounter-**row** metadata the impure shell pairs with the pure {@link
 * Session} (it lives on the encounter row, not the session blob). `status` is the
 * DB lifecycle string (`draft`/`live`/…) — the engine doesn't own that vocab, so
 * it passes through opaque.
 */
export interface EncounterSnapshotMeta {
  status: string
  name: string
  campaignShortId: string
  version: number
}

/**
 * The redacted snapshot a watcher receives — the **default-deny whitelist** of
 * session-level fields (CD12; ADR §2.6). Extends {@link EncounterSnapshotMeta}
 * (the row fields) with the three projected session fields. A field is on the wire
 * **only** by appearing here, so a new session field is invisible until
 * whitelisted (the inverse of v1's leak-by-default). `instanceVersion` is omitted
 * (a spatial token the deferred spatial projector adds); `pendingEffects` never
 * appears (not whitelisted here, and dropped per-combatant by the visibility
 * table).
 */
export interface EncounterSnapshot extends EncounterSnapshotMeta {
  round: number
  currentActor: CurrentActorView | null
  combatants: VisibleCombatant[]
}

/**
 * Projects an encounter to its watcher-facing {@link EncounterSnapshot} (CD12; ADR
 * §2.6) — two single-purpose passes. The **envelope** selects only the whitelisted
 * session fields (viewer-uniform; the DM console reads the full session directly
 * and never goes through here). Each combatant is then redacted by {@link
 * visibleEntity} — the **only** relationship-driven step — over its pre-assembled
 * merged {@link ReadBag} (the UNN-516 loader produces these; resolve can't run in
 * the pure projector). Combatants stay in session (turn) order; name
 * disambiguation (NAME-3) is the encounter-view layer's job, so each combatant
 * carries its raw `identity` here.
 *
 * `engagedWith` is not a separate field: the public `engagement` component rides on
 * each {@link VisibleCombatant}, and {@link import("./engaged-with").engagedWith}
 * derives the ids (`[]` when Free/mapless, CD17).
 *
 * Each combatant is keyed by its **`participant.id`** (the roster id), not the
 * entity id its read-bag carries — so `combatants[].id` correlates with
 * `currentActor.id` and `engagement.targetCombatantIds`. The read-bags are keyed by
 * participant id (`readBags.get(participant.id)`); the bag's own `bag.id` is the
 * entity id, used only for ownership inside {@link visibleEntity}.
 */
export function projectEncounterSnapshot(
  session: Session,
  readBags: ReadonlyMap<ParticipantId, ReadBag>,
  viewer: Viewer,
  meta: EncounterSnapshotMeta
): EncounterSnapshot {
  const combatants: VisibleCombatant[] = []
  for (const participant of session.participants) {
    const bag = readBags.get(participant.id)
    // A participant the loader couldn't assemble a bag for is omitted rather than
    // rendered blank — the projector renders only what it is given.
    if (bag !== undefined) {
      combatants.push({
        id: participant.id,
        components: visibleEntity(bag, viewer),
      })
    }
  }

  return {
    status: meta.status,
    name: meta.name,
    campaignShortId: meta.campaignShortId,
    version: meta.version,
    round: session.round,
    currentActor: currentActorView(session, readBags),
    combatants,
  }
}

/**
 * The acting combatant's public `{ id, name, side }`, or `null` when no one is
 * acting (or the actor has no assembled bag). Name falls back to the id (never
 * blank, NAME-1); side reads the always-present overlay allegiance.
 */
function currentActorView(
  session: Session,
  readBags: ReadonlyMap<ParticipantId, ReadBag>
): CurrentActorView | null {
  const { currentActorId } = session
  if (currentActorId === null) return null

  const bag = readBags.get(currentActorId)
  if (bag === undefined) return null

  return {
    id: currentActorId,
    name: bag.components.identity?.name ?? currentActorId,
    side: bag.components.allegiance.side,
  }
}
