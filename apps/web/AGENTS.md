# Next.js project for Showtime!

## Tier + engine-import seams (`depcheck.mjs`)

The web app is **four tiers** — `app` (feature routes + private `_components`/`_hooks`),
`components` (cross-feature kits), `domain` + `lib` (the two data tiers). `depcheck.mjs`
runs on `npm run depcheck` and enforces four things:

- **Tier direction.** Import your own tier or DOWN, never UP: `app → components → domain ≈ lib`.
  `domain` and `lib` are **peers** (rank 2) — actions compose domain Writers, queries return
  domain shapes, loaders read `lib/db` — so their mutual imports are legal; the rule only
  forbids a data-tier file reaching up into `components`/`app`. Zero-tolerance.
- **Feature isolation.** A Next private `_`-folder (`_components`/`_hooks`) is importable only
  from within the directory that contains it, so one feature subtree can't reach into another's
  internals. Code two features share moves DOWN a tier (kit/domain/lib). `ISOLATION_ALLOWLIST`
  is now empty — UNN-611 extracted the two grandfathered reuses into `components/shared/`
  (the maps canvas → `shared/canvas`, the sheet explore cards → `shared/sheet-cards`); a _new_
  cross-feature import fails the gate outright, and the fix is the same move-down, not a re-add.
- **Domain purity** (functional core / imperative shell). Within `domain/`, only the
  **marked-impure** files may runtime-import `lib`: a client hook (`use-*`) or a loader
  (`load-*`, or the bare `load` when the folder names the aggregate — `character/load.ts`).
  Every other domain file is the pure model/view core and may reach `lib` **only** with
  `import type` (erased at build) — no runtime carve-out. The invariant: **domain reads
  (`load-`) and reacts (`use-`); it never writes persistence — mutations live in `lib/actions`.**
  So when a new domain file needs `lib` at runtime, the gate forces the choice — mark it
  `use-`/`load-`, or move the impurity out — rather than letting the pure core silently rot.
- **Engine imports.** Only `domain/**` and `lib/**` may import `@workspace/game*`; `components/**`
  and route UI under `app/**` are hard-gated. Co-located `app/**/*-access.ts` route loaders are
  the sole app-directory exemption (seam-layer code). Existing violations live in
  `ENGINE_IMPORT_ALLOWLIST` (`depcheck-allowlist.mjs`); remove an entry in the same change that
  removes its final engine import — the gate rejects stale entries and new violations.
- **Modeled version writes.** The four entity version columns may be incremented only in the
  stamped guard primitive. Its closed caller graph is recorded in `VERSION_WRITER_ALLOWLIST`:
  registered mutation handlers, the stamped Stores they compose, and approved external commits.
  An external entry must call its declared finalizer. Every entry records a rationale and removal
  condition; the gate rejects raw bumps, new/stale callers, and missing finalizers.

## Project Structure

**Important! Keep this up to date!**

```
apps/web/
├── app/                              Feature subtrees: routes + co-located _components/_hooks
│   ├── _components/                  Home + shared SignedOutLanding
│   ├── api/                          Route handlers: auth, dev sign-in/out, dungeon/encounter snapshot, realtime token
│   ├── campaigns/
│   │   ├── _components/              List + manage widgets
│   │   └── [campaignShortId]/
│   │       ├── (planner)/            DM planner route group: articles, calendar, chronicle, manage, notes, npcs
│   │       ├── _components/planner/  Rail, roster panel, runner, first-run checklist
│   │       ├── dev/editor/           Temporary participant-links scratch harness
│   │       ├── dungeon/[shortId]/    Console/setup/watch + _components/{canvas,combat,explore,shell} + _hooks
│   │       └── encounter/[shortId]/  Console/setup/watch + _components + _hooks
│   ├── characters/[shortId]/
│   │   ├── _components/              Sheet: archetypes, combat, explore, inventory, journal, rail
│   │   ├── animus/                   Owner-only narrative writer route (`?doc=`)
│   │   ├── atlas/                    Lineage/Archetype atlas
│   │   └── builder/[step]/           Character builder + _components/movements/{animus,corpus,ortus,persona}
│   ├── dev/editor/                   Editor scratch route
│   ├── join/[token]/                 Participant-link join flow
│   └── stage/                         Authoring library: inset Maps + Sets lists, full-bleed Map + Template Set editors
├── components/                       Cross-feature kit tier (shared by ≥2 features)
│   ├── combat/                       Shared combat UI: conditions, console, controls, dialogs, drawer, enemies, rail, setup, watch
│   ├── archetype/                    Archetype rendering kit (sheet + builder + atlas)
│   ├── shared/                       Cross-feature primitives: canvas/set-piece, mechanics, sheet-cards, DetailSection, Prose
│   ├── editor/                       Markdown editor primitives + chrome
│   ├── animus/                       Narrative writer kit (sidebar + pane + document providers)
│   └── shell/                        App chrome: header, auth, theme, viewer-role
├── domain/                           The app's model of the game — data tier, peer of lib
│   ├── archetypes/                   Per-user visibility gating (env allowlist)
│   ├── character/                    Read side: load.ts (one load boundary) + view/ + animus/documents.ts
│   ├── combat/                       Predicted commit protocol + neutral console/view/snapshot/load vocabulary
│   ├── dungeon/                      Predicted commit protocol/root + explore view shaping
│   ├── entity/                       Durable-entity write vocab: commit/ (schema + predictors) + use-entity-write
│   ├── game-v2/                      entity-row-to-bag: entity row → runtime Entity
│   ├── map/                          Map canon, intent protocol/predicted root, and pure renderer vocabulary
│   ├── template-set/                 Template Set authoring/events, canon, intent protocol, and predicted root
│   ├── planner/                      Campaign Planner pure selectors (clock-time, slot materialization)
│   ├── labels.ts                     Canonical display-label maps (Record<gameKey, string>)
│   ├── pool.ts                       Neutral `{ current, max }` Pool shaper
│   └── game-engine-v2.ts             Engine composition root (pre-bound resolveEntity/resolveSession)
├── e2e/                              Playwright specs
│   └── fixtures/                     factory.ts (ephemeral test data) + per-thing -target.ts wrappers
└── lib/                              Plumbing data tier, peer of domain
├── actions/                      Server Actions + command authorities; entity/, map/, and template-set/ are Headcanon doors
├── auth/                         Auth.js v5 (Google OAuth, Drizzle adapter)
├── db/                           client/schema/migrations/queries/writes — see lib/db/CLAUDE.md
├── realtime/                     Headcanon axis invalidation transport + degraded polling binding
├── storage/                      Vercel Blob (portraits)
```
