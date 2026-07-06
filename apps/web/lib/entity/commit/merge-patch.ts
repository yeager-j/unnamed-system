import type { Entity } from "@workspace/game-v2/kernel/entity"

import type { EntityWritePatch } from "./writers"

/**
 * Merges a Writer's predicted patch onto an entity's component bag — the
 * optimistic client's half of the commit (the server's half is the guarded
 * column UPDATE, whose per-column SET this whole-component spread mirrors
 * exactly). Patch keys replace their component wholesale; a key set to
 * `undefined` removes the component (NULL ⇔ absent, CH15).
 */
export function mergeComponentPatch(
  entity: Entity,
  patch: EntityWritePatch
): Entity {
  const components = { ...entity.components }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete components[key as keyof typeof components]
    } else {
      Object.assign(components, { [key]: value })
    }
  }
  return { ...entity, components }
}
