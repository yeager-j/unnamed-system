@AGENTS.md

## Tier + engine-import seams (`depcheck.mjs`)

The web app is **four tiers** — `app` (feature routes + private `_components`/`_hooks`),
`components` (cross-feature kits), `domain` + `lib` (the two data tiers). `depcheck.mjs`
runs on `npm run depcheck` and enforces three things:

- **Tier direction.** Import your own tier or DOWN, never UP: `app → components → domain ≈ lib`.
  `domain` and `lib` are **peers** (rank 2) — actions compose domain Writers, queries return
  domain shapes, loaders read `lib/db` — so their mutual imports are legal; the rule only
  forbids a data-tier file reaching up into `components`/`app`. Zero-tolerance.
- **Feature isolation.** A Next private `_`-folder (`_components`/`_hooks`) is importable only
  from within the directory that contains it, so one feature subtree can't reach into another's
  internals. Code two features share moves DOWN a tier (kit/domain/lib). Two pre-existing
  cross-feature reuses are grandfathered in `ISOLATION_ALLOWLIST` pending extraction (UNN-611);
  a *new* cross-feature import fails the gate.
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
