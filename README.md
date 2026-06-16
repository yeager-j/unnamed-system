# Unnamed System

A Next.js web app for creating and managing characters in the **Persona System**
tabletop RPG. It provides a step-by-step character builder, an owner-editable and
publicly shareable character sheet, campaign management, and a live DM combat console
with a real-time player watch view.

The game rules are the source of truth and live in `packages/rules` — an Obsidian vault
with the full mechanics and the product spec (`PRD.md`).

## Tech Stack

- **Framework:** Next.js 16 — App Router, React Server Components, Server Actions
- **UI:** Tailwind CSS v4, shadcn/ui, Phosphor Icons
- **Auth:** Auth.js v5 (NextAuth) with Google OAuth, Drizzle adapter
- **Database:** Neon Postgres via Drizzle ORM (migrations via `drizzle-kit`)
- **Storage:** Vercel Blob (character portrait uploads)
- **Validation:** Zod + react-hook-form (the same Zod schemas validate Server Action inputs)
- **Monorepo:** Turborepo with npm workspaces
- **Testing:** Vitest (game-engine unit tests) + Playwright (E2E)
- **Hosting:** Vercel + Neon + Vercel Blob

## Repo Structure

A Turborepo monorepo with npm workspaces:

```
apps/web/          Next.js app (App Router, RSC, Server Actions)
packages/game/     Pure game engine + data (@workspace/game): foundation / data / engine layers
packages/ui/       Shared component library (shadcn/ui, Tailwind CSS v4)
packages/rules/    Obsidian vault — game mechanics rules + PRD (source of truth)
packages/eslint-config/
packages/typescript-config/
docs/              Long-form feature specs (PRD/ADR), one folder per feature
```

See [`CLAUDE.md`](./CLAUDE.md) for the detailed, per-directory map.

## Getting Started

### Prerequisites

- Node.js `>=22` (the repo pins Node `24` via `.nvmrc`)
- npm `10.9.2` (declared in `packageManager`)
- A Neon Postgres database

### Installation

1. Install dependencies from the repo root:

   ```bash
   npm install
   ```

2. Configure environment variables. Copy the example and fill in the values:

   ```bash
   cp .env.example apps/web/.env.local
   ```

   At minimum set `DATABASE_URL` / `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, and the
   Google OAuth credentials. See `.env.example` for the full list and notes on each
   variable.

3. Apply migrations and seed demo data (run from `apps/web`):

   ```bash
   cd apps/web
   npm run db:migrate
   npm run db:seed
   ```

### Development

Start the dev server from the repo root:

```bash
npm run dev
```

The app runs at http://localhost:3000.

## Commands

Run from the repo root (Turborepo fans these out across packages):

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Start all packages in watch mode         |
| `npm run build`     | Production build                         |
| `npm run lint`      | ESLint across all packages               |
| `npm run format`    | Prettier across all packages             |
| `npm run typecheck` | `tsc --noEmit` across all packages       |
| `npm run test`      | Vitest across all packages               |
| `npm run test:e2e`  | Playwright E2E                           |

App- and database-specific commands (`db:migrate`, `db:seed`, `db:studio`, …) run from
`apps/web`. shadcn/ui primitives are installed from `packages/ui`.

## Testing

- **Unit (Vitest):** pure game mechanics in `packages/game/src` — no DB, no network.
- **E2E (Playwright):** `apps/web/e2e` — DB-backed routes require a seeded database.

See the Testing section of [`CLAUDE.md`](./CLAUDE.md) for the engine test-signal tooling
(coverage, mutation) and the two-tier E2E setup.

## Further Reading

- [`CLAUDE.md`](./CLAUDE.md) — repo conventions, architecture, and contributor guidance
- [`packages/rules/PRD.md`](./packages/rules/PRD.md) — product spec
- [`packages/rules/CLAUDE.md`](./packages/rules/CLAUDE.md) — game mechanics index
