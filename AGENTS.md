# Showtime! — Character Sheet App & Virtual Tabletop

A Next.js web app for creating and managing characters in the Persona System tabletop RPG. The game rules live in a **sibling Obsidian-vault repo** at `/Users/jackson/Developer/Showtime/rules` (its own git repo with a comprehensive `CLAUDE.md` index — extracted from `packages/rules` 2026-07-07).

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

If you can't answer those questions, don't write the hack. A hack should _only_ be written if the root cause has been searched for and is definitively unknown, or it has been explicitly decided that the hack is acceptable.

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
8. **Promote normative comments to enforcement (Design by Contract).** A comment in the imperative mood — "MUST", "never", "keep in sync" — is an unexecuted contract: a rule the machine could check but only pleads for. Promote it to the strongest proportionate check — type, exhaustive table, property-tested law, CI gate, runtime assert — and let comments answer only "why it's this way", never "what you must do".
9. **Decide a distinction once (Meyer's Single Choice Principle, Replace Conditionals with Polymorphism).** Which storage home, which variant, which path — resolve it at the boundary where it's first knowable, into a value, type, or handler that leaves everything downstream blind to it.
10. **Home state on the object whose lifetime matches it.** Every fact lives exactly one lifetime; store it on the object that shares that lifetime. The diagnostic: **when every option for moving state around feels bad — copying it forward, folding it into a summary, re-deriving it with an ugly scan — stop comparing the options and question the home.** The state is almost certainly living on an object with the wrong lifetime, and the fix is structural, not a cleverer copy. This is #9's sibling: #9 says decide a distinction once; #10 says a fact's storage home is itself such a decision — and the giveaway for both is multiplicity: there of branches, here of copies.

### Code Conventions

- When creating branches, refer to the Linear ticket's `gitBranchName`. If not working from a ticket, use the branch name `feature/my-feature`.
- Reuse existing `Result` utility where appropriate.
- Avoid prop-drilling. A character surface reads the loaded `{ profile, entity, resolved }` triple from its route provider (`domain/character/load.ts`; see `domain/character/CLAUDE.md`) and writes through `useEntityWrite`. When you feel like you're prop drilling, stop and consider if a Context or another approach would be better.
- Avoid creating `switch` statements if there's a strong possibility that the number of cases will be high. Consider patterns such as a Registry, like the Mechanics Registry in `packages/game-v2/src/mechanics`.
- **Display labels live in `apps/web/lib/ui/labels.ts`.** Any `Record<X, string>` map that turns a domain key into a human-readable string (damage types, attributes, lineages, ranges, etc.) goes there — don't redefine inline, even for a one-off consumer.
- **Per-tab data shaping lives next to the data, not in the component.** Catalog-dependent shaping may live in `packages/game-v2/src/<domain>/`, but its interface is named for game content; when a surface needs selection, partitioning, or merging, that shaping lives in `apps/web/domain/<domain>/view/` and the component calls one view builder. A plain engine read needs no builder — import it from `@/domain/game-engine-v2` directly (a zero-decision pass-through is vestigial indirection, not a seam).
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
- **Leave the codebase better than you found it.** If you're about to reach for a type cast that papers over a real mismatch (as unknown as X), duplicate logic because the shared abstraction is awkward, suppress a lint or type error, write a TODO that hides a correctness issue, or add a special-case branch with no precedent — stop and ask. The user will tell you whether to fix the underlying issue in the current ticket or file a follow-up tech-debt ticket. This applies in auto-mode too; the bar to interrupt is higher but the bar for code quality isn't.

**Retrospective at the end of every ticket.** When the implementation lands, briefly consider what slowed you down — friction in the type system, repeated patterns the abstractions don't cover, missing primitives, awkward seams between layers — and surface them with the user. An empty list is a fine outcome; padded lists are worse than silence. The user decides whether to act, file a DX ticket, or skip. If the retrospective surfaced a principle that was uncovered or invoked, capture it via the `/lessons` skill (`docs/lessons/`). Before opening a PR, run `/recall` — the read half — to check the diff against the recorded lessons.

As part of the retrospective, if you noticed anything that could be improved about the code near your changes that might have been out of scope for this ticket, surface it. Again, an empty list is a fine outcome; padded lists are worse than silence.

**Worktrees (parallel tickets).** Each worktree is a separate checkout with its own node_modules — after merging main, run `npm install` if package.json/lockfile changed (a new dep typechecks as "Cannot find module" until you do). Run build/lint/test/dev from the worktree path, not the main checkout (the shell cwd resets between calls). The web launch config uses autoPort, so parallel dev servers won't fight over port 3000.

## Repo Structure

Turborepo monorepo with npm workspaces:

```
apps/web/          Next.js 16 app (App Router, RSC, Server Actions)
packages/game-v2/  The game engine + data (@workspace/game-v2) — the v1 packages/game was retired in UNN-594. Domain-first layout (kernel/ substrate + one folder per domain/PR + catalog/ authored content), depcheck.mjs-gated (ports-not-catalog + one-way spatial seam). Design in docs/engine-v2/. UNN-563 (S5) renames it @workspace/game-v2 → @workspace/game
packages/ui/       Shared component library (shadcn/ui, Tailwind CSS 4)
packages/eslint-config/
packages/typescript-config/
docs/               Long-form feature specs (PRD/ADR/technical design), one folder
                    per feature (e.g. docs/initiative-tracker/). Canonical source
                    of truth; Linear docs are stubs linking here. docs/brand/ holds
                    the visual-identity brand guide ("mystical theater", dark-only:
                    indigo hero, gold accent, DM Serif Display + Hanken Grotesk).
                    Specs that gate code live HERE; heavy design artifacts do not
                    (see Sibling repos below). docs/lessons/ is the wound journal —
                    one dated file per named lesson, written via the /lessons skill;
                    lessons are candidate Code Style principles in escrow.
```

**Sibling repos** (each its own git repo, readable via `additionalDirectories` in `.claude/settings.json`):

- `/Users/jackson/Developer/Showtime/rules` — the game-rules Obsidian vault (extracted from `packages/rules`, history preserved). Read its `CLAUDE.md` index first, as before.
- `/Users/jackson/Developer/Showtime/artifacts` — write-once design handoffs/prototypes/screenshots, grouped by feature (e.g. `artifacts/campaign-planner/design_handoff_campaign_clock/`). PRDs point here.

The app repo lives at `/Users/jackson/Developer/Showtime/showtime-app` (moved 2026-07-07 from `~/Developer/unnamed-system`, making these true siblings); when creating **worktrees**, put them under `Showtime/` as siblings so any relative pointers keep resolving.

Inside `apps/web/` — the tree is **feature-first over four tiers** (UNN-610),
with a machine-checked dependency gradient `app → components → domain ≈ lib`
(no upward imports; `domain`/`lib` are peers) plus **feature isolation**: a
route subtree's private `_components`/`_hooks` folder is importable only within
its own subtree. Both are enforced by `depcheck.mjs` (see the seam note in
`apps/web/CLAUDE.md`).

```
apps/web/
├── app/                       Feature subtrees — Next routes + co-located private _components/ + _hooks/ (UNN-608 URL tree, UNN-610 colocation). Each feature's local UI lives under its route: characters/[shortId]/_components (sheet) + builder/_components + atlas/_components; campaigns/_components (list+manage) + campaigns/[campaignShortId]/{encounter,dungeon}/[shortId]/_components (the console/setup/watch pages share it) + their _hooks/; maps/_components + _hooks; app/_components (home + the shared SignedOutLanding). Route loaders stay co-located as *-access.ts (dungeon-access.ts `getDungeonForDM`); the shared DM combat loader getEncounterForDM moved down to domain/combat/load-encounter-for-dm.ts (UNN-610) since encounter + dungeon + the combat kit all read it. lib/paths.ts is the single source of URL truth; old /c, /combat, /dungeon, /builder addresses were retired.
├── components/                The **kit tier** — cross-feature presentation, shared by ≥2 features. Only the five kits remain after UNN-610 moved every feature folder into app/:
│   ├── combat/                **Shared combat UI kit** (UNN-492): route-agnostic combat components rendered by both the mapless encounter and the dungeon combat canvas. See combat/CLAUDE.md.
│   ├── archetype/             Archetype rendering kit shared by the sheet + builder + atlas (does not reach into any of them).
│   ├── shared/                Cross-feature primitives: DetailSection, ResolvedSkillRow + its popover subsystem, Prose, the shared sheet-widget set the sheet + combat watch render (SectionLabel, VitalsBlock, AdjustPoolControl, AffinityStrip, SkillCastSection, mechanics/ — promoted here in UNN-609), and shared/canvas/ (route-agnostic React Flow primitives the Map editor + dungeon console share, UNN-464).
│   ├── editor/                Markdown editor primitives shared by sheet + builder.
│   └── shell/                 App chrome (site header, auth, theme, viewer-role).
├── e2e/                       Playwright specs
│   └── fixtures/              E2E test-data factory (UNN-343). factory.ts mints ephemeral characters/campaigns/encounters with unique-per-run ids + a CleanupTracker (afterAll cleanup); each write spec's <thing>-target.ts wraps it as createXTarget(tracker) returning helpers bound to the new id. encounter-target.ts is the kept seeded combat showcase (campaigns A/B + encounters) for encounter-shell/join. See e2e/CLAUDE.md "Write-spec discipline".
├── domain/                   ← the app's model of the game (UNN-606). A data tier (peer of lib): may import @workspace/game*; may not import app/ or components/. view/ACL builders + the shared combat DM loader (load-encounter-for-dm.ts) + builder-steps/gates + identity-trait-messages live here. Client hooks whose consumers span features or kits also home here (use-entity-write in domain/entity, use-encounter-snapshot + the enemy-queue model in domain/combat).
│   ├── entity/               Neutral (client+server) durable-entity write vocabulary (UNN-551): commit/ holds the serializable entityWriteSchema descriptor + the ENTITY_WRITERS pure predictors shared by the entity write door (lib/actions/entity/) and combat's console optimistic container. use-entity-write.tsx (the provider + hook fronting the write door) homes here (UNN-610) — its consumers span kits + 5 features.
│   ├── game-v2/              entity-row-to-bag.ts is the assemble seam (entity row → runtime Entity, the successor to rawInputsToEntity).
│   ├── archetypes/           Per-user Archetype visibility gating (restricted.ts): an env-var email allowlist (e.g. ELEMENTAL_THIEF_EMAILS) keeping a shipped-but-gated Archetype out of source control. isArchetypeAllowedFor() gates the unlock action; hiddenArchetypeKeysFor() feeds buildLineageAtlas to omit gated Archetypes from a non-allowlisted viewer's Atlas. Server-only.
│   ├── combat/               Neutral (client+server) v2 combat vocabulary: console-optimistic.ts (the console's optimistic container, consumed via components/combat/console/use-combatant-write — UNN-535); view/ (pure view builders the combat kit + watch render); snapshot-version.ts (the composite snapshot-version fold — UNN-530); participant-meta.ts + load-encounter-for-dm.ts (the DM loader + its shape, shared by encounter + dungeon + the kit — homed here in UNN-610); the cross-feature combat client hooks use-encounter-snapshot + staged-enemy-queue/use-staged-enemy-queue.
│   ├── character/            The v2 character read side (ADR §2.6; UNN-556/557): load.ts is the one load boundary (`loadCharacterByShortId` → { profile, entity, resolved }) the builder + sheet mount; view/ holds the pure per-surface builders (rail-view, affinity-strip, skill-sources). builder-steps.ts + builder-step-gates.ts (builder domain logic read by lib + domain) and identity-trait-messages.ts moved here in UNN-610. See character/CLAUDE.md.
│   └── game-engine-v2.ts     The app's engine composition root — binds the game-v2 catalog once and re-exports the pre-bound functions app code calls (`resolveEntity`, `resolveSession`, the builder/sheet reads).
└── lib/                       The plumbing data tier (peer of domain): db/ auth/ storage/ realtime/ ui/ + the sync/write cluster. May import @workspace/game* + domain; may not import app/ or components/.
    ├── actions/               Server Actions + schemas — the write-side seam. Stay here (not colocated in features): nearly every action imports the engine (Result etc.), so lib (ungated) is their home (UNN-610). See actions/CLAUDE.md for the write pattern. actions/entity/ (UNN-551) is the durable-entity write door: applyEntityWriteAction + commitEntityWrite + bumpEntityVersionGuarded — the shared Store combat's durable arm forwards to.
    ├── sync/                  The sync/write-queue hook cluster (UNN-610): write-queue, use-queued-write, version-token-store, version-ping, use-realtime-channel, use-snapshot-subscription, use-monotonic-version-ref, fetch-{encounter,instance}-version, character-version-sync — generic realtime/version transport shared across features.
    ├── ui/                    Cross-cutting UI utilities (labels)
    ├── realtime/              Ably invalidation pings (UNN-370; docs/realtime/ADR.md): lazy REST publish from the write choke points + a generic subscribe hook; no-ops to polling without ABLY_API_KEY. See realtime/CLAUDE.md.
    ├── db/                    Persistence, grouped by role (see below)
    ├── storage/               Vercel Blob storage
    └── auth/                  Auth.js
```

`lib/db/` is grouped by role (client/schema/migrations/queries/writes). The role
layout, the **wrapper naming rule**, and the version-guard composition pattern
live in **`apps/web/lib/db/CLAUDE.md`** (auto-loads when you work there).

### `packages/game-v2` (`@workspace/game-v2`)

The capability/component game engine + data — the sole engine since the v1
`packages/game` was retired (UNN-594). A runtime-pure leaf (no React/Next/DB)
laid out domain-first: a `kernel/` component substrate, one folder per domain,
and a `catalog/` of authored content behind the `GameData` port. The model,
core invariants, layout, dependency gradient, and `depcheck.mjs` gates live in
**`packages/game-v2/CLAUDE.md`** (auto-loads when you work there). The app binds
the catalog once in `apps/web/domain/game-engine-v2.ts`.

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

- **Unit (Vitest):** pure game mechanics in `packages/game-v2/src` — no DB, no network. (App/integration tests that need seed data live in `apps/web`, e.g. `apps/web/lib/__tests__/`.) Engine test-signal tooling (branch coverage + Stryker mutation) is documented in **`packages/game-v2/CLAUDE.md`**.
- **Laws (fast-check):** `**/__laws__/*.laws.test.ts` — property-based tests over `arbitraryEntity`, quantified where an example test can only sample (UNN-598). Totality + the depletion algebra live in `packages/game-v2`; the optimistic-isomorphism law (Writer patch + re-fold ≡ commit → reload → resolve, over all 13 write families) lives in `apps/web/domain/entity/commit/__laws__/`, because the Writers do. Writing arbitraries and reproducing a failing seed (`FC_SEED`) are documented in **`packages/game-v2/CLAUDE.md`**.
- **E2E (Playwright):** `apps/web/e2e`. DB-backed routes require a seeded database. The two-tier CI model (`e2e` runner suite vs. `@smoke` preview subset), `@smoke`-tagging discipline, and the write-path factory pattern live in **`apps/web/e2e/CLAUDE.md`**.

## Tech Stack

- **Framework**: Next.js 16, App Router, React Server Components, Server Actions
- **UI**: Tailwind CSS v4, shadcn/ui, Phosphor Icons
- **Auth**: Auth.js v5 (NextAuth) with Google OAuth only; Drizzle adapter
- **Database**: Neon Postgres via Drizzle ORM; migrations via `drizzle-kit`
- **Storage**: Vercel Blob for portrait uploads
- **Validation**: Zod + react-hook-form; same Zod schemas validate Server Action inputs
- **Short IDs**: nanoid (8-char URL-safe) for public character URLs `/characters/{shortId}`
- **Hosting**: Vercel + Neon + Vercel Blob
- **Testing**: Vitest (game mechanics unit tests), Playwright (E2E for builder + cast/heal/rest loop) — see the Testing section above

Game data (Archetypes, Skills, Talents, Ailments, Enemies) is **hardcoded TypeScript** in the repo (`packages/game-v2/src/catalog/`) — not in the database. A shipped-but-gated Archetype (`elemental-thief`) sits in the catalog unconditionally and is hidden per-viewer via the Atlas's `hiddenArchetypeKeys` (an env-var email allowlist, `domain/archetypes/restricted.ts`), not a build flag.

## Game Rules

When you need to read about the rules of the game, first check the `CLAUDE.md` index file located in the Obsidian vault. If you need further clarification, read the full rule text.
