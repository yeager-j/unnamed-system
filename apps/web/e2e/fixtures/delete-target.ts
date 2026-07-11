import { createTestCharacter, type CleanupTracker } from "./factory"

/**
 * Ephemeral target for `e2e/delete-character.spec.ts` (UNN-181). Sized just
 * large enough to prove CASCADE: a default Warrior archetype plus one inventory
 * item. Minted per-run; the happy-path test soft-deletes it (UNN-571 tombstone),
 * and `afterAll` `cleanup` hard-removes the surviving row by id.
 */
export function createDeleteTarget(tracker: CleanupTracker) {
  return createTestCharacter(tracker, {
    name: "Wren Halloway",
    items: [{ catalogItemKey: "longsword", equipped: false }],
  })
}
