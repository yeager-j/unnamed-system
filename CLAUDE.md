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
7. **Write tests to enable confident refactoring.** Tests aren't just about verifying code works today, they're about maintaining the freedom to improve it tomorrow. Good tests let you iterate on implementation details while ensuring behavior remains consistent, turning what would be hours of debugging into seconds of test runs.


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

## Game Rules the App Must Understand

The full rules are in the Obsidian vault. What follows is the subset the app enforces or computes.

### Stats

**Attributes** (Strength, Magic, Agility, Luck): set entirely by the active Archetype's stat block. Not accumulated via leveling. Hard cap ±7. Apply in priority order: active Archetype score + permanent Mastery bonuses + equipped item bonuses. Clamp result to ±7.

**Virtues** (Expression, Empathy, Wisdom, Focus): Rank 0–7 each. Separate from Attributes; used for social/exploration checks. Created with +2 to one Virtue, +1 to two others, 0 to the fourth.

**HP/SP**: Determined by path choice at creation:
- Health-Focused: d12 Hit Die / d8 Skill Die, starting 24 HP / 40 SP
- Balanced: d10 / d10, starting 20 HP / 50 SP
- Skill-Focused: d8 / d12, starting 16 HP / 60 SP

Max HP = path starting HP + sum of Hit Die results on level-up + permanent HP bonuses (Mastery, equipment). MVP uses averages only (no player-rolled dice for level-up HP gain — the app accepts a player-entered roll result for Respite/Partial Rest die spending).

**Affinities** (11 damage types: Slash, Pierce, Strike, Fire, Ice, Wind, Elec, Aether, Psy, Light, Dark; plus Almighty): Priority order highest→lowest: Drain > Repel > Null > Resist > Neutral > Weak. Display the highest-priority source that applies. Sources: active Archetype's chart → equipment overrides → Skill overrides in the active Archetype's Inheritance Slots.

### Archetypes

Jobs/classes. One active at a time; switch only at a Respite. Each Archetype has Ranks 1–5. Mastering (Rank 5) grants a **permanent** bonus (specific to that Archetype) that persists even when inactive — but Attribute cap still applies. Each Archetype has a fixed number of Inheritance Slots (initiate tier = 2); slots hold a Skill from any other unlocked Archetype's available Skills at the character's current Rank in that source Archetype. Synthesis Skills cannot be inherited.

Origin Archetype: the one chosen at creation. Sets Rank 2 and unlocks Ranks 1–2 Skills. Also determines which Paragon Archetype is eventually unlockable (display-only at MVP).

Archetype Ranks are gained from leveling (+2 per level). They can be spent to rank up any unlocked Archetype or saved.

MVP ships four Archetypes: **Warrior, Knight, Mage, Healer**.

### Skill Casting

Each Skill costs either flat SP or a percentage of max HP. Resolve percentage costs against current max HP at display time (show concrete numbers). Disable Cast button if the character can't pay: current SP < SP cost, or current HP ≤ HP cost (can't drop to 0 HP by casting). On cast: deduct the resolved cost from the appropriate pool. Log the action (last 10, undoable). The app never rolls damage or applies effects to targets.

### Leveling

Victories threshold: 7 (Heroic Victory = 2; overflow carries forward). On level-up:
1. +1 Hit Die + +2 Skill Dice (player enters result or takes average; add to max HP and max SP)
2. +2 Archetype Ranks (spendable now or saved)
3. Victories decremented by 7; overflow carries

Max level: 30.

### Sparks & Virtue Rank-Up

Spark log holds 0–7 Sparks, each tagged with a Virtue. At 7 Sparks, surface a "Rank up" CTA. Eligible Virtues are those represented at least once in the current log. On rank-up: chosen Virtue +1 Rank, log clears entirely.

### Resting

- **Full Rest**: restore HP and SP to max, restore all spent dice, Exhaustion −1
- **Partial Rest**: restore HP to max; player chooses Skill Dice to spend for SP (app accepts player-entered result per die, deducts the dice)
- **Respite**: player chooses Hit Dice to spend for HP (same model); no SP recovery

### Prisma

Each character carries a Prisma flask. Default max 2 charges. "Use Prisma" decrements by 1. Player rolls and adjusts HP manually. Refills to max on Full Rest. Upgrade tree is deferred (rules are also TODO).

### Combat State (tracked, not computed)

Current ailment (one at a time; 13 possible), Battle Conditions (Attack/Defense/Hit-Evasion each: neutral/increased/decreased with stack counts), Charged toggle, Concentrating toggle, Exhaustion level. A "Clear combat state" button wipes all after combat.

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
