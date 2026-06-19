# Unnamed System — Character Sheet App

A Next.js web app for creating and managing characters in the Persona System tabletop RPG. The game rules live in `packages/rules` (an Obsidian vault with a comprehensive `CLAUDE.md` index). The product spec is in that vault's `PRD.md`.

## Installation & Running the App

This is a Turborepo project, so most commands are run from the root directory. To install dependencies, run `npm install`. To start the dev server, run `npm run dev` from the root directory.

shadcn/ui primitives should be installed from the `packages/ui` directory, not the root. Similarly, when installing dependencies to the `apps/web` directory, run `npm install` from there (not the root).

## PRD Considerations

- The rules in the Obsidian vault are the source of truth for the game mechanics. If they conflict with the PRD, update the PRD.
- If technical decisions are made that conflict with the PRD, update the PRD.

## Code Style

> _Perfection is lots of little things done well_
>
> — Marco Pierre White

1. **Keep it simple; don't get clever.** As the great Brian Kernighan said, _"Everyone knows that debugging is twice as hard as writing a program in the first place. So if you're as clever as you can be when you write it, how will you ever debug it?"_
2. **Give functions and files clear names and purposes.** Each function should have one job and do it well. Avoid side effects where possible. Pure, single-purpose functions are easy to test and maintain. The same principle applies to files; each file should do one thing well.
3. **Avoid inline comments.** If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions. Barring some unusual techniques for performance reasons, your code should read like a sentence. Again, as the great Brian Kernighan said, _“Don’t comment bad code — rewrite it!”_ However, always write documentation (e.g. JSDocs).
4. **Resist premature abstraction.** Just because two pieces of code look similar doesn't mean they should be combined. Every abstraction introduces coupling, creating dependencies that make future changes more difficult.
5. **Favor composition over inheritance.** This creates more flexible code with fewer hidden dependencies. Inheritance expects you to bundle common behavior into a parent type, but as soon as you find an exception to the commonality, an expensive refactor is required. If you think your inheritance structure is perfect, remember that change is the enemy of perfect design.
6. **Avoid nesting the Happy Path.** If your Happy Path is nested within a bunch of conditionals, try inverting the conditions and using early return statements. If the conditionals are complex, it might be worth extracting them into their own bite-sized functions.
7. **Write tests to enable confident refactoring.** Tests aren't just about verifying code works today; they're about maintaining the freedom to improve it tomorrow. Good tests let you iterate on implementation details while ensuring behavior remains consistent, turning what would be hours of debugging into seconds of test runs.
8. **Leave the codebase better than you found it.** If you're about to reach for a type cast that papers over a real mismatch (as unknown as X), duplicate logic because the shared abstraction is awkward, suppress a lint or type error, write a TODO that hides a correctness issue, or add a special-case branch with no precedent — stop and ask. The user will tell you whether to fix the underlying issue in the current ticket or file a follow-up tech-debt ticket. This applies in auto-mode too; the bar to interrupt is higher but the bar for code quality isn't.

### Code Conventions

- When creating branches, refer to the Linear ticket's `gitBranchName`. If not working from a ticket, use the branch name `feature/my-feature`.
- Reuse existing `Result` utility where appropriate.
- Avoid prop-drilling. `HydratedCharacter` is supplied via `useCharacter()`. When you feel like you're prop drilling, stop and consider if a Context or another approach would be better.
- Avoid creating `switch` statements if there's a strong possibility that the number of cases will be high. Consider patterns such as a Registry, like the Mechanics Registry in `packages/game/src/engine/mechanics`.
- **Display labels live in `apps/web/lib/ui/labels.ts`.** Any `Record<X, string>` map that turns a domain key into a human-readable string (damage types, attributes, lineages, ranges, etc.) goes there — don't redefine inline, even for a one-off consumer.
- **Per-tab data shaping lives next to the data, not in the component.** The inline `.filter().map()` blocks that turn hydrated state into the shape a section renders should be a pure helper in `packages/game/src/engine/<domain>/` (e.g. `resolve-inventory.ts`, `archetypes/display.ts`) — the tab root calls one helper and focuses on layout.
- Never put game logic in the UI layer. The UI should simply render what the game engine provides it.
- **Owner-mode writes that touch one of several fields on a shared column: use per-field Server Actions, not "client builds the full object."** When multiple controls (toggles, segmented selects) all write to one jsonb column, do not have each control compose the full post-state from `useOptimistic`'s value in a closure and POST that — back-to-back clicks read a stale outer-scope value, the second write silently overwrites the first, the optimistic UI lies, and the test catches it before you do. Instead, expose one action per field (`setBattleConditionAxisAction(axis, state)`, `setBattleConditionFlagAction(flag, value)`), let the server read the row and merge. UNN-226's Charged/Concentrating bug is the cautionary tale; `apps/web/lib/actions/combat-state.ts` is the worked example.

### Habits

- Default to direct, targeted reads (grep + Read on the specific files) over launching Explore or parallel subagents. Token count explodes when parallel subagents are involved, so ask the user before spawning them.
- User has enabled the "Auto-fix CI & address comments" setting. If things are nominal, reply briefly that there is nothing actionable. Only elaborate if there is a problem. For example, "Both comments are routine; disregarding."
- When doing UI work, run the dev server and view the result in the browser before reporting done. Treat the first render as a draft: iterate on the design, and experiment with several approaches and pick the best one rather than shipping the first thing that works.
- Similarly, include a design proposal (can be pure text; image mockups are not necessary) in the Plan when Plan Mode is enabled.
- As this is a personal project and low-stakes, commiting important files (like CLAUDE.md) that you didn't touch is fine. You should still avoid committing files that are completely unrelated to the PR.
- When building UI components, see if there is a shadcn/ui component that already does what you need.
- User may sometimes accidentally leave the dev server on port 3000 running. It's fine to kill it so you can restart it via your preview tools. **IMPORTANT!** If you are working in a git worktree, the dev server may have been started by another Claude instance working on its own ticket. You should use a different port in this case.
- When you need to flip the signed-in/signed-out state in a browser preview during UI work, use POST /api/dev/sign-in and POST /api/dev/sign-out — recipe in the route JSDocs. Don't try to delete the session cookie from JS (it's httpOnly).
- When screenshotting via the Playwright MCP, omit the `filename` arg — a relative filename resolves against the repo cwd and litters the root; auto-named files honor the configured `--output-dir` and also render inline in the tool result.
- When you create new folders, add them to this document's **Repo Structure** section. Ensuring this section is up-to-date allows future Claude instances to know where relevant code is without having to dig through the repo.

**Retrospective at the end of every ticket.** When the implementation lands, briefly consider what slowed you down — friction in the type system, repeated patterns the abstractions don't cover, missing primitives, awkward seams between layers — and surface them with the user. An empty list is a fine outcome; padded lists are worse than silence. The user decides whether to act, file a DX ticket, or skip.

As part of the retrospective, if you noticed anything that could be improved about the code near your changes that might have been out of scope for this ticket, surface it. Again, an empty list is a fine outcome; padded lists are worse than silence.

**Worktrees (parallel tickets).** Each worktree is a separate checkout with its own node_modules — after merging main, run `npm install` if package.json/lockfile changed (a new dep typechecks as "Cannot find module" until you do). Run build/lint/test/dev from the worktree path, not the main checkout (the shell cwd resets between calls). The web launch config uses autoPort, so parallel dev servers won't fight over port 3000.

## Repo Structure

Turborepo monorepo with npm workspaces:

```
apps/web/          Next.js 16 app (App Router, RSC, Server Actions)
packages/game/     Pure game engine + data (@workspace/game) — foundation/data/engine layers; see below
packages/ui/       Shared component library (shadcn/ui, Tailwind CSS 4)
packages/eslint-config/
packages/typescript-config/
packages/rules/     Obsidian vault with game mechanics rules
docs/               Long-form feature specs (PRD/ADR), one folder per feature
                    (e.g. docs/initiative-tracker/). Canonical source of truth;
                    Linear docs are stubs linking here.
```

Inside `apps/web/`:

```
apps/web/
├── app/                       Next routes. app/dungeon/[shortId]/ is the DM dungeon console (UNN-462, M2): a thin status-aware route stub gated by its co-located dungeon-access.ts `getDungeonForDM` loader (DM-only, 404-collapsing ≅ getEncounterForDM); the React Flow run console (turn loop, token placement/movement, reveal) lands in UNN-463/464
├── components/
│   ├── builder/               Character builder chrome + per-movement bodies under movements/{corpus,ortus,animus,persona}/
│   ├── shell/                 App chrome (site header, auth, theme)
│   ├── character-sheet/       Sheet feature (tabs, sections, owner controls); explore/ is the Explore tab's "Reference + Story" surface (UNN-172: sticky Virtues/Talents/jump-nav rail + Identity/Knives/Chains/Background/Notes reading column); archetypes/atlas/ is the Lineage Atlas growth surface (UNN-239, route app/c/[shortId]/archetypes/atlas/)
│   ├── archetype/             Archetype rendering kit shared by sheet + builder (does not reach into either)
│   ├── shared/                Cross-feature primitives: DetailSection, SkillRow + its popover subsystem, Prose, etc. shared/canvas/ holds the route-agnostic React Flow primitives the Map editor + dungeon run console share (UNN-464): floating-edge.ts (pure border-intersection geometry) + use-floating-edge-path.ts (the bezier-path hook). Note: floating edges still require the custom node to render at least one source + one target Handle — React Flow won't create an edge for a handle-less node; the floating math only overrides where it attaches.
│   ├── editor/                Markdown editor primitives shared by sheet + builder
│   ├── combat/                DM combat console (UNN-335): the encounter setup shell (CombatantSetup[] state container + Start-combat transition), stub setup panels (UNN-298–301), and the live/ended status-branch stubs rendered by app/combat/[shortId]/. combat/enemies/ is the catalog browse-and-add surface (UNN-346, route app/combat/[shortId]/enemies/): a three-column master-detail (searchable/family-filtered/level-grouped list + a standalone statblock card + a localStorage-backed "Queued enemies" staging rail via hooks/use-encounter-enemy-queue) that commits queued catalog enemies as `catalog-enemy` combatants through the existing setup save path. The browse statblock card and the DM drawer's enemy section share one renderer — `components/combat/enemy-statblock.tsx` (`EnemyStatblock`), fed by the engine's resolved `Statblock` (UNN-350 dedup; the old `buildEnemyDetailView`/`EnemyDetailView` view-model is gone). The signed-out player-watch card stays separate and **redacted** (HP/SP only). app/combat/[shortId]/encounter-access.ts holds the shared DM-only `getEncounterForDM` loader both the console page and the enemies sub-route memoize. The **player watch view** (UNN-322/323/324) is rendered by app/c/encounter/[shortId]/ as a **3-column** surface: encounter-watch (client root + draft/live/ended status branch, consumes hooks/use-encounter-snapshot) lays out the signed-in viewer's own character sheet on the left (watch-sheet-column: tabs when they own >1 combatant here, each an owner-mode CharacterProvider rendering the **same** sheet components as /c/[shortId] — SheetHeader/Affinities/MechanicWidget/Skills, read-only for combat conditions) and the battlefield on the right (the DM's zone-layout grid, fed by resolve-player-view.ts's resolvePlayerZoneLayout, + player-turn-order). The left column is hidden for a spectator/signed-out viewer (battlefield full-width). All combatant data is the **redacted** EncounterSnapshot (enemy attributes/affinities stripped server-side in lib/db/queries/load-encounter-snapshot.ts → @workspace/game/engine/encounter/player-snapshot), polled/pinged from the public app/api/encounter/[shortId]/snapshot route; the viewer's own full sheets come from loadOwnedEncounterSheets (only characters they own are hydrated). On the watch the player edits only **vitals/mechanic** (these write the character row through the existing owner controls); **combat conditions (ailments + battle conditions) are DM-only** — the watch renders them read-only (UNN-467 removed the player-scoped overlay write; the DM drawer's combatant-conditions-section is the sole editing caller of the shared presentational editor components/combat/conditions-controls.tsx)
│   ├── campaign/              Campaign surfaces (UNN-329): My Campaigns cards + create dialog, and the manage page's invite-link card (copy/regenerate), roster (+ remove player), encounter list + create dialog, and live-encounter banner. Also the owner's character-placement section (UNN-328): a card grid of the viewer's characters placed here + an "Add character" combobox dialog (place/move, with consent + single-campaign move confirmation) and a per-card remove (unplace) control — all setting characters.campaignId via setCharacterCampaignAction. Plus the lifecycle controls (UNN-330): a member's "Leave campaign" button and the DM's type-to-confirm "Delete campaign" button. Rendered by app/campaigns/ + app/campaigns/[shortId]/
│   ├── maps/                  My Maps surfaces (UNN-460): the My Maps list cards + create dialog, the delete-map confirm, and the Map editor shell (map-editor.tsx — an autosaving name field via hooks/use-map-name-autosave.ts over a placeholder canvas region). The React Flow node-graph canvas drops into that placeholder in UNN-461. Rendered by app/maps/ + app/maps/[shortId]/
│   └── my-characters/
├── hooks/                     Providers + non-UI hooks (useCharacter, etc.)
├── e2e/                       Playwright specs
│   └── fixtures/              E2E test-data factory (UNN-343). factory.ts mints ephemeral characters/campaigns/encounters with unique-per-run ids + a CleanupTracker (afterAll cleanup); each write spec's <thing>-target.ts wraps it as createXTarget(tracker) returning helpers bound to the new id. encounter-target.ts is the kept seeded combat showcase (campaigns A/B + encounters) for encounter-shell/join. See e2e/README.md "Write-spec discipline".
└── lib/
    ├── actions/               Server Actions and validation schemas. README contains instructions for the owner-mode write pattern.
    ├── archetypes/            Per-user Archetype visibility gating (restricted.ts): an env-var email allowlist (e.g. ELEMENTAL_THIEF_EMAILS) keeping a shipped-but-gated Archetype out of source control. isArchetypeAllowedFor() gates the unlock action; hiddenArchetypeKeysFor() feeds buildLineageAtlas to omit gated Archetypes from a non-allowlisted viewer's Atlas. Server-only.
    ├── commands/              Command-palette registry (UNN-261): provider array + resolveCommands(ctx); navigation + vitals batches. Routes through existing Server Actions — no new write paths. Consumed by components/character-sheet/command-palette.tsx.
    ├── (game/ extracted to packages/game — see "packages/game" below)
    ├── ui/                    Cross-cutting UI utilities (labels)
    ├── realtime/              Ably invalidation pings (UNN-370; docs/realtime/ADR.md): channels.ts is the ONLY place env-namespaced channel names ({ns}:{domain}:{shortId}) are assembled; client.ts is the lazy REST client (null without ABLY_API_KEY ⇒ the whole layer no-ops and clients poll); publish.ts fires advisory pings from the write choke points (version-guard + the two bespoke writes + the encounter shells) via next/server after(). Subscribe tokens: app/api/realtime/token (subscribe-only, single channel). Client side: hooks/use-realtime-channel.ts is the generic subscribe hook (modular ably SDK, token-route auth, inert when unavailable); the sheet wires it in CharacterProvider through hooks/character-version-sync.ts — the shared version-compare both it and the UNN-203 BroadcastChannel funnel through (UNN-372).
    ├── db/                    Persistence, grouped by role (see below)
    ├── storage/               Vercel Blob storage
    └── auth/                  Auth.js
```

`lib/db/` is grouped by role:

```
lib/db/
├── client.ts        Lazy Drizzle client (db, getDb)
├── index.ts         Barrel: re-exports client + schema (import via @/lib/db)
├── env.ts           DB env resolution
├── seed.ts          Idempotent dev/E2E seed (npm run db:seed)
├── schema/          Drizzle tables + columns; row types (CharacterRow, …) are owned by @workspace/game/foundation, conformance.test.ts proves the tables match
├── migrations/      drizzle-kit SQL migrations + meta
├── queries/         Reads: load-character (central loader), character-list, versions, encounter-lock (the UNN-330 live-encounter lock primitives — isCharacterLiveEncounterCombatant / memberHasLiveEncounterCombatant, consumed by the delete/unplace/kick/leave writes), load-dungeon (UNN-462: by-shortId row + campaignId resolver for the DM-write gate + version for stale-retry)
└── writes/          Per-concern persistence wrappers + the version-guard primitive
```

**Wrapper naming rule:** files in `queries/`/`writes/` are named for the
character-state slice or operation they touch, with **no `character-` prefix**
(the folder already says "character db") — `writes/virtues.ts`,
`writes/combat-state.ts`, `queries/versions.ts`, matching peers like
`writes/inventory.ts`/`writes/rest.ts`. Keep `character` in the name **only**
when the whole character is the operation's object: `queries/load-character.ts`,
`queries/character-list.ts`, `writes/delete-character.ts`,
`writes/start-character-draft.ts`. Every write composes through
`writes/version-guard.ts` (UNN-248); the README in `lib/actions/` documents the
owner-mode write pattern these back.

### `packages/game` (`@workspace/game`)

The pure game engine + data, extracted from `apps/web/lib/game` (see
`docs/engine-reorg`). A runtime-pure leaf — no React/Next/DB — split into three
layers under `src/`, each its own barrel entry point:

```
packages/game/src/
├── foundation/   types, Zod schemas, fixed vocabulary (LINEAGES, VIRTUE_KEYS, DAMAGE_TYPES),
│                 scalar constants, the generic Result primitive (result.ts), and the
│                 persisted-row contract (records.ts: CharacterRow etc.). No real logic.
├── data/         the hardcoded catalogs (skills/items/archetypes/enemies + their per-category
│                 index.ts slices and get* registries; catalog/createCatalog). Authored truth.
└── engine/       the pure functions — char optimistic reducer (character/reduce/* +
                  reduce-character.ts), encounter tracker (encounter/reduce/* + reduce-session +
                  selectors + view-shapers), dungeon/ (the exploration turn loop — reduceDungeon +
                  reminder/roster selectors, UNN-463; no deps, not in createGameEngine),
                  stats/leveling/derive, combat math, the mechanics
                  behavior modules + registry, the enemy view-models, and combatant/ (the
                  provenance-neutral `Statblock` + statblockFromCharacter/statblockFromEnemy
                  derivers PCs and enemies share — UNN-350). The Stryker target.
```

- **Imports:** consumers (apps/web) import a layer barrel — `@workspace/game/{foundation,data,engine}`;
  package-internal files import the **deep module** (`@workspace/game/<layer>/<file>`), never a
  layer barrel (cycles). `sideEffects: false` + Next `optimizePackageImports` neutralize the
  barrel cost.
- **Dependency rule:** `engine → data → foundation`. Type-only imports across layers are free;
  `engine → data` **value** imports are the inversion-debt backlog being paid down by **UNN-354**
  via the lookup **port**: `engine/ports.ts` declares the single `GameData` interface over
  foundation types that the engine owns and `data` implements — `data/game-data.ts` exports the
  single `gameData` adapter satisfying it. Each engine function declares the **exact slice it
  calls** as an inline `Pick<GameData, ...>` (so a signature documents precisely which lookups it
  touches), and every factory-bound boundary function (`buildStatContext`,
  `deriveHydratedCharacter`, `reduceCharacter`, the archetype display shapers, …) is curried
  **deps-first**: an outer call takes its lookup slice (+ `newId` where it mints ids), the inner
  call takes the runtime args. `createGameEngine` is one uniform sweep of those outer calls;
  `apps/web/lib/game-engine.ts` is the **composition root** that binds `gameData` once and
  re-exports the pre-bound versions app code calls. Mechanics registry (`getMechanic`) is
  engine-owned behavior, **not** a data port (carved out). `foundation` still has a few value
  imports from `engine`/`data` (attack vocab, mechanic state-schemas) — a known follow-up.
- The persisted-row types (`CharacterRow`, …) are **owned in `foundation/records.ts`**; the
  Drizzle tables in `lib/db/schema` import them and a `conformance.test.ts` proves the table
  matches (so they can't drift). `EnemyDefinition` family (humanoid/beast/…) is lifted to a
  display/filter vocab by `getEnemyFamily` in the enemies registry. `mechanics/registry.ts` is
  keyed by `kind` over a closed union (carries behavior), **not** a `createCatalog` catalog.
- **Tests + fixtures live in the package** (`src/**/*.test.ts`, `src/engine/__fixtures__/`).
  Engine tests are split three ways (UNN-363; rubric in `__fixtures__/README.md`):
  co-located `<slice>.test.ts` are fixture-backed **unit** tests (one module in
  isolation); `src/engine/__integration__/*.integration.test.ts` are fixture-backed
  **collaboration** tests (a subject composing ≥2 concerns — the derive→reduce
  pipeline, session reducer/factory, encounter view-shapers, `buildStatContext`,
  `statblock`); `src/engine/__contract__/*.contract.test.ts` are the **only** engine
  tests that import the real catalog (`@workspace/game/data`, `gameData`) — a thin
  real-data smoke layer, excluded from the Stryker run via `vitest.mutation.config.ts`.
  As of UNN-361 the suite is **fully data-pure outside `__contract__`** — no
  exceptions. Run a layer with `npm run test:contract` / `test:integration`.

## Commands

```bash
npm run dev        # Start all packages in watch mode (Turbopack)
npm run build      # Production build
npm run typecheck  # tsc --noEmit across all packages
npm run lint       # ESLint across all packages
npm run format     # Prettier across all packages
npm run test       # Vitest across all packages
npm run test:e2e   # Playwright across all packages
```

Run app-specific commands from the package directory (e.g., `cd apps/web && npm run dev`).

## Testing

- **Unit (Vitest):** pure game mechanics in `packages/game/src` — no DB, no network. (App/integration tests that need seed data live in `apps/web`, e.g. `apps/web/lib/__tests__/`.)
- **E2E (Playwright):** `apps/web/e2e`. DB-backed routes require a seeded database.

**Test-signal tooling for the engine (UNN-351) — run from `packages/game`:**

- `npm run test:coverage` — Vitest branch coverage **scoped to `src/engine/**`** (config in `packages/game/vitest.config.ts`). A **gap-finder, not a gate**: no thresholds, no CI check. Read the *uncovered-branch* list (HTML under `packages/game/coverage/`); ignore the headline %. The engine is where almost every branch is a rule, so an un-executed branch is a rule no test ran; a quota would just invite low-value line-touching tests. Don't add a threshold.
- `npm run test:mutation` — Stryker (`packages/game/stryker.conf.mjs`): the measure coverage can't give — of the plausible mistakes one could introduce, what fraction the tests catch (the _mutation score_). `mutate` is the whole engine layer (`src/engine/**`; `__fixtures__` excluded). A full run is ~2.5 min — **not** on the PR critical path: run it nightly or scope `mutate` to changed engine files when iterating; never block a PR on a full run. Triage survivors as real-gap vs equivalent-mutant (HTML under `packages/game/reports/mutation/`). Mutation finds gaps branch coverage rates "fine" — e.g. it flagged `skillAttackRollContext`'s entirely-unexercised ailment arm in an 85%-branch-covered file.
- **Hardening a slice's tests** (decouple from catalog data via fixtures, then drive the mutation score up): use the shared kit + follow the rubric in `packages/game/src/engine/__fixtures__/README.md` (UNN-352). Build inputs from the fixtures (`makeRawCharacterInputs`, `makeStatContext`, …) so logic tests assert behavior, not balance numbers; document genuine equivalent mutants with `// Stryker disable` + a reason; never `as any` impossible inputs or disable just to lift the score.

**E2E is two-tier** (the split exists to keep Vercel edge-request traffic inside the Hobby budget — the full suite against a preview deployment cost ~5k edge requests per run):

- **`e2e` (`.github/workflows/e2e.yml`)** — the full suite minus `@smoke`, on `pull_request` + pushes to `main`. Runs entirely on the GitHub runner: it creates an **ephemeral Neon branch** (`ci/run-<run_id>`, deleted in an `always()` step), migrates + seeds it, builds, and serves the production build via Playwright's `webServer` (`next start`; the config picks it over `next dev` when `CI` is set). Zero Vercel traffic. Auth env vars are dummies — sessions are minted directly in the DB by `e2e/auth.setup.ts`, never via OAuth. The `e2e` required check on `main` is this workflow's job.
- **`smoke` (`.github/workflows/smoke.yml`)** — the `@smoke`-tagged subset (~6 tests), against the **actual preview deployment**, triggered by Vercel's `vercel.deployment.success` `repository_dispatch`. It checks out `client_payload.git.sha`, resolves the deployment's `preview/<branch>` Neon branch via `neonctl`, migrates + seeds it, and runs Playwright against `client_payload.url`. Only runs for `environment == 'preview'`; production deploys are never seeded. The `smoke` commit status is fail-closed: no preview deploy ⇒ no dispatch ⇒ no status ⇒ the PR cannot merge. `preview/<branch>` is deleted on PR close by `.github/workflows/neon.yml`.

**Tag `@smoke` only for deployment-specific coverage** — env wiring, the session cookie on the deployed domain, Vercel Blob, one representative Server-Action write. Logic coverage belongs in the untagged suite; every `@smoke` test bills real edge requests on every push.

Locally, `playwright.config.ts` starts `npm run dev` when `BASE_URL` is unset, preserving the inner loop.

**Write-path E2E (cast / heal / rest / level-up / spark):**

- **Mint ephemeral rows with `e2e/fixtures/factory.ts`, don't grow the seed** (UNN-343). Each `createTest*` helper stamps a unique-per-run id, so `fullyParallel` workers can't contend, and one `cleanup(tracker)` in `afterAll` tears them down (FK-safe, on failure too). A per-spec `<thing>-target.ts` wraps the factory into `createXTarget(tracker)` returning id-bound `reset`/`setX`/`getX` helpers. See `e2e/README.md` "Write-spec discipline" for the canonical shape.
- **Write-then-read still needs `expect.poll`** against the DB helper — the factory removes contention, not the `networkidle`-vs-revalidation race.
- The seed is **showcase/demo data only** (the roster, Iris Vey, and the combat showcase in `encounter-target.ts`). Mutating the shared preview DB is acceptable for that showcase given the per-run re-seed; write-path scaffolding no longer lives there.

## Tech Stack

- **Framework**: Next.js 16, App Router, React Server Components, Server Actions
- **UI**: Tailwind CSS v4, shadcn/ui, Phosphor Icons
- **Auth**: Auth.js v5 (NextAuth) with Google OAuth only; Drizzle adapter
- **Database**: Neon Postgres via Drizzle ORM; migrations via `drizzle-kit`
- **Storage**: Vercel Blob for portrait uploads
- **Validation**: Zod + react-hook-form; same Zod schemas validate Server Action inputs
- **Short IDs**: nanoid (8-char URL-safe) for public character URLs `/c/{shortId}`
- **Hosting**: Vercel + Neon + Vercel Blob
- **Testing**: Vitest (game mechanics unit tests), Playwright (E2E for builder + cast/heal/rest loop) — see the Testing section above

Game data (Archetypes, Skills, Talents, Ailments) is **hardcoded TypeScript** in the repo — not in the database. Demo-only Archetypes (`packages/game/src/data/archetypes/demo/`) are merged into the runtime catalog only when `NEXT_PUBLIC_INCLUDE_DEMO_ARCHETYPES=true` (local dev + Vercel Preview), never in Production — they let the Lineage Atlas exercise tier trees before the real higher-tier data ships.

## Game Rules

When you need to read about the rules of the game, first check the `CLAUDE.md` index file located in the Obsidian vault. If you need further clarification, read the full rule text.

## Data Model (Key Entities)

`User`, `Character` (with `shortId` for `/c/{shortId}` public URLs), `CharacterArchetype` (join with rank, inheritanceSlots, masteryBonusApplied), `CharacterKnife`, `CharacterChain`, `CharacterTalent`, `InventoryItem` (`catalogItemKey`, `equipped`, `quantity` — capabilities like equip slot, effects, and `stackSize` come from the composable catalog `Item`, not the row; see `packages/game/src/foundation/items/schema.ts`), `ActionLogEntry`, `Campaign` (the DM↔player boundary: `dmUserId`, stable `shortId` for the manage URL, and a separate rotatable `joinToken` for the `/join/{joinToken}` invite link — UNN-327), `CampaignUser` (`(campaignId, userId)` roster membership; leave/kick nulls the player's placed characters' `campaignId`, UNN-330), `Encounter` (`campaignId`, `session` jsonb, `shortId`, optional `notes`), `Dungeon` (UNN-462, M2 exploration layer: `campaignId` cascade, `mapInstanceId` restrict, `shortId` for `/dungeon/{shortId}`, `status` draft/active/done, `state` jsonb = turn counter + actedCharacterIds + reminder settings, `version`; owns no geography — that's the Map Instance it references). Campaign deletion cascades encounters + memberships and `set null`s placed `characters.campaignId`; a character that's a combatant in a `live` encounter is lifecycle-locked (can't be deleted/unplaced/kicked) — UNN-330.

See PRD §8 for the full field list.

## App Surfaces

1. **Home / My Characters** — list of user's characters, "Create new character" CTA
2. **Character Builder** — 12-step linear flow (savable, back-navigable); see PRD §5
3. **Character Sheet (edit)** — owner's editable view; header, vitals, attributes, virtues, affinities, archetypes, skills, talents, equipment, identity, progression, combat state, notes
4. **Character Sheet (public)** — `/c/{shortId}`, read-only, same content, signed-out visible
5. **Join campaign** — `/join/{joinToken}`, public/signed-out-visible (UNN-327); a DM's shareable invite link. Signs the player in (OAuth round-trip back to this URL), adds them to the campaign roster (`campaignUsers`), then lands them on the campaign page to place a character (UNN-328). The token is a separate, rotatable secret from the campaign's stable `shortId`.
6. **My Campaigns** — `/campaigns` (UNN-329); the signed-in viewer's campaigns split into "Running" (DM) and "Playing in" (member), with a Create-campaign CTA.
7. **Campaign manage / overview** — `/campaigns/{shortId}` (UNN-329), role-conditional: the DM gets the invite link (copy/regenerate), roster (remove player), encounters (create), and a live-combat banner; a member gets a read-only overview; anyone else 404s.
8. **Encounter watch (public)** — `/c/encounter/{shortId}` (UNN-329 shell; UNN-322/323/324 render), signed-out-visible read-only player view of an encounter: turn order + current actor, the zone map, and per-combatant HP/SP/ailments/conditions. Enemy attributes/affinities are redacted server-side (UNN-324). Polls the public snapshot API every ~1.5s for the DM's live changes, stopping when the encounter ends (UNN-323). Linked from the overview + live banner.

## MVP Scope Limits

- No DM tooling, campaigns, or group features
- No dice rolling — app accepts player-entered numbers where rolls are required
- Archetype prerequisites (`{archetype, rank}`) are enforced in the Lineage Atlas (UNN-239: Locked + "Prerequisites not met"); level-based tier gates remain informational hints only
- No Ancestry/Background structure — free text fields only
- No Prisma upgrade tree
- No Spoils deck simulation
- No multi-currency
- No item catalog — items are user-defined
- Game data changes require a redeploy

## Rulebook Reference

The full rules are indexed in `packages/rules/CLAUDE.md`. When in doubt about a mechanic, read the relevant file from that vault rather than guessing.
