import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"

/**
 * The swap verdict for one component under a form swap (UNN-600) — the ratified
 * doctrine is **"a form is a body; you bring your mind, your wounds, and your
 * capacity."** A form changes what you can *do*; the self keeps what you *are*.
 *
 * - `keep` — the self's: the entity's value survives, the form's is ignored.
 * - `override` — the body's, when authored: the form's value when present, else
 *   the entity's (a form that omits the component wears the entity's).
 * - `replace` — the body's, absolutely: the form's value or nothing. Absent means
 *   absent — a skill-less form leaves no intrinsic skills to silently inherit.
 * - `detach` — the entity's value survives with its `active` selection nulled
 *   (the roster/Mastery persist; the active Archetype's statline yields to the
 *   form). Declarable only on components whose shape carries `active`.
 */
export type SwapPolicy = "keep" | "override" | "replace" | "detach"

/**
 * Restricts `detach` to components that have an `active` selection to null —
 * declaring it on any other component is a compile error, which is what makes
 * the generic `detach` arm in {@link applyForm} sound.
 */
type SwapPolicyFor<K extends keyof ComponentRegistry> =
  ComponentRegistry[K] extends { active: unknown }
    ? SwapPolicy
    : Exclude<SwapPolicy, "detach">

/**
 * **The single source of truth for the form-swap merge** (UNN-600; the
 * redaction-table move applied to `applyForm`): one total
 * `component → SwapPolicy` table. The mapped-type annotation makes it exhaustive
 * in both directions — a new registry component without a declared policy, or a
 * row for a key the registry stops carrying, is a **compile error** — so the
 * grow-point *asks* for the swap decision instead of silently inheriting merge
 * behavior. The ADR's prose rule ("anything that must survive a form swap is its
 * own component") is enforced here, not remembered.
 *
 * Row rationale (the 2026-07-11 ratified doctrine):
 * - **Body (`override`)** — `attributes`/`affinities` are the form's statline;
 *   `presentation` is the form's face (the token becomes the bear; observers
 *   observe a bear).
 * - **Body, absolutely (`replace`)** — `skills`: the form's list is the body's
 *   whole list. A Nyx aspect that authors no skills has none; it does not
 *   silently inherit the base entity's.
 * - **Capacity is the self (`keep`)** — `vitals`/`skillPool`/`path`/`level`:
 *   maxima always derive from the entity's own Level + Path, so depletion needs
 *   no graft and a small form is not a death cliff. A heartier form authors a
 *   `+hp` attribute effect through its mechanic's `effects()` — a delta on your
 *   bar, never a replacement of it.
 * - **Mind and possessions (`keep`)** — `identity`/`talents`/`virtues`/
 *   `narrative`/`manualBonuses`/`resources`/`exhaustion`/`equipment`: the self
 *   in any body. `mechanics` is `keep` for a harder reason: the form is
 *   *produced by* a mechanic, so a form that rewrote `mechanics` would feed back
 *   into the selection that chose it.
 * - **`detach`** — `archetypes`: roster and Mastery are progression (self); the
 *   active Archetype's statline yields to the form and would double-stack if it
 *   stayed attached.
 */
export const FORM_SWAP_POLICY: {
  [K in keyof ComponentRegistry]: SwapPolicyFor<K>
} = {
  identity: "keep",
  presentation: "override",
  attributes: "override",
  affinities: "override",
  vitals: "keep",
  skillPool: "keep",
  skills: "replace",
  talents: "keep",
  level: "keep",
  path: "keep",
  manualBonuses: "keep",
  archetypes: "detach",
  resources: "keep",
  exhaustion: "keep",
  mechanics: "keep",
  equipment: "keep",
  virtues: "keep",
  narrative: "keep",
}

/**
 * The **form layer** (D8 layer 2) as a generic fold of {@link FORM_SWAP_POLICY}
 * over the union of the two bags' keys — the swapped form (Shapechanger's bear, a
 * Nyx aspect) is itself just an entity's component bag (`Entity["components"]`),
 * carrying exactly the capability components it has. There is **no bespoke form
 * struct** and no per-component merge logic here: every swap decision is a row in
 * the table.
 */
export function applyForm(entity: Entity, form: Entity["components"]): Entity {
  const keys = new Set([
    ...Object.keys(entity.components),
    ...Object.keys(form),
  ]) as Set<keyof ComponentRegistry>

  const components: Entity["components"] = {}
  for (const key of keys) {
    setSwapped(components, key, entity.components[key], form[key])
  }

  return { id: entity.id, components }
}

function setSwapped<K extends keyof ComponentRegistry>(
  target: Entity["components"],
  key: K,
  own: ComponentRegistry[K] | undefined,
  formValue: ComponentRegistry[K] | undefined
): void {
  const value = swappedValue(key, own, formValue)
  if (value !== undefined) target[key] = value
}

function swappedValue<K extends keyof ComponentRegistry>(
  key: K,
  own: ComponentRegistry[K] | undefined,
  formValue: ComponentRegistry[K] | undefined
): ComponentRegistry[K] | undefined {
  const policy: SwapPolicy = FORM_SWAP_POLICY[key]
  switch (policy) {
    case "keep":
      return own
    case "override":
      return formValue ?? own
    case "replace":
      return formValue
    case "detach":
      return own === undefined ? undefined : detachActive(own)
  }
}

/**
 * The `detach` arm: the entity's component with its `active` selection nulled.
 * {@link SwapPolicyFor} guarantees `detach` is only declared on components whose
 * shape carries `active`, which is what makes the cast back to the component's
 * type sound.
 */
function detachActive<K extends keyof ComponentRegistry>(
  own: ComponentRegistry[K]
): ComponentRegistry[K] {
  return { ...own, active: null } as ComponentRegistry[K]
}
