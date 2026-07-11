import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { ActiveMechanic } from "@workspace/game-v2/mechanics/active-mechanic"
import { perfection } from "@workspace/game-v2/mechanics/warrior/perfection"

/**
 * A test-only **form-swap mechanic** fixture (UNN-502). No MVP mechanic declares
 * `activeForm`; this stands in for the imminent Shapechanger so the form-swap seam
 * — `activeForm` → `applyActiveForm` → `applyForm` → `resolve` — is provable now.
 * It reuses a real mechanic's identity/state (irrelevant to the form path) and only
 * overrides `activeForm`.
 */

/**
 * A doctrine-shaped bear form (D38: a form *is* another entity's components) —
 * capabilities, not capacity (UNN-600): a body carries its statline and kit;
 * `vitals`/`skillPool` are the self's and a form never authors them.
 */
export const bearForm: Entity["components"] = {
  attributes: { base: { strength: 6, magic: -2, agility: 3, luck: 0 } },
  affinities: { base: { fire: "weak" } },
}

/**
 * An {@link ActiveMechanic} whose `activeForm` returns `form` (pass `null` for the
 * not-shapechanged case). The `kind`/`state` are an arbitrary real mechanic — only
 * `definition.activeForm` and `state` feed `applyActiveForm`.
 */
export function shifterActive(
  form: Entity["components"] | null
): ActiveMechanic {
  return {
    kind: "perfection",
    state: { kind: "perfection", rank: 0 },
    definition: { ...perfection, activeForm: () => form },
  }
}
