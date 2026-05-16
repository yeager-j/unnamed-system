# Persona System — Character Sheet App

A Next.js web app for creating and managing characters in the Persona System tabletop RPG. The game rules live in `/Users/jackson/Obsidian/Persona System/` (an Obsidian vault with a comprehensive `CLAUDE.md` index). The product spec is in that vault's `PRD.md`.

## Code Style

> *Perfection is lots of little things done well*
>
>
> — Marco Pierre White
>


1. **Keep it simple; don't get clever.** As the great Brian Kernighan said, *"Everyone knows that debugging is twice as hard as writing a program in the first place. So if you're as clever as you can be when you write it, how will you ever debug it?"*
2. **Give functions clear names and purposes.** Each function should have one job and do it well. Avoid side effects where possible. Pure, single-purpose functions are easy to test and maintain.
3. **Avoid inline comments.** If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions. Barring some unusual techniques for performance reasons, your code should read like a sentence. Again, as the great Brian Kernighan said, *“Don’t comment bad code — rewrite it!”* However, always write documentation (e.g. JSDocs).
4. **Resist premature abstraction.** Just because two pieces of code look similar doesn't mean they should be combined. Every abstraction introduces coupling, creating dependencies that make future changes more difficult.
5. **Favor composition over inheritance.** This creates more flexible code with fewer hidden dependencies. Inheritance expects you to bundle common behavior into a parent type, but as soon as you find an exception to the commonality, an expensive refactor is required. If you think your inheritance structure is perfect, remember that change is the enemy of perfect design.
6. **Avoid nesting the Happy Path.** If your Happy Path is nested within a bunch of conditionals, try inverting the conditions and using early return statements. If the conditionals are complex, it might be worth extracting them into their own bite-sized functions.
7. **Write tests to enable confident refactoring.** Tests aren't just about verifying code works today; they're about maintaining the freedom to improve it tomorrow. Good tests let you iterate on implementation details while ensuring behavior remains consistent, turning what would be hours of debugging into seconds of test runs.


## Repo Structure

Turborepo monorepo with npm workspaces:

```
apps/web/          Next.js 16 app (App Router, RSC, Server Actions)
packages/ui/       Shared component library (shadcn/ui, Tailwind CSS 4)
packages/eslint-config/
packages/typescript-config/
```

## Commands

```bash
npm run dev        # Start all packages in watch mode (Turbopack)
npm run build      # Production build
npm run typecheck  # tsc --noEmit across all packages
npm run lint       # ESLint across all packages
npm run format     # Prettier across all packages
```

Run app-specific commands from the package directory (e.g., `cd apps/web && npm run dev`).

## Tech Stack

- **Framework**: Next.js 16, App Router, React Server Components, Server Actions
- **UI**: Tailwind CSS v4, shadcn/ui, Phosphor Icons
- **Auth**: Auth.js v5 (NextAuth) with Google OAuth only; Drizzle adapter
- **Database**: Neon Postgres via Drizzle ORM; migrations via `drizzle-kit`
- **Storage**: Vercel Blob for portrait uploads
- **Validation**: Zod + react-hook-form; same Zod schemas validate Server Action inputs
- **Short IDs**: nanoid (8-char URL-safe) for public character URLs `/c/{shortId}`
- **Hosting**: Vercel + Neon + Vercel Blob
- **Testing**: Vitest (game mechanics unit tests), Playwright (E2E for builder + cast/heal/rest loop)

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

The full rules are indexed in `/Users/jackson/Obsidian/Persona System/CLAUDE.md`. When in doubt about a mechanic, read the relevant file from that vault rather than guessing.
