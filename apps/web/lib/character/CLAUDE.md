# `lib/character` — the character read side (ADR §2.6)

The v2 character surfaces' read layer: **one load boundary per route** and,
when S2 lands, the pure per-surface view builders.

- `load.ts` — `loadCharacterByShortId(shortId)` fetches the `entity` row once,
  assembles + `resolveEntity`s once, and returns the
  `{ profile, entity, resolved }` triple. `profile` is the app-owned columns;
  `entity` is the authored component bag (the optimistic re-fold's base and
  where surfaces read authored choices); `resolved` is the engine's read-units.
- `view/` (S2) — pure per-surface view builders over that triple, mirroring
  `lib/combat/view/`. **There is no shared flattener** — no `HydratedCharacter`
  successor. A shared view slice may exist only when two surfaces genuinely
  render the same one, and it is named for its content, never its storage (the
  F1 tripwire: a view type with a `durable`/`row` discriminant is the kind
  branch resurfacing).

**Nothing in this folder computes.** Derivation happens in the engine
(`resolveEntity`), shaping in `view/`, rendering in components (anti-goal 1).
Writes never live here — they are `lib/entity/commit` descriptors dispatched
through `lib/actions/entity/`.
