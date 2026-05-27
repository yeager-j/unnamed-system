# Unnamed System — Character Sheet App

A Next.js web app for creating and managing characters in the Persona System tabletop RPG. The game rules live in `packages/rules` (an Obsidian vault with a comprehensive `CLAUDE.md` index). The product spec is in that vault's `PRD.md`.

## Installation & Running the App
This is a Turborepo project, so most commands are run from the root directory. To install dependencies, run `npm install`. To start the dev server, run `npm run dev` from the root directory.

shadcn/ui primitives should be installed from the `packages/ui` directory, not the root. Similarly, when installing dependencies to the `apps/web` directory, run `npm install` from there (not the root).

## PRD Considerations

- The rules in the Obsidian vault are the source of truth for the game mechanics. If they conflict with the PRD, update the PRD.
- If technical decisions are made that conflict with the PRD, update the PRD.

## Code Style

> *Perfection is lots of little things done well*
>
>
> — Marco Pierre White
>

1. **Keep it simple; don't get clever.** As the great Brian Kernighan said, *"Everyone knows that debugging is twice as hard as writing a program in the first place. So if you're as clever as you can be when you write it, how will you ever debug it?"*
2. **Give functions and files clear names and purposes.** Each function should have one job and do it well. Avoid side effects where possible. Pure, single-purpose functions are easy to test and maintain. The same principle applies to files; each file should do one thing well.
3. **Avoid inline comments.** If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions. Barring some unusual techniques for performance reasons, your code should read like a sentence. Again, as the great Brian Kernighan said, *“Don’t comment bad code — rewrite it!”* However, always write documentation (e.g. JSDocs).
4. **Resist premature abstraction.** Just because two pieces of code look similar doesn't mean they should be combined. Every abstraction introduces coupling, creating dependencies that make future changes more difficult.
5. **Favor composition over inheritance.** This creates more flexible code with fewer hidden dependencies. Inheritance expects you to bundle common behavior into a parent type, but as soon as you find an exception to the commonality, an expensive refactor is required. If you think your inheritance structure is perfect, remember that change is the enemy of perfect design.
6. **Avoid nesting the Happy Path.** If your Happy Path is nested within a bunch of conditionals, try inverting the conditions and using early return statements. If the conditionals are complex, it might be worth extracting them into their own bite-sized functions.
7. **Write tests to enable confident refactoring.** Tests aren't just about verifying code works today; they're about maintaining the freedom to improve it tomorrow. Good tests let you iterate on implementation details while ensuring behavior remains consistent, turning what would be hours of debugging into seconds of test runs.
8. **Leave the codebase better than you found it.** If you're about to reach for a type cast that papers over a real mismatch (as unknown as X), duplicate logic because the shared abstraction is awkward, suppress a lint or type error, write a TODO that hides a correctness issue, or add a special-case branch with no precedent — stop and ask. The user will tell you whether to fix the underlying issue in the current ticket or file a follow-up tech-debt ticket. This applies in auto-mode too; the bar to interrupt is higher but the bar for code quality isn't.

### Code Conventions

- When creating branches, refer to the Linear ticket's `gitBranchName`. If not working from a ticket, use the branch name `feature/my-feature`.
- Reuse existing `Result` utility where appropriate.
- Avoid prop-drilling. `HydratedCharacter` is supplied via `useCharacter()`. When you feel like you're prop drilling, stop and consider if a Context or another approach would be better.
- Avoid creating `switch` statements if there's a strong possibility that the number of cases will be high. Consider patterns such as a Registry, like the Mechanics Registry in `apps/web/lib/game/mechanics`.
- **Display labels live in `apps/web/lib/ui/labels.ts`.** Any `Record<X, string>` map that turns a domain key into a human-readable string (damage types, attributes, lineages, ranges, etc.) goes there — don't redefine inline, even for a one-off consumer.
- **Per-tab data shaping lives next to the data, not in the component.** The inline `.filter().map()` blocks that turn hydrated state into the shape a section renders should be a pure helper in `lib/game/<domain>/` (e.g. `resolve-inventory.ts`, `archetypes/display.ts`) — the tab root calls one helper and focuses on layout.
- Never put game logic in the UI layer. The UI should simply render what the game engine provides it.

### Habits

- Default to direct, targeted reads (grep + Read on the specific files) over launching Explore or parallel subagents. Token count explodes when parallel subagents are involved, so ask the user before spawning them.
- User has enabled the "Auto-fix CI & address comments" setting. If things are nominal, reply briefly that there is nothing actionable. Only elaborate if there is a problem. For example, "Both comments are routine; disregarding."
- When doing UI work, run the dev server and view the result in the browser before reporting done. Treat the first render as a draft: iterate on the design, and experiment with several approaches and pick the best one rather than shipping the first thing that works.
- Similarly, include a design proposal (can be pure text; image mockups are not necessary) in the Plan when Plan Mode is enabled.
- As this is a personal project and low-stakes, commiting important files (like CLAUDE.md) that you didn't touch is fine. You should still avoid committing files that are completely unrelated to the PR.
- When building UI components, see if there is a shadcn/ui component that already does what you need.
- User may sometimes accidentally leave the dev server on port 3000 running. It's fine to kill it so you can restart it via your preview tools.
- When you need to flip the signed-in/signed-out state in a browser preview during UI work, use POST /api/dev/sign-in and POST /api/dev/sign-out — recipe in the route JSDocs. Don't try to delete the session cookie from JS (it's httpOnly).
- When you create new folders, add them to this document's **Repo Structure** section. Ensuring this section is up-to-date allows future Claude instances to know where relevant code is without having to dig through the repo.

**Retrospective at the end of every ticket.** When the implementation lands, briefly consider what slowed you down — friction in the type system, repeated patterns the abstractions don't cover, missing primitives, awkward seams between layers — and surface them with the user. An empty list is a fine outcome; padded lists are worse than silence. The user decides whether to act, file a DX ticket, or skip.

## Repo Structure

Turborepo monorepo with npm workspaces:

```
apps/web/          Next.js 16 app (App Router, RSC, Server Actions)
packages/ui/       Shared component library (shadcn/ui, Tailwind CSS 4)
packages/eslint-config/
packages/typescript-config/
packages/rules/     Obsidian vault with game mechanics rules
```

Inside `apps/web/`:

```
apps/web/
├── app/                       Next routes
├── components/
│   ├── builder/               Character builder chrome + per-movement bodies under movements/{corpus,ortus,animus,persona}/
│   ├── shell/                 App chrome (site header, auth, theme)
│   ├── character-sheet/       Sheet feature (tabs, sections, owner controls)
│   ├── archetype/             Archetype rendering kit shared by sheet + builder (does not reach into either)
│   ├── shared/                Cross-feature primitives: DetailSection, SkillRow + its popover subsystem, Prose, etc.
│   ├── editor/                Markdown editor primitives shared by sheet + builder
│   └── my-characters/
├── hooks/                     Providers + non-UI hooks (useCharacter, etc.)
├── e2e/                       Playwright specs
│   └── fixtures/              Per-spec seed-character fixtures (write-target, delete-target, cast-target). Each owns its SeedCharacter + DB-poke reset helpers; lib/db/seed.ts iterates DEV_USER_E2E_FIXTURES.
└── lib/
    ├── actions/               Server Actions and validation schemas. README contains instructions for the owner-mode write pattern.
    ├── game/                  Game data + per-domain helpers and display shaping
    ├── ui/                    Cross-cutting UI utilities (labels)
    ├── db/                    Drizzle schema and loaders
    ├── storage/               Vercel Blob storage
    └── auth/                  Auth.js
```

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

- **Unit (Vitest):** pure game mechanics in `apps/web/lib/game` — no DB, no network.
- **E2E (Playwright):** `apps/web/e2e`. DB-backed routes require a seeded database.

**E2E database:**

E2E runs against the **Vercel preview deployment**, triggered by Vercel's `vercel.deployment.success` `repository_dispatch` (`.github/workflows/e2e.yml`). The workflow checks out `client_payload.git.sha`, resolves the deployment's `preview/<branch>` Neon branch connection string via `neonctl`, migrates + seeds that branch, then runs Playwright against `client_payload.url`. No extra Neon branch is created and there is no deploy/timing race — the deployment and its branch already exist when the dispatch fires. The job only runs for `environment == 'preview'`; production deploys are never seeded. The `e2e` commit status is a fail-closed required check on `main`: no preview deploy ⇒ no dispatch ⇒ status never reported ⇒ the PR cannot merge. `preview/<branch>` is deleted on PR close by `.github/workflows/neon.yml`.

Locally, `playwright.config.ts` starts `npm run dev` when `BASE_URL` is unset, preserving the inner loop.

**Write-path E2E (cast / heal / rest / level-up / spark):**

- Re-seed before *every* run. `db:seed` is idempotent and resets the character + archetype/knife/chain/talent/inventory rows, but **not** `actionLogEntries` — a spec that logs actions must clear its own log (or the seed must be extended to truncate it).
- Give each write spec its **own dedicated seed character** (or serialize write specs). Playwright is `fullyParallel`; two specs mutating the same seed row will flake. This is a test-design constraint, not an infra one.
- Writes stay within `seed-user`'s `seed-*` rows; mutating the shared preview DB is acceptable for the showcase roster given the per-run re-seed.

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

Game data (Archetypes, Skills, Talents, Ailments) is **hardcoded TypeScript** in the repo — not in the database.

## Game Rules

When you need to read about the rules of the game, first check the `CLAUDE.md` index file located in the Obsidian vault. If you need further clarification, read the full rule text.

## Data Model (Key Entities)

`User`, `Character` (with `shortId` for `/c/{shortId}` public URLs), `CharacterArchetype` (join with rank, inheritanceSlots, masteryBonusApplied), `CharacterKnife`, `CharacterChain`, `CharacterTalent`, `InventoryItem` (kind: weapon | armor | accessory | other; effects: affinity | attribute | skill), `ActionLogEntry`.

See PRD §8 for the full field list.

## App Surfaces

1. **Home / My Characters** — list of user's characters, "Create new character" CTA
2. **Character Builder** — 12-step linear flow (savable, back-navigable); see PRD §5
3. **Character Sheet (edit)** — owner's editable view; header, vitals, attributes, virtues, affinities, archetypes, skills, talents, equipment, identity, progression, combat state, notes
4. **Character Sheet (public)** — `/c/{shortId}`, read-only, same content, signed-out visible

## MVP Scope Limits

- No DM tooling, campaigns, or group features
- No dice rolling — app accepts player-entered numbers where rolls are required
- No Archetype prerequisite enforcement (display prerequisites as informational only)
- No Ancestry/Background structure — free text fields only
- No Prisma upgrade tree
- No Spoils deck simulation
- No multi-currency
- No item catalog — items are user-defined
- Game data changes require a redeploy

## Rulebook Reference

The full rules are indexed in `packages/rules/CLAUDE.md`. When in doubt about a mechanic, read the relevant file from that vault rather than guessing.
