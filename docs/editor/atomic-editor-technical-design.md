# Atomic Editor — Technical Design

> **Status:** Accepted · **Owner:** Jackson · **Produced:** 2026-07-13
>
> Replace the editor's TipTap internals with an **Obsidian-style CM6
> live-preview editor**, vendored shadcn-style from
> [`kenforthewin/atomic-editor`](https://github.com/kenforthewin/atomic-editor)
> into a repo-owned `packages/editor`. Storage stays plain CommonMark with
> `[[kind:id|label]]` chip tokens — **byte-identical to today** — and the
> read-only display path (`react-markdown` via `Prose`/`ChipProse`) is
> untouched.
>
> This decision supersedes **two** prior evaluations, both preserved as
> records: the BlockNote evaluation (2026-07-12,
> `docs/blocknote-evaluation/evaluation.md`, on the
> `claude/blocknote-editor-evaluation-5095d2` branch — rejected because a
> block-document model inverts markdown-native storage) and the
> **Notion-style TipTap chrome design**
> (`notion-editor-technical-design.md`, this folder — rejected 2026-07-13;
> see its rejection note for the deciding asymmetries). The API facts below
> were verified against primary sources (the atomic-editor source at v0.6.2,
> `@codemirror/autocomplete` and `@codemirror/state` source, the npm
> registry); §9 records them so future sessions don't re-derive.

---

## 1. Verdict up front

| Question | Answer |
| -- | -- |
| What changes for storage? | **Nothing.** Raw markdown is CM6's document; there is no serializer. `getMarkdown()` returns the literal text. |
| What happens to existing content? | **Works byte-for-byte.** Our chip token `[[npc:n1\|Maren]]` *is* atomic-editor's wiki-link syntax, pipe alias included. |
| What does the editor gain? | Live inline preview (headings render sized, syntax hides off the active line), WYSIWYG tables, task lists, image blocks — all **day one**, all deferred-or-blocked under the TipTap plan. Plus live-resolving chip pills in the editor (parity with `ChipProse`). |
| What do we delete? | The whole `@tiptap/*` dependency cluster (including the beta, exact-pinned `@tiptap/markdown` and the drag-handle peer mess), the chip ProseMirror node + custom tokenizer, the `@tiptap/suggestion` bridge + hand-rolled popover, and the round-trip *risk class* (§7). |
| What do we lose? | Drag handles (structurally impossible on a line-based editor — accepted), the shipped chip system (rebuilt smaller), TipTap's React NodeViews (relevant only to the future embeds feature, §6.3). |
| New dependency risk? | An 11-week-old, bus-factor-one upstream — **neutralized by vendoring** (§4): we own ~6k lines of clean MIT TypeScript; the hard engine underneath is CodeMirror 6 (what Obsidian itself builds on), consumed as normal npm deps. |
| License? | MIT. Attribution + license text preserved in `packages/editor`. |

---

## 2. Constraints (unchanged — and two get stronger)

The four load-bearing invariants from the rejected design carry over:

1. **Storage is Markdown.** *Strengthened*: under TipTap, markdown was
   parse→AST→re-serialize on every save, guarded by a sampling round-trip
   test. Under CM6 the text **is** the document; decorations are view-only.
   The invariant holds by construction, not by gate.
2. **Display mounts zero editors.** Unchanged — `Prose`/`ChipProse` never knew
   which editor wrote the markdown.
3. **Pills resolve live.** *Strengthened*: `wikiLinks({ resolve })` resolves
   targets to current names in the editor viewport (debounced, cached, capped),
   closing today's inconsistency where the TipTap editor shows the stored
   label while `ChipProse` shows the live name.
4. **The editor is the "Obsidian editor."** No longer aspirational —
   `markdown-field.tsx`'s docblock has claimed this identity since UNN-207;
   atomic-editor is that experience actually delivered.

---

## 3. What we're adopting (facts, verified 2026-07-13)

| Fact | Value |
| -- | -- |
| Package | `@atomic-editor/editor` v0.6.2, MIT, by Kenny Bergquist |
| Born | 2026-04-22 (11 weeks old); 73 commits, 115 stars, 14 npm releases, bus factor ~1 |
| Engine | CodeMirror 6 + Lezer, declared as **peerDependencies** (single-instance discipline) |
| Size | ~6,085 lines of TypeScript/CSS source; `wiki-links.ts` is 597 lines; the React component is 815 |
| Tests | Vitest unit suites (incl. a **markdown-contracts** fixture suite) + Playwright e2e |
| React API | `<AtomicCodeMirrorEditor markdownSource onMarkdownChange extensions readOnly editorHandleRef …>`; imperative handle: `getMarkdown`, `focus`, `undo/redo`, `setReadOnly`, search |
| Composability | Every piece exported individually: `inlinePreview`, `tables`, `imageBlocks`, `wikiLinks`, `atomicEditorTheme`, `atomicMarkdownSyntax`, `readOnlyFacet` |
| Wiki links | `[[target]]` / `[[target\|label]]`; config `{ suggest, resolve, onOpen, serializeSuggestion, shouldResolve, maxSuggestions, debounceMs, openOnClick }`; status-classed pill widgets (`resolved`/`loading`/`missing`); resolution debounced + cached (600-entry cap) |
| Theming | CSS variables, dark + light |

The **shadcn precondition** is what makes this vendorable where TipTap or
BlockNote would not be: the hard behavioral engine (parsing, decorations,
viewport virtualization, input) lives in professionally-maintained
`@codemirror/*` packages we consume from npm; the vendored ~6k lines are the
*assembly* on top — exactly the Radix/shadcn split.

---

## 4. The vendoring model: `packages/editor` as a pristine mirror

**Policy: the vendored tree is a pristine mirror of upstream. Our code builds
on its exports; we never edit inside it while upstream is alive.**

The first structural edit inside the tree ends cheap upstream syncing forever —
and upstream is at the steepest part of its improvement curve (three releases
on 2026-07-11 alone). Feasibility of extend-from-outside is verified, not
hoped: `src/index.ts` exports every composable piece, and `wiki-links.ts` — the
file we most need to build against — has exactly one internal import
(`readOnlyFacet`), which is itself public.

Mechanics:

- **`packages/editor`** (`@workspace/editor`): upstream's `src/` (including its
  unit tests, which run under our turbo `test` task — the markdown-contracts
  suite comes with the vendor), its CSS, its LICENSE. Not subject to
  `apps/web` style rules or depcheck feature gates — the package boundary
  **marks the vendor seam**.
- **CM6 stays peer.** `packages/editor` declares `@codemirror/*`/`@lezer/*` as
  peerDependencies (upstream's own design); **`apps/web` owns the versions** as
  regular dependencies. This prevents the duplicate-instance hazard when our
  first-party extensions import `@codemirror/*` directly.
- **`UPSTREAM.md`** in the package root records: upstream URL, the vendored
  tag/SHA (`v0.6.2`), the MIT attribution, the pristine-mirror policy, and the
  **sync ritual**: every few weeks, a Claude session diffs
  `github.com/kenforthewin/atomic-editor` from the recorded SHA to upstream
  HEAD, reviews the diff, copies it in, re-runs the vendored tests + our e2e,
  and updates the recorded SHA. If upstream dies or turns a bad direction, the
  policy flips to "we own it now" with zero migration.
- **Theming overrides live app-side** (a small stylesheet mapping the editor's
  CSS variables to our Tailwind tokens), never as edits to the vendored CSS.

---

## 5. The first-party layer (all in `apps/web`)

### 5.1 `MarkdownField` keeps its seam

The controlled-component contract (`value`, `onChange`, `onFocus/onBlur`,
`placeholder`, aria wiring, `className`, `extensions`) survives; only the
internals swap. `extensions` is retyped from TipTap `AnyExtension[]` to CM6
`Extension[]`. `DocumentEditor` and every autosave pipeline
(`useDebouncedAutoSave`, entity door, planner LWW) are untouched.

Two integration facts need runtime confirmation (**⚠ spike**, both in P2):

- **Client-only mount.** No SSR story upstream; mount via `next/dynamic`
  `ssr: false` or an effect-gated render — the moral equivalent of TipTap's
  `immediatelyRender: false`.
- **External-value sync.** The component's `markdownSource` is
  initial-value-shaped; our contract (server refresh / cross-tab broadcast
  updates the editor **only when unfocused and different**) needs an
  equivalent — via `editorHandleRef` dispatch, a keyed remount, or a thin
  first-party host component assembled from the exported pieces instead of
  the 815-line `AtomicCodeMirrorEditor`. If none fits cleanly, that is an
  **upstream PR** (a controlled-sync affordance), not a fork.

### 5.2 Chips: `participant-links.ts` — configuration plus one completion owner

The chip system shrinks from *node + tokenizer + suggestion plugin + popover*
to *config + one completion source*:

- **Decorations/resolution/click**: their `wikiLinks({ resolve, onOpen,
  openOnClick })` — **configured without `suggest`**. `resolve` maps
  `kind:id` targets through the world web (current name + tombstone status);
  `onOpen` navigates via `lib/paths`.
- **Completions**: **exactly one first-party
  `autocompletion({ override: [participantSource, atSource, slashSource…] })`**
  call owns every source. This is a hard constraint, not a style choice:
  `combineConfig` **throws** (`"Config merge conflict for field override"`)
  when two `autocompletion()` calls both set `override` (§9), and
  `wikiLinks()` sets it whenever `suggest` is configured. Their conditional
  (`if (!config.suggest) return []`) is the sanctioned escape hatch — we get
  their pills without their completion instance.
- **Triggers**: `[[` and `@` are two sources gating themselves via
  `context.matchBefore` (their `completionSource` is the ~25-line template:
  match → debounce → `context.aborted` checks → `validFor`). Both insert the
  same `[[kind:id|label]]` text via a function `apply` — including the **mint
  rows** ("Create NPC / Create Article"), whose `apply` runs the server action,
  then dispatches the insert (the same captured-range async pattern as today's
  popover).
- **Row rendering**: CM6's `addToOptions` injects custom DOM per row and
  `Completion.section` gives grouped headings natively — but `render` returns
  a **DOM `Node`, not React**. Default: small `createElement` helpers for the
  simple rows; fall back to driving our existing React listbox from a custom
  CM6 plugin (today's popover architecture, re-fed) only if the mint rows
  resist DOM-helper form. Decide in P1 by building the default first.
- **Label sanitization** stays in `domain/planner/chip` and applies at
  `serializeSuggestion`.
- **In-editor pill styling by kind**: the vendored widget renders
  `span.cm-atomic-wiki-link[data-wiki-link-target]` with no kind concept.
  Kind styling rides CSS attribute selectors
  (`[data-wiki-link-target^="npc:"]`) + `::before` icon masks — app-side CSS,
  no fork. Accepted: in-editor pills are styled simpler than the React
  `ParticipantPill`; the display path keeps the rich pill.

### 5.3 Where things live

| Piece | Home | Why |
| -- | -- | -- |
| Vendored editor | `packages/editor` | Vendor seam (§4). |
| `MarkdownField` host + slash source | `apps/web/components/editor/` | Cross-feature kit, feature-agnostic. |
| `participant-links.ts` (chips: resolve/suggest/mint/@) | `apps/web/app/campaigns/[campaignShortId]/_components/notes/` (successor to `chip-suggestion.ts`) | Domain-entangled (world web, mint actions), single-feature today — same home as its predecessor. |
| Preview loaders (`getParticipantPreview`) | `lib/actions` / feature `*-access.ts` per write/read pattern | Standard seam. |

---

## 6. Feature roadmap beyond parity

### 6.1 Hover previews (the actually-wanted feature)

Hover a chip → card with basic info (name, kind, portrait, summary).

- **Display path first** — independent of the editor entirely: wrap
  `ChipProse`'s `ParticipantPill` in a hover card (shadcn `HoverCard`), data
  from an extended resolver payload or a lazy `getParticipantPreview` action.
- **Editor**: the pills carry `data-wiki-link-target`; a mouseover listener +
  floating-ui + `createPortal` React card — the chip-popover architecture
  pointed at hover instead of the caret. (CM6's native `hoverTooltip` exists
  as the DOM-content alternative.) Card content shared with the display path.
- Touch has no hover; previews are a pointer enhancement, navigation stays the
  baseline. Out of scope for v1.

### 6.2 Slash commands (nice-to-have)

One more source in the §5.2 `override` array: `/` trigger, `Completion.section`
groups ("Basic blocks / Inline"), string-or-function `apply` inserting markdown
syntax. Under CM6 there is **no round-trip question to gate** — a slash item
inserts literal markdown text. The §8 problem class of the rejected design
does not exist here.

### 6.3 Embeds — `![[encounter:e1|Goblin Ambush]]` (advanced, own mini-design)

Rich block preview of an encounter/dungeon/NPC in the document, markdown
underneath.

- **Syntax**: `!` + the chip grammar. Inert in CommonMark (literal text), so
  storage purity and graceful degradation (the `|label`) hold by construction.
  One tokenizer serves chips and embeds.
- **Domain**: `encounter`/`dungeon` become participant kinds — note the
  current round-trip pin that `[[dungeon:d1|…]]` stays plain text flips
  *deliberately*.
- **Editor**: an `embedBlocks` extension modeled on the vendored
  `image-blocks.ts` — verified precedent: block widget below the source line
  (`Decoration.widget({ block: true, side: 1 })`), raw text revealed on the
  active line. First-party, no fork.
- **The one real cost**: rich React content inside a CM6 `WidgetType` needs
  the portal-registry pattern (widget mounts a stable container; React portals
  in; cleanup in `destroy()`). This is the single place TipTap's React
  NodeViews were structurally nicer. v1 escape hatch: a modest DOM-built card
  (name, status, participant count, click-through) with the React upgrade
  when the card earns richness.
- **Display path**: same rewrite-and-claim trick as `ChipProse`, block-level.
- Liveness (Ably-fed live cards) is explicitly deferred — its own design
  conversation.

---

## 7. What gets deleted at cutover

| Deleted | Superseded by |
| -- | -- |
| `@tiptap/*` dependency cluster (10 packages, incl. the exact-pinned beta `@tiptap/markdown`) | `@codemirror/*` peers + `packages/editor` |
| `participant-chip.tsx` (node + custom markdown tokenizer) | `wikiLinks` pills — the token is native syntax |
| `chip-suggestion.ts` + `chip-suggestion-popover.tsx` | `participant-links.ts` + one `autocompletion` owner |
| `markdown-round-trip.test.ts` | The vendored **markdown-contracts** suite + chip serialization unit tests. The round-trip *risk class* is gone — there is no serializer to drift. |
| The rejected design's planned work (chrome seam, `SuggestionListbox`, §8 gate, drag-handle install) | Not built. |

---

## 8. Risks & mitigations

| # | Risk | Mitigation |
| -- | -- | -- |
| A1 | Upstream is 11 weeks old, bus-factor 1, pre-1.0 churn | Vendored pristine mirror (§4); sync ritual keeps fixes flowing; abandonment flips policy to full ownership with zero migration. |
| A2 | Owning the source ≠ owning the knowledge (decoration invalidation, iOS caret quirks land on us) | The engine (CM6) stays professionally maintained; vendored tests come along; upstream fixes remain one diff away while it lives. Accepted residual. |
| A3 | External-value sync has no obvious upstream affordance | **⚠ spike** (§5.1); handle-dispatch / keyed remount / thin first-party host; upstream PR if none fit. Gate: the cutover PR cannot merge without the unfocused-refresh contract passing its existing behavior. |
| A4 | Next.js App Router mount unverified | **⚠ spike** (§5.1), trivial pattern expected (`ssr: false`). |
| A5 | Two `autocompletion()` instances crash at editor creation | Designed out (§5.2): suggest-less `wikiLinks` + one first-party owner. A comment in `participant-links.ts` states the invariant; the P1 unit test asserts editor creation with all sources active. |
| A6 | Mint rows fight CM6's DOM-node row rendering | Two sanctioned paths (§5.2); decided in P1 by building, not speculating. |
| A7 | E2E churn (selectors move from `[data-participant-chip]` to `.cm-atomic-wiki-link[data-wiki-link-target]`) | Mechanical; `planner-notes.spec.ts` chip flow is the behavior gate, updated in the cutover PR. |
| A8 | In-editor pill fidelity below `ParticipantPill` | Accepted for v1 (CSS attribute-selector styling); revisit only if it grates. |

---

## 9. Verified facts (primary sources, 2026-07-13 — don't re-derive)

| Claim | Evidence |
| -- | -- |
| `combineConfig` throws on conflicting fields with no combiner: `throw new Error("Config merge conflict for field " + key)` | `@codemirror/state` `src/config.ts`, read verbatim |
| `override` has **no** combiner in the completion config facet; `addToOptions` concatenates; `icons` combines by AND | `@codemirror/autocomplete` `src/config.ts` |
| `wikiLinks()` calls `autocompletion({ override: […], icons: false })` **only when `config.suggest` is set** (`if (!config.suggest) return []`) | atomic-editor `src/wiki-links.ts` `wikiLinkCompletions()` |
| `wiki-links.ts` has one internal import (`readOnlyFacet`), which is exported from the package index | atomic-editor `src/wiki-links.ts` + `src/index.ts` |
| `Completion.apply` may be a function `(view, completion, from, to) => void`; upstream's own wiki completions use one | `@codemirror/autocomplete` `src/completion.ts` + atomic-editor `toCompletion()` |
| `Completion.section` + `CompletionSection { name, header(), rank }` provide grouped headings natively | `@codemirror/autocomplete` `src/completion.ts` |
| `addToOptions.render` returns a DOM `Node` | `@codemirror/autocomplete` `src/config.ts` |
| `image-blocks.ts` renders `Decoration.widget({ block: true, side: 1 })` below the source line | atomic-editor `src/image-blocks.ts` |
| `hoverTooltip` with configurable hover time exists in `@codemirror/view` | `@codemirror/view` `src/tooltip.ts` |
| Pill widgets render `span.cm-atomic-wiki-link` with `dataset.wikiLinkTarget` | atomic-editor `src/wiki-links.ts` `WikiLinkWidget.toDOM()` |
| Pipe alias `[[target\|label]]` supported; suggestions/resolution debounced + cached (600-entry cap) | atomic-editor `src/wiki-links.ts` |
| Repo created 2026-04-22; v0.6.2 published 2026-07-11; MIT; CM6 as peers | GitHub API + npm registry |

---

## 10. Decisions & rejected alternatives

| Decision | Chosen | Rejected | Why |
| -- | -- | -- | -- |
| Editor direction | Obsidian-style live preview (CM6) | Notion-style block chrome (TipTap), BlockNote | See the two rejection records. Markdown purity by construction; chip syntax native; the wanted features (hover previews, embeds) are wiki-link-native. Drag handles sacrificed knowingly. |
| Acquisition | Vendor into `packages/editor` (shadcn model) | npm dependency (pinned) | Bus-factor-1 + pre-1.0 churn + supply-chain surface on the core writing surface; every update needs review either way; vendoring makes review-at-import the model. The shadcn precondition holds (engine is upstream-of-upstream). |
| Vendored-tree policy | Pristine mirror, extend from outside | Fork-and-modify | First inside edit ends cheap syncing during upstream's steepest improvement phase. Verified feasible via public exports. |
| Completion ownership | One first-party `autocompletion()` owning all sources; suggest-less `wikiLinks` | `wikiLinks({suggest})` + a second `autocompletion()` | The second form **throws at editor creation** (`combineConfig` conflict on `override`, §9). |
| Chip completions UI | CM6 autocomplete UI + DOM row helpers (default) | Re-fed React listbox (fallback) | Grouping + keyboard + a11y free; fallback stays sanctioned if mint rows resist DOM form (§5.2, decided in P1). |
| CM6 dependency home | Peers in `packages/editor`, versions owned by `apps/web` | Direct deps in the package | Single-instance discipline; first-party extensions import CM6 directly. |
| Pill kind-styling | CSS attribute selectors + icon masks | Forking the widget for React pills | Pristine mirror; display path keeps the rich pill. |

---

## 11. Open questions

- **Upstream relationship**: worth opening a dialogue with the maintainer
  (controlled-sync affordance §5.1, exposing `completionSource` §5.2)?
  Upstreaming shrinks our first-party surface; PRs are cheap goodwill.
- **Search panel**: the component ships find/reveal (`openSearch`,
  `revealText`). Keep, hide, or expose per surface? Default: leave enabled,
  decide per surface at cutover.
- **`extensions` prop consumers**: only the chip surfaces pass extensions
  today; confirm no other surface grew one before retyping.
- **Read-only mode**: `readOnly`/`setReadOnly` could eventually serve
  interactive-but-locked surfaces (Chronicle?), replacing some `ChipProse`
  mounts. Not v1; noted so nobody builds a parallel path unaware.

---

## Sources

- Upstream — <https://github.com/kenforthewin/atomic-editor> (v0.6.2, MIT; cloned + read 2026-07-13)
- npm — <https://www.npmjs.com/package/@atomic-editor/editor>
- `@codemirror/autocomplete` source (`completion.ts`, `config.ts`) — <https://github.com/codemirror/autocomplete>
- `@codemirror/state` `combineConfig` — <https://github.com/codemirror/state/blob/main/src/config.ts>
- `@codemirror/view` `hoverTooltip` — <https://github.com/codemirror/view/blob/main/src/tooltip.ts>
- Rejection records — `notion-editor-technical-design.md` (this folder), `docs/blocknote-evaluation/evaluation.md` (branch `claude/blocknote-editor-evaluation-5095d2`)
- Repo precedent — `apps/web/components/editor/markdown-field.tsx`, `apps/web/app/campaigns/[campaignShortId]/_components/notes/chip-suggestion{,-popover}.ts(x)`, `apps/web/app/campaigns/[campaignShortId]/_components/chip-prose.tsx`
