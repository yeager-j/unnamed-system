/**
 * The `visibility` domain — capability/relationship-driven redaction (CD11, CD12,
 * CD17; ADR §2.6/§2.10). One enumerated `(component × relationship)` policy table
 * ({@link VISIBILITY}) is the single source of truth; {@link visibleEntity} is a
 * pure fold of it over a participant's merged participant-view, dropping a `drop` cell's
 * key **structurally** (absent, never null). {@link relationship} computes the
 * viewer↔entity {@link Relationship} once (ownership by capability, so a charmed PC
 * reads `own` to its controller and `opponent` to its old party), and {@link
 * projectEncounterSnapshot} sits above as the default-deny session-field envelope.
 * {@link engagedWith} reads the public Engagement component (`[]` when Free/mapless,
 * CD17). Supersedes v1's hand-coded two-arm `projectPlayerSnapshot`.
 */
export {
  relationship,
  type Relationship,
  type Viewer,
  type RelationshipSubject,
} from "./relationship"
export type { TrustedViewer } from "./trusted-viewer"
export {
  VISIBILITY,
  type Visibility,
  type ProjectableKey,
  type ProjectableKeyInvariant,
} from "./visibility-table"
export { visibleEntity } from "./visible-entity"
export { engagedWith } from "./engaged-with"
export {
  projectEncounterSnapshot,
  type VisibleCombatant,
  type EncounterSnapshot,
  type EncounterSnapshotMeta,
  type CurrentActorView,
} from "./snapshot"
export {
  projectSpatialEncounterSnapshot,
  projectDungeonSnapshot,
  type SpatialEncounterSnapshot,
  type SnapshotZone,
  type SnapshotConnection,
  type SnapshotExit,
  type SnapshotEnchantment,
  type DungeonSnapshot,
  type DungeonSnapshotCombat,
  type DungeonSnapshotZone,
  type DungeonSnapshotToken,
  type DungeonSnapshotMeta,
  type DungeonRosterEntry,
  type DungeonPool,
} from "./spatial-snapshot"
