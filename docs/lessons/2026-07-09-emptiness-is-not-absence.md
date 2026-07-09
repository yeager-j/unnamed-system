# 2026-07-09 — An empty component is still a capability

**Symptom:** a stat section is guarded with `keys.length > 0`, so an entity that explicitly carries an empty component is rendered exactly like one that cannot support the section.

**Context:** UNN-538's combatant drawer and enemy statblock hid Talents by checking both storage kind and a non-empty list, despite game-v2's ECS-lite component model.

**Position:** `!detail.durable && detail.talentKeys.length > 0`.

**Principle:** Presence is the runtime capability discriminator; preserve `null` for absent versus `[]` for present-but-empty at the view boundary, then let consumers render from that distinction. Use the engine's `guard` / `resolvedGuard`, not kind checks.

**Action:** `CombatantDetail` and `EnemyStatblockView` now carry nullable Talent keys, use `resolvedGuard("talents")`, and render an explicit empty state.
