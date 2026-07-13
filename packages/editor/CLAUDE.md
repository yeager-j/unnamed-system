# `@workspace/editor` — vendored `atomic-editor` (pristine mirror)

**Do not edit anything under `src/`.** This package is a *pristine mirror* of
the open-source `atomic-editor` (CodeMirror 6 Obsidian-style live-preview
markdown editor), vendored shadcn-style. Extensions, theming, and overrides
live in `apps/web` against the package's public exports (`@workspace/editor`) —
never as edits inside this tree.

Read **`UPSTREAM.md`** for the full policy: what is vendored, the sync ritual,
and why the tree stays untouched while upstream is alive.

Consequences worth knowing before you touch this folder:

- **`src/` is not subject to our lint / prettier / style rules.** The package
  boundary marks the vendor seam. `src/` is listed in the repo `.prettierignore`
  so `lint-staged` can't reformat it on commit. There is intentionally no
  `lint`/`format`/`depcheck` script here.
- **`tsconfig.json` / `vitest.config.ts` mirror upstream's** (bundler module
  resolution, the `@atomic-editor/editor` self-alias) so the vendored code +
  tests compile and run unmodified. These package-root files are ours to edit;
  the `src/` tree is not.
- **Consumed as a typed black box, not as source.** `apps/web` is stricter than
  upstream (`noUncheckedIndexedAccess`), so re-typechecking the vendored `src/`
  under our flags would spuriously fail — and we may not edit the tree to satisfy
  our rules. The `exports` map therefore points the `types` condition at emitted
  declarations (`dist/*.d.ts`, produced by `build` = `tsc -p tsconfig.build.json`,
  `emitDeclarationOnly`) which `skipLibCheck` skips, while the runtime `default`
  condition still points at `src/` (Next transpiles it via `transpilePackages`).
  Turbo's `typecheck` `dependsOn: ["^build"]`, so the declarations exist before a
  consumer typechecks; `dist/` is gitignored and regenerated, never committed.
- **CM6 / Lezer are peerDependencies** (mirroring upstream); `apps/web` owns the
  concrete versions. If a version moves, bump both in lockstep (UPSTREAM.md §sync).
- **The vendored Vitest suites run under `npm run test`** (turbo), including the
  markdown-contracts fixtures. Upstream's Playwright e2e is excluded — our own
  e2e covers integration.
