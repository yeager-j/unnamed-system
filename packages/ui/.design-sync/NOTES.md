# design-sync NOTES — @workspace/ui (Showtime! Design System)

Repo-specific gotchas for future syncs. Read this first.

## Build / shape
- **Shape:** package. No prior build existed; this sync added one (`build:sync`).
- `buildCmd` = `npm run build:sync` = `tsc -p tsconfig.build.json` (emits `dist/**/*.d.ts`
  — the prop contracts) **and** `node .design-sync/build-css.mjs` (compiles the Tailwind v4
  stylesheet to `dist/styles.css`, the `cssEntry`). Both are required before the converter.
- Converter entry is the **source barrel** `src/index.ts` (`--entry ./src/index.ts`), a
  generated `export *` of every component/hook/lib file. esbuild bundles the TSX directly;
  the `.d.ts` tree in `dist/` (found via `pkgJson.types`) supplies the prop contracts.
- `--node-modules` must be the **repo root** `../../node_modules` — `packages/ui/node_modules`
  is sparse (React/Base UI are hoisted).
- `tsconfig` = `./tsconfig.json` so esbuild resolves the internal `@workspace/ui/*` self-alias.

## Styling (dark-only brand)
- The app compiles Tailwind at runtime and loads fonts via `next/font`; the DS ships neither.
  `src/styles/sync.css` (the compile entry) fixes this in isolation:
  - pulls the four brand faces from Google Fonts (`@import url(...)`) → validate reports
    `[FONT_REMOTE]` (expected, non-blocking) and gives `--font-sans/display/serif/mono`
    concrete values.
  - `@custom-variant dark (&)` — activates `dark:` utilities unconditionally (the app always
    renders under next-themes' permanent `.dark`; `:root` already holds the dark palette).
  - **Preview-chrome dark background** via `body:has(> .ds-grid), body:has(> .ds-single)` +
    `.ds-cell` restyle. Scoped to the emitter's own classes so it NEVER leaks into designs the
    agent builds. Without it, the emit template's hardcoded white body would show dark-only
    components on white with illegible near-white text.

## Component list — flat-export collapse (IMPORTANT)
- shadcn exports every subpart flat (`CardHeader`, `DialogContent`, `AccordionItem`…), so the
  converter discovers **222** components. The converter's compound-collapse only fires on
  namespace/static exports, which this DS doesn't use.
- `config.json` `componentSrcMap` nulls the **182 subparts**, leaving the **40 file-level roots**
  (first export of each `src/components/*.tsx`). Subparts stay in the bundle
  (`window.ShowtimeUI.*` = 222 exports) and are composed inside each root's authored preview.
- **Regenerate the null map** if components are added/removed: re-run the roots/subparts scan
  over `src/components/*.tsx` (roots = first PascalCase non-`*Props` export per file) and null
  everything else. Do not hand-edit 182 entries.

## Overrides ordering (the CONFIG_STALE trap — do this next time)
- Overlay/wide components need `cardMode`/`viewport` overrides (set in `config.json` `overrides`).
- **Set ALL overrides, then run a full `package-build.mjs`, THEN dispatch preview-authoring.**
  This sync added the overlay overrides *after* the build that preceded the subagent fan-out,
  so `preview-rebuild.mjs --components …` refused every overridden component with
  `[CONFIG_STALE]` (per-component cfgSlice in `.stories-map.json` predated the overrides). Fix
  was one orchestrator full `package-build.mjs` re-stamp. Non-overridden components were fine.
- Current single-mode overrides: AlertDialog, Sheet, Drawer, ResponsiveDialog, Popover, Tooltip,
  DropdownMenu, Select, Combobox, Command, Dialog, Sidebar. Column: Table.

## Per-component composition notes
- **Base UI overlays** render open via `defaultOpen` on the Root (Dialog/AlertDialog/Sheet/
  Drawer/Popover/DropdownMenu/Select/Combobox). **Tooltip** needs `TooltipProvider delay={0}`
  + `Tooltip defaultOpen`. **ResponsiveDialog** has **no `defaultOpen`** — use the `open` prop.
- **Command** is cmdk rendered **inline** (not `CommandDialog`, which portals).
- **Sidebar** requires `SidebarProvider` wrapper; preview uses `collapsible="none"` to avoid the
  fixed/offcanvas positioning collapsing inside a card.
- **Progress** needs a `value`; `ProgressValue` takes a **render-function child**, not text.
- **Toaster** (sonner) renders nothing until a toast exists — preview pushes a persistent
  `toast(..., {duration: Infinity})` on mount. Not a floor card.
- **TooltipButton** only wraps a tooltip when `disabled && disabledReason`, and it's hover-only —
  the bare Button is the graded card (correct/complete).

## Known render warns (triaged — a warn NOT here is new)
- `[FONT_REMOTE]` for Hanken Grotesk / JetBrains Mono / Source Serif 4 — expected (Google Fonts
  `@import`). Not `[FONT_MISSING]`.
- `[DTS_STYLE_SYSTEM]` filtering @types/react CSS-shorthand props — informational.
- 2 missing CSS custom properties (below threshold) — informational.
- **Skeleton**: `animate-pulse` freezes at a low-opacity phase under the capture, so bars read
  faint; framed in a bordered card so the loading composition still reads. Any pulsing component
  has this property under the harness.
- `[RENDER_THIN]` "rendered height 0px" for **AlertDialog, Dialog, Sheet, ResponsiveDialog,
  Toaster** — benign. These are `position:fixed`/portaled overlays (single-mode cards); the mount
  root measures 0px even though the screenshots show full content. Verified good by screenshot.
- `[GRID_OVERFLOW]` was resolved by overrides: **Progress** → `cardMode:column` (bars full-width,
  all 3 stacked), **Toaster** → `cardMode:single` (fixed toast shows inside the card).

## Re-sync risks (what can silently go stale)
- **Fonts are remote** (Google Fonts `@import`). If Google changes URLs or the design pane blocks
  the request, previews fall back to system fonts. Consider self-hosting `.woff2` via
  `cfg.extraFonts` if fidelity matters.
- **`componentSrcMap` (182 nulls) rots on component add/remove** — regenerate per the scan above;
  a new component silently ships as a card only if it's a root, and a new subpart silently
  becomes its own card unless nulled.
- **Overrides-before-build ordering** (above) — re-trips CONFIG_STALE if overrides change after a
  build but before a scoped rebuild.
- Previews assume the current APIs (read from source at author time); a breaking API change to a
  component surfaces as a broken preview on the next sync, not silently.
