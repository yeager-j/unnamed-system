# Upstream: `atomic-editor` (vendored)

`@workspace/editor` is a **pristine mirror** of the open-source
`atomic-editor` — a CodeMirror 6 markdown editor with Obsidian-style inline
live preview. We vendor it shadcn-style: the hard behavioral engine
(parsing, decorations, viewport virtualization, input handling) lives in the
professionally-maintained `@codemirror/*` packages we consume from npm; the
~6k lines in `src/` are the *assembly* on top.

| | |
| -- | -- |
| Upstream | <https://github.com/kenforthewin/atomic-editor> |
| npm | `@atomic-editor/editor` |
| Vendored tag | `v0.6.2` |
| Vendored SHA | `b6ed65f01bde4510031bc7a495520bc1a7688c66` |
| License | MIT — © Kenny Bergquist (see `LICENSE`) |
| Vendored on | 2026-07-13 (UNN-619) |

## What is vendored

Everything under `src/` — source, unit tests (`src/__tests__/`, including the
**markdown-contracts** fixture suite), and CSS (`src/styles/`) — copied
**verbatim** from the `v0.6.2` tag, plus `LICENSE`. Upstream's `demo/`,
Playwright e2e (`tests/`, `playwright.config.ts`), and build scripts are **not**
vendored; our integration + e2e suites cover those concerns.

The package-root wiring (`package.json`, `tsconfig.json`, `vitest.config.ts`,
this file, `CLAUDE.md`) is **ours** — it adapts the mirror to this monorepo.
It is not part of the pristine tree and may be edited freely.

## The pristine-mirror policy

**We never edit inside `src/` while upstream is alive.** Our first-party code
builds on the package's public exports (`src/index.ts`); any modification,
extension, or override lives in `apps/web`, never as an edit here. This is
verified-feasible, not hoped: `src/index.ts` exports every composable piece,
and `wiki-links.ts` — the file we most need to build against — has exactly one
internal import (`readOnlyFacet`), which is itself public.

Why so strict: the first structural edit inside the tree ends cheap upstream
syncing forever, and upstream is at the steepest part of its improvement curve.
Theming overrides, chip extensions, and the controlled-value host all live
app-side (see `docs/editor/atomic-editor-technical-design.md` §5). If upstream
dies or turns a bad direction, the policy flips to "we own it now" with zero
migration.

## CodeMirror lives as a peer

`package.json` declares `@codemirror/*` / `@lezer/*` as **peerDependencies**
(upstream's own design) — `apps/web` owns the concrete versions as regular
dependencies. This keeps a single CM6 instance when `apps/web`'s first-party
extensions import `@codemirror/*` directly (the duplicate-instance hazard).
The identical versions appear here as `devDependencies` so the vendored tests
and typecheck run in isolation.

## The sync ritual (run every few weeks via a Claude session)

1. `git clone` (or fetch) upstream and diff the recorded SHA above → upstream
   `HEAD` (or the latest tag).
2. Review the diff. It is small by design — the mirror is assembly, not engine.
3. Copy the new `src/` + `LICENSE` in verbatim; re-run `npm run test` (vendored
   suites) and the `apps/web` e2e.
4. If a peer range moved, bump the matching `apps/web` dependency + this
   package's `devDependencies` together (keep them identical to avoid a
   duplicate install).
5. Update the **Vendored tag / SHA / on** rows above.

If the diff is large or upstream changed direction adversely, that is the
signal to consider flipping to full ownership — a policy change, not a code
migration.
