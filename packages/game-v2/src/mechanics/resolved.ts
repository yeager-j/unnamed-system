import type { MechanicKind } from "@workspace/game-v2/kernel/vocab/mechanics"
import type { MechanicState } from "@workspace/game-v2/mechanics/mechanics.schema"

/**
 * The **resolved** active-mechanic read-unit `resolveEntity` emits — the
 * serializable subset of {@link import("./active-mechanic").ActiveMechanic} (its
 * `kind` + `state`, dropping the non-serializable `definition`). `resolveEntity`
 * already computes the active mechanics for the form-swap + effects fold; surfacing
 * them here lets every resolved-encounter-view consumer read "which mechanic is
 * active, in what state" off the {@link
 * import("@workspace/game-v2/kernel/component-registry").ResolvedComponentRegistry}
 * view — without re-walking the authored `Mechanics` component (which never reaches
 * the resolved entity).
 *
 * Like `pendingEffects`, it is a display/DM-side read-unit dropped from every watcher
 * by the redaction table (`DROP_FROM_ALL`) — internal state (Frenzy pain, Perfection
 * rank) never belongs on the watch wire.
 */
export interface ResolvedActiveMechanic {
  kind: MechanicKind
  state: MechanicState
}
