# Atomic Editor — Implementation Plan

> **Status:** Ready · **Owner:** Jackson · **Produced:** 2026-07-13
>
> Executes `atomic-editor-technical-design.md`. Five phases, each a PR.
> P0 and P1 land on `main` as inert/additive code; **P2 is the hard cutover**
> (repo culture: UNN-533/535 precedent — no parallel editors, no preview
> flag). P3+ are independent follow-ups. Tickets should be filed one per
> phase with these acceptance criteria.

---

## Cutover surface (enumerated 2026-07-13)

`MarkdownField`/`DocumentEditor` consumers — six files:

| Consumer | Chips? |
| -- | -- |
| `app/campaigns/[campaignShortId]/_components/notes/beat-editor.tsx` | ✅ (`@`/`[[` + popover) |
| `app/campaigns/[campaignShortId]/_components/world/article-page.tsx` | ✅ |
| `app/campaigns/[campaignShortId]/_components/world/npc-page.tsx` | — |
| `app/campaigns/_components/create-campaign-button.tsx` | — |
| `app/characters/[shortId]/builder/_components/movements/animus/document-editor.tsx` | — |
| `app/characters/[shortId]/builder/_components/movements/animus/writer-pane.tsx` | — |

The only `@tiptap` imports outside `components/editor/` are
`chip-suggestion.ts` + `chip-suggestion-popover.tsx` (both deleted in P2).
Chips must therefore be rebuilt (P1) **before** the field can flip (P2).

---

## P0 — Vendor `packages/editor`

Additive; nothing consumes it yet.

1. Create the workspace package `@workspace/editor`: copy upstream `src/`
   (source + unit tests + CSS) at the `v0.6.2` tag; LICENSE preserved.
2. `package.json`: CM6/Lezer as **peerDependencies** (mirror upstream's);
   `apps/web` gains the `@codemirror/*`/`@lezer/*` versions as regular deps.
3. Write **`UPSTREAM.md`**: upstream URL, vendored SHA/tag, MIT attribution,
   the pristine-mirror policy ("never edit inside; extend from outside;
   modifications live in `apps/web`"), and the sync ritual (diff recorded
   SHA → upstream HEAD, review, copy, re-run tests, bump recorded SHA —
   run every few weeks via a Claude session).
4. Wire the vendored Vitest suites into the turbo `test` task (skip upstream's
   Playwright e2e — ours covers integration). Exempt the package from
   `apps/web`-specific lint/style rules as needed; do **not** rewrite vendored
   code to satisfy them.
5. Add the one-line `packages/editor` entry to AGENTS.md **Repo Structure**;
   add a `packages/editor/CLAUDE.md` stating the pristine-mirror policy and
   pointing at `UPSTREAM.md` (so future sessions don't casually edit inside).

→ **verify:** `npm run test` green including vendored suites (the
markdown-contracts fixtures now run in our CI); `npm run typecheck` green;
`npm run depcheck` green.

## P1 — First-party chip layer (`participant-links.ts`)

Additive; built and unit-tested before any surface uses it.

1. `participant-links.ts` (successor to `chip-suggestion.ts`, same folder):
   - `wikiLinks({ resolve, onOpen, openOnClick })` — **no `suggest`**
     (design §5.2: a second `autocompletion()` **throws**; comment the
     invariant at the call site).
   - App-side replacement decorations for aliased participant tokens, backed
     by a stable subscribed `ParticipantLinkWorld` snapshot. v0.6.2 skips
     `resolve` for aliases and exposes no cache invalidation; the app layer
     supplies live rename/tombstone behavior without editing the vendor.
   - One `autocompletion({ override: [...] })` owning all sources:
     `[[`-source and `@`-source (both modeled on upstream's
     `completionSource`: `matchBefore` → debounce → `context.aborted` →
     `validFor`), inserting `[[kind:id|label]]` via function `apply` with
     label sanitization from `domain/planner/chip`.
   - **Mint rows** as completions with a custom async `apply` (server action
     → dispatch insert; captured-range pattern from the old popover).
   - A controlled shadcn completion view (`Command` / `CommandList` /
     `CommandGroup` / `CommandItem`, deliberately no `CommandInput`) mirrors
     CM6's public completion state at the caret. CM6 retains the one keyboard,
     selection, filtering, apply, and accessible native-tooltip owner; the
     native tooltip is visually hidden. Pointer selection prevents editor blur.
2. Kind-styled pills: app-side CSS on
   `.cm-atomic-wiki-link[data-wiki-link-target^="npc:"]` etc. (colors +
   icon masks), mapped to our theme variables.
3. Unit tests: editor creation with **all sources registered** (guards the
   A5 crash class); serialization/sanitization per kind; mint `apply`
   dispatch shape; `@` and `[[` trigger gating; controlled-menu sections,
   selection synchronization, focus preservation, pointer apply, and cleanup.

→ **verify:** unit suite green; `/dev/editor` redirects to the feature-local
scratch harness and shows suggest → pick → pill → resolve live.

## P2 — `MarkdownField` cutover (the hard flip)

One PR; all six surfaces flip together; TipTap leaves the repo.

1. **⚠ Spikes first, in this branch** (design A3/A4):
   client-only mount pattern; external-value sync (unfocused server
   refresh / cross-tab broadcast) via handle dispatch, keyed remount, or a
   thin first-party host built from exported pieces. **The PR does not merge
   without the unfocused-refresh behavior preserved.**
2. Swap `MarkdownField` internals to the vendored editor behind the unchanged
   prop seam; retype `extensions` to CM6 `Extension[]`; keep placeholder,
   aria wiring, focus-ring styling parity. **`DocumentEditor` companion pass**
   (design §5.1): retype its `AnyExtension` import to CM6 `Extension[]` and
   swap the `[&_.ProseMirror]:px-0`/`py-0` selectors to the CM6 DOM
   (`.cm-content`/`.cm-line`); same selector swap in
   `create-campaign-button.tsx`. Autosave pipelines untouched.
3. Re-point chip surfaces (beat-editor, article-page) from
   `createChipSuggestionExtensions` + `<ChipSuggestionPopover>` to
   `participant-links` extensions; delete the popover mounts.
4. Delete: `participant-chip.tsx`, `chip-suggestion.ts`,
   `chip-suggestion-popover.tsx`, `markdown-round-trip.test.ts`, all
   `@tiptap/*` deps from `apps/web/package.json`.
5. Update e2e: `planner-notes.spec.ts` chip flow (selectors →
   `.cm-atomic-wiki-link[data-wiki-link-target]`), builder animus flow;
   grep-zero check for `@tiptap` **and for `ProseMirror`** (a stale
   `[&_.ProseMirror]` selector fails silently as lost padding, not a type
   error).
6. Theming pass: map editor CSS variables to brand tokens (dark-first);
   verify the six surfaces visually (borderless document look preserved,
   live preview renders headings/lists/tables).

→ **verify:** full e2e green; `npm run build` green; manual pass over all six
surfaces including: type markdown → autosave → reload → identical text
(purity), chip mint + rename propagation in-editor, cross-tab refresh while
unfocused.

## P3 — Hover previews

Two half-independent halves; display-path half can even precede P2.

1. Display path: hover card on `ChipProse`'s `ParticipantPill` (shadcn
   `HoverCard`); data via extended resolver payload or lazy
   `getParticipantPreview(kind, id)` action (name, kind, portrait, ~140-char
   summary, tombstone state).
2. Editor: mouseover on `[data-wiki-link-target]` + floating-ui +
   `createPortal`, sharing the display path's card component; debounce +
   per-target cache (copy the resolver plugin's discipline).

→ **verify:** e2e hover → card shows current name for a renamed NPC; keyboard
users unaffected; touch unaffected (navigation still works).

## P4 — Slash commands (nice-to-have)

One more source in the P1 `override` array: `/` trigger,
`Completion.section` groups, markdown-text inserts (no round-trip gate
exists or is needed — inserts are literal text).

→ **verify:** unit test per item's inserted text; e2e `/head` → H2.

## P5 — Embeds `![[kind:id|label]]` (advanced — write its own mini-design first)

Scope per design §6.3: `encounter`/`dungeon` participant kinds (flipping the
deliberate plain-text pin), shared tokenizer extension, `embedBlocks` modeled
on vendored `image-blocks.ts`, display-path block rendering, preview loaders.
v1 card is DOM-built (name, status, count, click-through); React-portal
upgrade and Ably liveness explicitly deferred.

→ **verify:** round-trip by construction (literal text); embed renders in
editor + display; degrades to `![[…|label]]` text everywhere else.

---

## Risk gates recap

| Gate | Phase | Blocks |
| -- | -- | -- |
| Vendored tests green in our CI | P0 | P1 |
| All-sources editor-creation test (A5 crash class) | P1 | P2 |
| External-value sync behavior preserved (A3) | P2 spike | P2 merge |
| Client-only mount (A4) | P2 spike | P2 merge |
| planner-notes chip e2e | P2 | P2 merge |
| Controlled shadcn completion view (A6) | P1 | P1 merge |
