import type { ParticipantViewComponents } from "@workspace/game-v2/encounter/participant-view"

import type { Relationship } from "./relationship"

/**
 * The redaction verdict for one `(component, relationship)` cell: `public` keeps
 * the component, `drop` omits its key **structurally** (absent on the wire, never
 * `null`). Binary by design (CD11) — field-level transforms like fog-clamping a
 * `zoneId` are a POST-fold concern the spatial projector composes over this table,
 * never a third verdict.
 */
export type Visibility = "public" | "drop"

/**
 * Every component key that can appear in a participant's **merged participant-view**
 * (resolved durable read-units ∪ overlay ∪ instance, CD14) — so the policy table
 * is **total over what redaction can actually see**. Because {@link VISIBILITY} is
 * checked `satisfies Record<ProjectableKey, …>`, a future component added to any of
 * the three homes is a **compile error** here until its visibility is decided
 * (the load-seam totality guarantee, applied to security).
 */
export type ProjectableKey = keyof ParticipantViewComponents

const PUBLIC_TO_ALL: Record<Relationship, Visibility> = {
  own: "public",
  ally: "public",
  opponent: "public",
  spectator: "public",
  dm: "public",
}

const DROP_FROM_ALL: Record<Relationship, Visibility> = {
  own: "drop",
  ally: "drop",
  opponent: "drop",
  spectator: "drop",
  dm: "drop",
}

/**
 * Stats (`attributes`/`affinities`): the two **drop rows** — public to those who
 * may know them (`own`/`ally`/`dm`), dropped to `opponent` **and** `spectator`
 * (RED-4, a security tightening over v1 which leaked PC attributes to anonymous
 * watchers). The only rows that vary by relationship.
 */
const STATS: Record<Relationship, Visibility> = {
  own: "public",
  ally: "public",
  opponent: "drop",
  spectator: "drop",
  dm: "public",
}

/**
 * **The single source of truth for redaction** (CD11; ADR §2.6) — one total
 * `(component × relationship) → public | drop` table. {@link
 * import("./visible-entity").visibleEntity} is a pure fold of this table over the
 * merged participant-view; it takes **no entity argument**, so a redaction decision lives
 * here and only here.
 *
 * Three row-shapes:
 * - **Public to all five** — observable battlefield/sheet state: `identity` +
 *   `presentation` (name/portrait, NAME-1/RED-3), `vitals`/`skillPool` (HP/SP,
 *   RED-2/RED-3), every overlay component (`allegiance`/`turnState`/`ailments`/
 *   `battleConditions`/`conditionDurations`/`counters`, RED-2), and the projected
 *   instance reads `position`/`engagement` (RED-2; `engagement` un-stubs
 *   `engagedWith`, CD17).
 * - **Stats, drop to opponent + spectator** — `attributes`, `affinities` (RED-4).
 * - **Drop from all five** — resolved read-units that never belong on a watch
 *   surface (`skills`/`talents`/`resources`/`exhaustion`/`archetypes` are sheet
 *   data, never in v1's snapshot; `pendingEffects` is a display-only DM producer
 *   that would leak attack math; `activeMechanics` is internal mechanic state —
 *   Frenzy pain, Perfection rank). Explicit rather than defaulted, so the security
 *   posture of every component is reviewed, not inferred.
 */
export const VISIBILITY = {
  identity: PUBLIC_TO_ALL,
  presentation: PUBLIC_TO_ALL,
  vitals: PUBLIC_TO_ALL,
  skillPool: PUBLIC_TO_ALL,
  allegiance: PUBLIC_TO_ALL,
  turnState: PUBLIC_TO_ALL,
  ailments: PUBLIC_TO_ALL,
  battleConditions: PUBLIC_TO_ALL,
  conditionDurations: PUBLIC_TO_ALL,
  counters: PUBLIC_TO_ALL,
  position: PUBLIC_TO_ALL,
  engagement: PUBLIC_TO_ALL,
  attributes: STATS,
  affinities: STATS,
  skills: DROP_FROM_ALL,
  talents: DROP_FROM_ALL,
  resources: DROP_FROM_ALL,
  exhaustion: DROP_FROM_ALL,
  archetypes: DROP_FROM_ALL,
  pendingEffects: DROP_FROM_ALL,
  activeMechanics: DROP_FROM_ALL,
} satisfies Record<ProjectableKey, Record<Relationship, Visibility>>

/**
 * Resolves to `T` only when `T` is `never`; any populated key-set fails the
 * `extends never` constraint and surfaces the offending keys in the error.
 * (Mirrors `encounter/disjointness.ts` — the build-time gate is `tsc --noEmit`.)
 */
type AssertEmpty<T extends never> = T

/**
 * **Security invariant, proven at build time:** every key the merged participant-view can
 * carry is policed by {@link VISIBILITY}. The `satisfies` above already forbids a
 * *missing* key; this catches the inverse drift — a participant-view key that the
 * {@link ProjectableKey} alias (or a future home) stops covering — so no component
 * can ever reach the wire without an explicit verdict (default-drop would only
 * hide it at runtime; this makes the omission un-compilable).
 */
export type ProjectableKeyInvariant = AssertEmpty<
  Exclude<keyof ParticipantViewComponents, keyof typeof VISIBILITY>
>
