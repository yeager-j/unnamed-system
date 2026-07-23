# `domain/character` — the character read side (ADR §2.6)

The v2 character surfaces' read layer: **one load boundary per route** and
pure per-surface view builders.

- `load.ts` — `loadCharacterByShortId(shortId)` fetches the `entity` row once,
  assembles + `resolveEntity`s once, and returns the
  `{ profile, entity, resolved }` triple. `profile` is the app-owned columns;
  `entity` is the authored component bag (the optimistic re-fold's base and
  where surfaces read authored choices); `resolved` is the engine's read-units.
  `loadCharactersByIds(ids)` is the batch twin (the dungeon watch's own-sheet
  column, UNN-566): same triple per id, in the caller's order, skipping a row
  that fails the load seam rather than 404ing a whole watch page.
  `toCharacterProfile(row)` is the profile projection alone, for the loaders
  that already hold a dissolved entity (a durable combatant off the session).
- `view/` (S2a — UNN-557) — pure per-surface view builders over that triple,
  mirroring `domain/combat/view/`: `rail-view.ts` (the sheet's persistent rail —
  note Level/Victories read off the authored `entity`, no resolved read-unit
  exists), `affinity-strip.ts` (11 cells, neutral-filled), plus `archetypes-tab.ts`,
  `inventory-table.ts`, and `virtues-card.ts`. Skill cards themselves render
  `ResolvedSkill` directly — no per-card view type. **There
  is no shared flattener** — no `HydratedCharacter` successor. A shared view
  slice may exist only when two surfaces genuinely render the same one, and it
  is named for its content, never its storage (the F1 tripwire: a view type
  with a `durable`/`row` discriminant is the kind branch resurfacing).

**Nothing in this folder computes.** Derivation happens in the engine
(`resolveEntity`), shaping in `view/`, rendering in components (anti-goal 1).
Writes never live here — they are `domain/entity/commit` descriptors dispatched
through `lib/actions/entity/`.

## ⚠️ The three read homes are deliberate — do not merge them

A surface reads from exactly three places, each answering a different
question:

| Home                | Question it answers                 | Example reads                                 |
| ------------------- | ----------------------------------- | --------------------------------------------- |
| `profile`           | app-owned row facts                 | name, status, builderStep, version tokens     |
| `entity.components` | what the player **authored**        | `path.choice`, `archetypes.origin`, narrative |
| `resolved`          | what the engine **derived** from it | `vitals.maxHP/currentHP`, resolved skills     |

`toCharacterCanon` (UNN-673/UNN-675) is **not** a fourth home and not a merge: it
is the same three answers re-projected for the write protocol, carrying only what
the four entity axes govern — the authored components, their resolved derivation,
and the four identity columns the `identity` axis owns. It deliberately excludes
`profile`'s ids (immutable) and its `status`/`builderStep` (unversioned subtype
facts) precisely because no axis revision speaks for them, which is the same
discipline as the table above rather than an exception to it. The provider now
sources identity columns from the predicted canon, so the profile overlay and
entity frame stay aligned while a write is pending.

The standing temptation — it will look like a harmless convenience — is to
spread these into one merged view-model ("`CharacterView`", "`SheetData`",
a context that flattens all three). **Don't.** That object is
`HydratedCharacter` reborn: the moment authored and derived values share a
namespace, readers stop knowing which is which, writes start targeting
derived fields, and the shadow flattener the whole v2 read model exists to
kill (ADR §2.6, anti-goal 2) grows back one field at a time. If a component
needs values from two homes, it takes two props (or a per-surface `view/`
builder shapes them) — the _builder_ may combine, because it is pure,
per-surface, and content-named; a _shared_ merged type may not exist.
