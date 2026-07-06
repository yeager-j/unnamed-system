import { z } from "zod/v4"

import { affinitiesSchema } from "@workspace/game-v2/affinities/affinities.schema"
import { archetypesSchema } from "@workspace/game-v2/archetypes/archetypes.schema"
import { attributesSchema } from "@workspace/game-v2/attributes/attributes.schema"
import { equipmentSchema } from "@workspace/game-v2/items/equipment.schema"
import type { ComponentRegistry } from "@workspace/game-v2/kernel/component-registry"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { identitySchema } from "@workspace/game-v2/kernel/identity.schema"
import { presentationSchema } from "@workspace/game-v2/kernel/presentation.schema"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"
import { mechanicsSchema } from "@workspace/game-v2/mechanics/mechanics.schema"
import { narrativeSchema } from "@workspace/game-v2/narrative/narrative.schema"
import { levelSchema } from "@workspace/game-v2/progression/level.schema"
import { manualBonusesSchema } from "@workspace/game-v2/progression/manual-bonuses.schema"
import { pathSchema } from "@workspace/game-v2/progression/path.schema"
import { exhaustionSchema } from "@workspace/game-v2/resources/exhaustion.schema"
import { resourcesSchema } from "@workspace/game-v2/resources/resources.schema"
import { skillsSchema } from "@workspace/game-v2/skills/skills.schema"
import { talentsSchema } from "@workspace/game-v2/talents/talents.schema"
import { virtuesSchema } from "@workspace/game-v2/virtues/virtues.schema"
import { skillPoolSchema } from "@workspace/game-v2/vitals/skill-pool.schema"
import { vitalsSchema } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * The **load seam** (F6). Entities arrive from persistence as opaque jsonb; their
 * component **shape** is validated **once, here**, with a Zod schema per
 * component. Everything downstream is then free to presence-`guard` a component
 * (D16) without re-validating its shape — the two checks are deliberately split:
 * the seam owns shape, the guard owns presence.
 *
 * ## Why the schema map is total
 *
 * {@link componentSchemas} is typed as a mapped type over the **whole**
 * {@link ComponentRegistry}, so every authored component the registry declares
 * **must** have a load schema — a future PR that adds a registry key without one
 * is a **compile error**. A partial map (`{ [K]?: ZodType }`) would let
 * {@link loadEntity} silently skip an unschema'd component, quietly re-opening the
 * exact hole F6 closes. Totality is what makes the F6 guarantee structural rather
 * than a hope.
 */
type ComponentSchemas = {
  [K in keyof ComponentRegistry]: z.ZodType<ComponentRegistry[K]>
}

export const componentSchemas: ComponentSchemas = {
  identity: identitySchema,
  presentation: presentationSchema,
  attributes: attributesSchema,
  affinities: affinitiesSchema,
  vitals: vitalsSchema,
  skillPool: skillPoolSchema,
  skills: skillsSchema,
  talents: talentsSchema,
  level: levelSchema,
  path: pathSchema,
  manualBonuses: manualBonusesSchema,
  archetypes: archetypesSchema,
  resources: resourcesSchema,
  exhaustion: exhaustionSchema,
  mechanics: mechanicsSchema,
  equipment: equipmentSchema,
  virtues: virtuesSchema,
  narrative: narrativeSchema,
}

/**
 * The sentinel `key` for a failure that isn't attributable to one component —
 * e.g. the whole blob isn't an object, so the Zod issue has an empty path.
 */
export const ENTITY_LOAD_KEY = "(entity)"

/**
 * One component's worth of validation failure: the component `key` and the Zod
 * issues that explain why its stored shape is invalid. `key` is a component name
 * (a `keyof ComponentRegistry`) or {@link ENTITY_LOAD_KEY} for a blob-level
 * failure; typed `string` so the sentinel needs no cast.
 */
export interface ComponentLoadIssue {
  key: string
  issues: z.core.$ZodIssue[]
}

/**
 * The object schema that validates an entity's stored component blob in one pass.
 * Built from the total {@link componentSchemas}, so it stays in lock-step with
 * the registry. `.partial()` — every component is optional, because presence is a
 * runtime fact the guard checks, not a load-time requirement. Unknown keys are
 * stripped (Zod's default), so a row persisted before a component was removed
 * still loads (additive/forward-compatible migrations, D3).
 */
const componentsSchema = z.object(componentSchemas).partial()

/**
 * Projects a stored entity (id + opaque component blob) into a validated
 * {@link Entity}. Returns `ok(entity)` when every present component's shape is
 * valid; otherwise `err` with one {@link ComponentLoadIssue} per failing
 * component. The returned entity carries only components that validated and were
 * present — exactly the `Partial<ComponentRegistry>` the runtime expects.
 */
export function loadEntity(
  id: string,
  components: unknown
): Result<Entity, ComponentLoadIssue[]> {
  const parsed = componentsSchema.safeParse(components)
  if (!parsed.success) {
    return err(groupIssuesByComponent(parsed.error.issues))
  }
  return ok({ id, components: parsed.data })
}

/**
 * Groups raw Zod issues by the component key at the head of each issue path, so a
 * caller sees "which component failed and why" rather than a flat issue list.
 */
function groupIssuesByComponent(
  issues: readonly z.core.$ZodIssue[]
): ComponentLoadIssue[] {
  const byKey = new Map<string, z.core.$ZodIssue[]>()
  for (const issue of issues) {
    // A blob-level failure (e.g. the whole `components` isn't an object) has an
    // empty path and no owning component — bucket it under the entity sentinel.
    const key = issue.path.length > 0 ? String(issue.path[0]) : ENTITY_LOAD_KEY
    const bucket = byKey.get(key)
    if (bucket) bucket.push(issue)
    else byKey.set(key, [issue])
  }
  return [...byKey].map(([key, componentIssues]) => ({
    key,
    issues: componentIssues,
  }))
}
