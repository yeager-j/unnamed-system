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

## ⚠️ The three read homes are deliberate — do not merge them

A surface reads from exactly three places, each answering a different
question:

| Home                | Question it answers                  | Example reads                                  |
| ------------------- | ------------------------------------ | ---------------------------------------------- |
| `profile`           | app-owned row facts                  | name, status, builderStep, version tokens      |
| `entity.components` | what the player **authored**         | `path.choice`, `archetypes.origin`, narrative  |
| `resolved`          | what the engine **derived** from it  | `vitals.maxHP/currentHP`, resolved skills      |

The standing temptation — it will look like a harmless convenience — is to
spread these into one merged view-model ("`CharacterView`", "`SheetData`",
a context that flattens all three). **Don't.** That object is
`HydratedCharacter` reborn: the moment authored and derived values share a
namespace, readers stop knowing which is which, writes start targeting
derived fields, and the shadow flattener the whole v2 read model exists to
kill (ADR §2.6, anti-goal 2) grows back one field at a time. If a component
needs values from two homes, it takes two props (or a per-surface `view/`
builder shapes them) — the *builder* may combine, because it is pure,
per-surface, and content-named; a *shared* merged type may not exist.
