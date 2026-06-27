# Unnamed System — Character Sheet App

A Next.js web app for creating and managing characters in the Persona System tabletop RPG. The game rules live in `packages/rules` (an Obsidian vault with a comprehensive `CLAUDE.md` index). The product spec is in that vault's `PRD.md`.

## Installation & Running the App

This is a Turborepo project, so most commands are run from the root directory. To install dependencies, run `npm install`. To start the dev server, run `npm run dev` from the root directory.

shadcn/ui primitives should be installed from the `packages/ui` directory, not the root. Similarly, when installing dependencies to the `apps/web` directory, run `npm install` from there (not the root).

## Prime Directives

### 1. Think Before Coding
Don't assume. Don't hide confusion. Surface tradeoffs. Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them—don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Goal-Driven Execution
Define success criteria. Loop until verified. Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 3. Ditch The Blinders
You have immense knowledge over coding practices, standards, and conventions. Assume the user isn't smarter than the millions of engineers who have come before them.

The user is always open to ideas on better ways to do things. Don't hesitate to suggest a better way, or one that has long-lasting impact over a tactical change. If what the user is trying to do is similar to settled science or industry practice, let the user know. You don’t have to reinvent the wheel.

### 4. Hacks as a Last Resort
If you're about to write a hack, stop. Ask yourself:

> What is the root cause of the problem? Why is the hack necessary?

If you can't answer those questions, don't write the hack. A hack should *only* be written if the root cause has been searched for and is definitively unknown, or it has been explicitly decided that the hack is acceptable.

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
9. **Decide a distinction once.** A distinction — which storage home, which variant, which path — should be decided exactly once, at the boundary where it's first knowable, and resolved into a shape (a value, a type, a handler) that leaves everything downstream blind to it. The smell is never the conditional itself; it's _multiplicity_ — the same distinction reappearing as a stored flag that gets re-read, two parallel branches, or N special-cased functions, which then drift apart. A flag, a duplicated branch, and a forked function are the same anti-pattern at different scales. A branch is healthy when it is _the_ single decision point fanning out to genuinely different behavior (a reducer's exhaustive `switch`); it's a smell when it _re-checks_ a distinction already decided upstream (push the decision up — receive it resolved), or when its arms do the _same_ thing through a different collaborator (extract the collaborator and the branch dissolves). Rule of thumb: **vary the verb by branch, the noun by parameter** — a conditional whose arms share their shape and differ only in a value is a missing parameter wearing an `if`. (This is Meyer's Single Choice Principle, and the precondition Fowler attaches to "Replace Conditional with Polymorphism" — which is why the reducer `switch`, each arm a different behavior, is correct and must _not_ become a registry.)

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
- User has enabled the "Auto-fix CI & address comments" setting. If things are nominal, reply briefly that there is nothing actionable. Only elaborate if there is a problem. For example, "Both comments are routine; disregarding."
- When doing UI work, run the dev server and view the result in the browser before reporting done. Treat the first render as a draft: iterate on the design, and experiment with several approaches and pick the best one rather than shipping the first thing that works.
- Similarly, include a design proposal (can be pure text; image mockups are not necessary) in the Plan when Plan Mode is enabled.
- As this is a personal project and low-stakes, commiting important files (like CLAUDE.md) that you didn't touch is fine. You should still avoid committing files that are completely unrelated to the PR.
- When building UI components, see if there is a shadcn/ui component that already does what you need.
- User may sometimes accidentally leave the dev server on port 3000 running. It's fine to kill it so you can restart it via your preview tools. **IMPORTANT!** If you are working in a git worktree, the dev server may have been started by another Claude instance working on its own ticket. You should use a different port in this case.
- When you need to flip the signed-in/signed-out state in a browser preview during UI work, use POST /api/dev/sign-in and POST /api/dev/sign-out — recipe in the route JSDocs. Don't try to delete the session cookie from JS (it's httpOnly).
- When screenshotting via the Playwright MCP, omit the `filename` arg — a relative filename resolves against the repo cwd and litters the root; auto-named files honor the configured `--output-dir` and also render inline in the tool result.
- When you create new folders, add a one-line entry to this document's **Repo Structure** map so future Claude instances know where code lives. Keep that entry terse — when an area accrues dense, area-specific conventions, put them in a nested `CLAUDE.md` in that folder (Claude auto-loads it when working there) and leave only a one-line pointer in the root map. Reserve `README.md` for human-facing prose; it is **not** auto-loaded, so point at it from the nearest `CLAUDE.md`.

**Retrospective at the end of every ticket.** When the implementation lands, briefly consider what slowed you down — friction in the type system, repeated patterns the abstractions don't cover, missing primitives, awkward seams between layers — and surface them with the user. An empty list is a fine outcome; padded lists are worse than silence. The user decides whether to act, file a DX ticket, or skip.

As part of the retrospective, if you noticed anything that could be improved about the code near your changes that might have been out of scope for this ticket, surface it. Again, an empty list is a fine outcome; padded lists are worse than silence.

**Worktrees (parallel tickets).** Each worktree is a separate checkout with its own node_modules — after merging main, run `npm install` if package.json/lockfile changed (a new dep typechecks as "Cannot find module" until you do). Run build/lint/test/dev from the worktree path, not the main checkout (the shell cwd resets between calls). The web launch config uses autoPort, so parallel dev servers won't fight over port 3000.

## Repo Structure

Turborepo monorepo with npm workspaces:

```
apps/web/          Next.js 16 app (App Router, RSC, Server Actions)
packages/game/     Pure game engine + data (@workspace/game) — foundation/data/engine layers; see below
packages/game-v2/  Capability/component engine (@workspace/game-v2), successor to packages/game — domain-first layout (kernel/ substrate + one folder per domain/PR), independent (zero @workspace/game imports, gated by depcheck.mjs). Design in docs/engine-v2/; PR1 (UNN-499) scaffolds kernel/ only
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
│   ├── combat/                **Shared combat UI kit** (UNN-492): route-agnostic combat components rendered by both the mapless encounter and the dungeon combat canvas. See combat/CLAUDE.md.
│   ├── encounter/             **Mapless-encounter feature** (UNN-492): DM console (app/combat/[shortId]/) + player watch (app/c/encounter/[shortId]/). See encounter/CLAUDE.md.
│   ├── campaign/              Campaign surfaces (UNN-329): My Campaigns + manage page (invite link, roster, encounters, live banner), character placement (UNN-328), lifecycle controls (UNN-330). Rendered by app/campaigns/. See campaign/CLAUDE.md.
│   ├── maps/                  My Maps surfaces (UNN-460): the My Maps list cards + create dialog, the delete-map confirm, and the Map editor shell (map-editor.tsx — an autosaving name field via hooks/use-map-name-autosave.ts over a placeholder canvas region). The React Flow node-graph canvas drops into that placeholder in UNN-461. Rendered by app/maps/ + app/maps/[shortId]/
│   ├── dungeon/               **Dungeon run console + player watch** (UNN-463/464/467; spatial M2 exploration). DM console at app/dungeon/[shortId]/, watch at app/c/dungeon/[shortId]/. See dungeon/CLAUDE.md.
│   └── my-characters/
├── hooks/                     Providers + non-UI hooks (useCharacter, etc.)
├── e2e/                       Playwright specs
│   └── fixtures/              E2E test-data factory (UNN-343). factory.ts mints ephemeral characters/campaigns/encounters with unique-per-run ids + a CleanupTracker (afterAll cleanup); each write spec's <thing>-target.ts wraps it as createXTarget(tracker) returning helpers bound to the new id. encounter-target.ts is the kept seeded combat showcase (campaigns A/B + encounters) for encounter-shell/join. See e2e/CLAUDE.md "Write-spec discipline".
└── lib/
    ├── actions/               Server Actions and validation schemas. See actions/CLAUDE.md for the owner-mode write pattern.
    ├── archetypes/            Per-user Archetype visibility gating (restricted.ts): an env-var email allowlist (e.g. ELEMENTAL_THIEF_EMAILS) keeping a shipped-but-gated Archetype out of source control. isArchetypeAllowedFor() gates the unlock action; hiddenArchetypeKeysFor() feeds buildLineageAtlas to omit gated Archetypes from a non-allowlisted viewer's Atlas. Server-only.
    ├── commands/              Command-palette registry (UNN-261): provider array + resolveCommands(ctx); navigation + vitals batches. Routes through existing Server Actions — no new write paths. Consumed by components/character-sheet/command-palette.tsx.
    ├── (game/ extracted to packages/game — see "packages/game" below)
    ├── ui/                    Cross-cutting UI utilities (labels)
    ├── realtime/              Ably invalidation pings (UNN-370; docs/realtime/ADR.md): lazy REST publish from the write choke points + a generic subscribe hook; no-ops to polling without ABLY_API_KEY. See realtime/CLAUDE.md.
    ├── db/                    Persistence, grouped by role (see below)
    ├── storage/               Vercel Blob storage
    └── auth/                  Auth.js
```

`lib/db/` is grouped by role (client/schema/migrations/queries/writes). The role
layout, the **wrapper naming rule**, and the version-guard composition pattern
live in **`apps/web/lib/db/CLAUDE.md`** (auto-loads when you work there).

### `packages/game` (`@workspace/game`)

The pure game engine + data, extracted from `apps/web/lib/game` (see
`docs/engine-reorg`). A runtime-pure leaf — no React/Next/DB — with three layers
under `src/` (`foundation → data → engine`), each its own barrel entry point. The
layer map, import/dependency rules, the lookup-port pattern, and the engine test
split + test-signal tooling live in **`packages/game/CLAUDE.md`** (auto-loads when
you work there).

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

- **Unit (Vitest):** pure game mechanics in `packages/game/src` — no DB, no network. (App/integration tests that need seed data live in `apps/web`, e.g. `apps/web/lib/__tests__/`.) Engine test-signal tooling (branch coverage + Stryker mutation) is documented in **`packages/game/CLAUDE.md`**.
- **E2E (Playwright):** `apps/web/e2e`. DB-backed routes require a seeded database. The two-tier CI model (`e2e` runner suite vs. `@smoke` preview subset), `@smoke`-tagging discipline, and the write-path factory pattern live in **`apps/web/e2e/CLAUDE.md`**.

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
