# Notion-style Editor — Technical Design

> **Status:** ❌ **Rejected** (2026-07-13) · **Owner:** Jackson · **Produced:** 2026-07-13 ·
> **Revised:** 2026-07-13 (critical-review pass: registry-verified drag-handle
> version story §4, shared-extension-factory prerequisite §8, `useEditorState`
> + lifted `mode` in the bubble sketches §9, gutter ownership §10.1, code-block
> `allow` guard §6, touch scoping R8)
>
> **Rejection note.** Superseded the same day by the **Atomic editor direction**
> (`atomic-editor-technical-design.md`, this folder): an Obsidian-style CM6
> live-preview editor, vendored shadcn-style into `packages/editor`. The
> deciding asymmetries: markdown-purity by construction (the §8 round-trip risk
> class and the `@tiptap/markdown` beta pin vanish rather than being gated),
> tables/task-lists/images on day one (deferred indefinitely here), our chip
> token being byte-identical to its wiki-link syntax, and the desired hover
> previews + `![[…]]` embeds being wiki-link-native features that this design's
> mention model retrofits awkwardly. Drag handles — the one affordance CM6
> cannot host — were judged the weakest of the three for prose-shaped planner
> content. This document remains the record of the TipTap-chrome design and its
> verified API research; none of it is planned for implementation.
>
> A path to layering three Notion-style affordances — a **slash-command menu**,
> block **drag handles**, and a **floating selection (bubble) menu** — onto the
> editor we already run (TipTap 3 + `@tiptap/markdown`), **without** surrendering
> Markdown-native storage, the `react-markdown` display layer, or live-resolving
> mention pills.
>
> This is the direct follow-up to the **BlockNote evaluation** (2026-07-12,
> `docs/blocknote-evaluation/evaluation.md` — currently on the
> `claude/blocknote-editor-evaluation-5095d2` branch, not yet merged to `main`;
> merge it before this lands so the citation doesn't dangle), whose verdict
> was: *"Keep the TipTap stack; add the Notion affordances to it
> incrementally."* This document is the **how**. The
> API/licensing facts below were gathered via a multi-agent web pass over
> TipTap's v3 first-party docs, the `@tiptap/suggestion` v3 source, the npm
> registry metadata, and community reference editors (Novel, minimal-tiptap,
> pagescms), each cross-checked. Where a claim needs a runtime spike before we
> commit, it is flagged **⚠ spike**.

---

## 1. Verdict up front

| Question | Answer |
| -- | -- |
| Can we build all three on our current TipTap 3 stack? | **Yes.** All the primitives are MIT/free and (mostly) already installed. |
| New paid dependencies / Pro tokens / private registries? | **None.** The drag-handle extension was open-sourced (MIT, public npm) in June 2025. `@tiptap/suggestion` and the menu components are already MIT. |
| New runtime deps to add? | `@tiptap/react/menus` (subpath of a package we have), `@tiptap/extension-drag-handle-react` (+ a peer-dep cluster — see §4), and `@floating-ui/dom` **which we already depend on**. |
| Can shadcn components render the controls? | **Partly — and the repo already answered the hard part.** Drag-handle menu → yes, full shadcn `DropdownMenu`. Bubble menu → yes for `Button`/`Toggle`/`ToggleGroup`/`Separator`, **no** for a nested link `Popover` (swap inline content instead). Slash menu → **reuse our existing hand-rolled listbox**, not cmdk/`Popover` (see §7). |
| Biggest single design task? | Exposing the editor instance so `BubbleMenu`/`DragHandle` (React components that require `editor`) can mount. One small, clean seam in `MarkdownField` (§5). |

The work is **additive and opt-in per surface**. Nothing here changes storage,
display, or the existing chip system.

---

## 2. The constraints that shape everything

These are load-bearing invariants, not preferences. Every design choice below
defers to them.

1. **Storage is Markdown.** `MarkdownField` reads and writes CommonMark strings
   (`editor.getMarkdown()` / `setContent(value, { contentType: 'markdown' })`),
   with `[[kind:id|label]]` chip tokens. Any block a slash command inserts
   **must round-trip through `@tiptap/markdown`** or it silently corrupts on
   the next autosave. This gates *which* slash commands we can offer (§8).

2. **Display mounts zero editors.** ~8 read-only surfaces render saved content
   with `react-markdown` via `Prose`/`ChipProse`. The editor chrome is an
   **edit-mode-only** concern; none of it touches the display path. Good — it
   means these features cost nothing on read.

3. **Pills resolve live.** `ChipProse` rewrites each chip token to the *current*
   resolved name. The chrome features never serialize a pill, so they're
   orthogonal — but the slash menu shares infrastructure with the chip
   suggestion, so we keep them coherent (§6).

4. **The editor is deliberately chrome-free today** — the
   ["Obsidian editor"](../../apps/web/components/editor/markdown-field.tsx)
   experience: Markdown shortcuts, no toolbar, no menus. Adding Notion chrome is
   a **real UX shift**, so it is **opt-in per surface** via feature flags, not a
   global default (§5, §9). The terse builder fields stay bare; the long-form
   planner surfaces (Beat, NPC, Article) are where chrome earns its keep.

---

## 3. What we already have (the precedent that de-risks this)

The repo is further along than a greenfield "add a slash menu" task, because
the **participant-chip suggestion is a working slash-menu-shaped feature**:

| Piece | File | What it establishes |
| -- | -- | -- |
| Editor host | [`markdown-field.tsx`](../../apps/web/components/editor/markdown-field.tsx) | `useEditor` owner; `immediatelyRender: false`; takes a render-stable `extensions` prop; callback-ref pattern for long-lived editor ↔ current React state. |
| Document shell | [`document-editor.tsx`](../../apps/web/components/editor/document-editor.tsx) | Title/subtitle/body layout; forwards `extensions` to the body. |
| Suggestion extension | [`chip-suggestion.ts`](../../apps/web/app/campaigns/[campaignShortId]/_components/notes/chip-suggestion.ts) | `Extension.create` wrapping `Suggestion()` from `@tiptap/suggestion`; a handle-ref bridge (`onOpen`/`onClose`/`onKeyDown`) from the ProseMirror plugin to a React popover. |
| Suggestion popover | [`chip-suggestion-popover.tsx`](../../apps/web/app/campaigns/[campaignShortId]/_components/notes/chip-suggestion-popover.tsx) | A caret-anchored `role="listbox"` positioned with `@floating-ui/dom`, keyboard nav via the handle, `onMouseDown` preventDefault to hold the selection. **Explicitly rejects cmdk and shadcn `Popover`** as incompatible with the suggestion focus model. |
| Integration | [`beat-editor.tsx`](../../apps/web/app/campaigns/[campaignShortId]/_components/notes/beat-editor.tsx) | The wiring pattern: `useMemo` extensions built from refs, a sibling popover wired through a handle ref. |

**The slash menu is ~80% a re-parameterization of this.** Same `Suggestion`
plugin, same handle-ref bridge, same floating-ui listbox — only the trigger
char (`/`), the items (block transforms, not world-web rows), and the `command`
(delete-range-then-transform, not insert-chip) differ. This is the strongest
signal in the whole design: we are not inventing a pattern, we are generalizing
one we already ship and test.

---

## 4. Packages & licensing (the deliverable table)

Every primitive is **MIT and free**. No Pro account, no license key, no private
`registry.tiptap.dev`, no `.npmrc` auth.

| Package | Purpose | Status | Notes |
| -- | -- | -- | -- |
| `@tiptap/suggestion` | Slash menu | **Have it** (`^3.23.6`), MIT | Already drives the chip suggestion. |
| `@floating-ui/dom` | Positioning (all three) | **Have it** (`^1.8.0`), MIT | Already used by the chip popover. |
| `@tiptap/react/menus` | `BubbleMenu`, `FloatingMenu` | **Subpath of `@tiptap/react` we already have**, MIT | v3 moved menus here from `@tiptap/react`. No new install. |
| `@tiptap/extension-drag-handle-react` | Drag handle (React) | **New dep**, MIT, public npm — **install at exactly `3.23.6`** (see caveat) | Open-sourced from Pro in **June 2025**. Same terms as StarterKit. |
| `@tiptap/extension-drag-handle`, `@tiptap/extension-node-range` | Drag-handle core + transitive | pulled by the React pkg, MIT | — |

### ⚠ Drag-handle peer-dependency caveat (verified against the registry)

Two registry facts shape the install, both verified 2026-07-13:

1. **The peers are exact-pinned, not ranges.** `@tiptap/extension-drag-handle@3.27.4`
   declares `"@tiptap/core": "3.27.4"` — exactly. Installing a 3.27.x drag
   handle against our `3.23.6` stack is not a loose-resolution gamble; it is a
   **guaranteed peer conflict**. Mixing versions is off the table.
2. **The extension is published at exactly `3.23.6`** (peers: `@tiptap/core:
   3.23.6` — matching us). So the version question dissolves: **install the
   whole drag cluster at `3.23.6`** and no stack bump is needed. (An earlier
   draft recommended `^3.27.x` and left "bump the stack?" open in §14 — both
   superseded by the registry metadata.)

The remaining caveat: the `peerDependencies` are **not marked optional**, and
they include **`@tiptap/extension-collaboration` and `@tiptap/y-tiptap` (Yjs)**
— which we do not use. A strict installer (or a Next build) may fail to resolve
`@tiptap/y-tiptap` even though no collaboration code runs:

```bash
npm install @tiptap/extension-drag-handle-react@3.23.6 @tiptap/extension-drag-handle@3.23.6 \
  @tiptap/extension-node-range@3.23.6 @tiptap/extension-collaboration@3.23.6 \
  @tiptap/y-tiptap yjs y-protocols
```

**Mitigation path (in order):** (a) rely on npm's loose peer resolution and add
the missing Yjs peers only if the build complains; (b) install the Yjs peer set
as devDeps to satisfy resolution without shipping collab code; (c) if the
Yjs weight is unacceptable, fall back to the community
`tiptap-extension-global-drag-handle` (MIT, **no Yjs peers**, but a raw
extension with no React component / `onNodeChange` — you inject a handle element
and manage the menu yourself). **Recommendation: (a)/(b) with the official
extension at `3.23.6`** — the React `onNodeChange` + `lockDragHandle`
affordances are worth it and the peer set is a build-time-only concern.
**⚠ spike** the install in a throwaway branch to confirm the exact peer
resolution on our npm/Turborepo setup before committing a phase estimate.

---

## 5. The one architectural change: exposing the editor instance

The slash menu needs nothing new — it rides the `extensions` prop + sibling
popover pattern (§3), because the `Suggestion` plugin lives *inside* the editor
and talks to React through a ref; it never needs the `editor` object in React.

But `BubbleMenu` and `DragHandle` are **React components that take `editor` as a
prop** and must render in the same subtree as `<EditorContent>`. Today
`MarkdownField` owns the editor instance privately and exposes nothing. So the
single seam this whole design introduces is: **let a caller render chrome that
needs the editor, without leaking editor ownership or breaking the
storage-blind contract.**

**Chosen approach — a `chrome` render-prop on `MarkdownField`:**

```tsx
// markdown-field.tsx — new optional prop
export function MarkdownField({
  /* …existing props… */
  chrome,
}: {
  /* …existing… */
  /**
   * Optional edit-mode chrome (bubble menu, drag handle) rendered inside the
   * editor's DOM subtree. Receives the live editor once created. Unlike
   * `extensions` (consumed once at editor creation, so it must be
   * render-stable), this is a render prop: it re-runs every render and is
   * free to close over current state. Note that reading editor state here
   * (`editor.isActive(…)`) does NOT subscribe the component to transactions —
   * chrome components that render active states must use `useEditorState`
   * (§9.2).
   */
  chrome?: (editor: Editor) => React.ReactNode
}) {
  // …
  return (
    <div className="relative">
      {editor && chrome?.(editor)}
      <EditorContent editor={editor} className={/* … */} />
    </div>
  )
}
```

Why a render-prop and not a Context or exposing `editor` upward:

- **Keeps `MarkdownField` storage-blind and the owner of the instance.** The
  editor never escapes; the caller only *renders into* its subtree. Matches the
  existing "the field owns the editor; persistence is the caller's problem"
  contract in the file's own docblock.
- **Co-locates the menus with `<EditorContent>`**, which is required for
  Floating UI anchoring and for the drag handle's `position: relative` gutter.
- **No prop-drilling, no ambient Context** for something that is inherently
  local to one editor subtree (per AGENTS.md's prop-drilling guidance — a
  Context here would be ceremony around a parent/child relationship).
- `DocumentEditor` forwards `chrome` to `MarkdownField` alongside `extensions`,
  so planner surfaces opt in the same way they already pass extensions.

Slash-menu opt-in stays as it is (extensions + sibling popover). Bubble/drag
opt-in becomes: pass a `chrome` callback. A surface that wants none passes
nothing and gets today's bare editor. **This is the only change to shared editor
code**; everything else is new files.

An **`EditorChrome` composite** (`components/editor/chrome/editor-chrome.tsx`)
bundles the bubble menu + drag handle behind feature flags so a caller writes
`chrome={(editor) => <EditorChrome editor={editor} bubble drag />}`.

---

## 6. Control 1 — Slash-command menu

### 6.1 Shape (reuse, don't reinvent)

Build a `SlashCommand` extension in the **same shape as `chip-suggestion.ts`**,
and a `SlashCommandPopover` in the **same shape as `chip-suggestion-popover.tsx`**.
Promote the popover skeleton (caret-anchored floating-ui listbox + handle-ref
keyboard bridge) into a **shared `SuggestionListbox` primitive** in
`components/editor/`, and have both the chip popover and the slash popover
consume it. This removes the duplication the second suggestion surface would
otherwise create, and is the honest "extract the shared primitive on the second
use" move.

```ts
// components/editor/slash-command.ts
import { Extension } from "@tiptap/core"
import type { Editor, Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import { Suggestion } from "@tiptap/suggestion"
import type { RefObject } from "react"

export interface SlashCommandItem {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  keywords?: string[]
  /** Runs the block transform. `range` is the `/query` span to delete first. */
  run: (props: { editor: Editor; range: Range }) => void
}

export interface SlashSuggestionHandle {
  onOpen: (session: {
    query: string
    items: SlashCommandItem[]
    clientRect: (() => DOMRect | null) | null
    command: (item: SlashCommandItem) => void
  }) => void
  onClose: () => void
  onKeyDown: (event: KeyboardEvent) => boolean
}

export function createSlashCommandExtension({
  items,
  handle,
}: {
  items: RefObject<readonly SlashCommandItem[]>
  handle: RefObject<SlashSuggestionHandle | null>
}) {
  return Extension.create({
    name: "slashCommand",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem, SlashCommandItem>({
          editor: this.editor,
          pluginKey: new PluginKey("slashCommand"),
          char: "/",
          startOfLine: false,
          allowSpaces: false,
          // No block transforms inside code blocks — typing `/` in a fenced
          // block must stay literal text, as in Notion.
          allow: ({ state, range }) =>
            !state.doc.resolve(range.from).parent.type.spec.code,
          items: ({ query }) => filterSlashItems(items.current ?? [], query),
          command: ({ editor, range, props: item }) =>
            item.run({ editor, range }),
          render: () => ({
            onStart: (props) => handle.current?.onOpen(toSession(props)),
            onUpdate: (props) => handle.current?.onOpen(toSession(props)),
            onExit: () => handle.current?.onClose(),
            onKeyDown: ({ event }) => handle.current?.onKeyDown(event) ?? false,
          }),
        }),
      ]
    },
  })
}
```

The `command` graph is: user picks item → popover calls `session.command(item)`
→ the plugin's top-level `command` calls `item.run({ editor, range })`.

Note the `allow` guard: without it, `/` at the start of a line inside a code
block opens the menu and its transforms mangle the block. **The chip suggestion
has the same latent hole today** (`@` inside a code block) — give
`chip-suggestion.ts` the identical guard while extracting the shared primitive
(P0), so both menus stay behaviorally uniform.

### 6.2 The `run` handlers — delete-range then transform

Each item deletes the `/query` text (via the threaded `range`) then applies the
block command **in one chain**, `.focus()` first because the click stole focus:

```ts
const SLASH_ITEMS: SlashCommandItem[] = [
  { title: "Heading 1", icon: TextHOne, keywords: ["h1", "title"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run() },
  { title: "Heading 2", icon: TextHTwo, keywords: ["h2"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run() },
  { title: "Bulleted list", icon: ListBullets, keywords: ["ul", "unordered"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: "Numbered list", icon: ListNumbers, keywords: ["ol", "ordered"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: "Quote", icon: Quotes, keywords: ["blockquote"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: "Code block", icon: Code, keywords: ["pre"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setCodeBlock().run() },
  { title: "Divider", icon: Minus, keywords: ["hr", "rule"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  // A slash item can also open the chip flow — insert "@" to summon the linker:
  { title: "Link a participant", icon: At, keywords: ["mention", "npc"],
    run: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent("@").run() },
]
```

Only Markdown-round-trip-safe blocks are listed here (§8). Note the last item —
the slash menu can *summon the existing chip suggestion*, unifying the two
menus' mental model for the user. **⚠ spike:** this assumes a programmatic
`insertContent("@")` re-triggers the `@` suggestion plugin (match detection
runs per-transaction, so it should) — verify before shipping the item; if it
doesn't fire, drop the item rather than special-casing.

### 6.3 Positioning — stay on the manual floating-ui path

v3 adds a **managed** positioning path (`props.mount()` + `floatingUi` config)
that would remove hand-written positioning. **We deliberately keep the manual
`computePosition` path** the chip popover already uses, because:

- It's the proven, tested shape in this repo (the chip popover ships it).
- The shared `SuggestionListbox` primitive then serves both menus identically.
- Managed `mount()` renders into a `container` (default `document.body`) that
  we'd then have to style/portal-coordinate anyway.

`props.mount()` is documented in §11 as the fallback if we later want the plugin
to own scroll/resize/outside-click for free.

### 6.4 Integration

```tsx
// inside a planner surface (e.g. beat-editor.tsx), same shape as chips today
const slashHandle = useRef<SlashSuggestionHandle | null>(null)
const slashItemsRef = useRef<readonly SlashCommandItem[]>(SLASH_ITEMS)
const extensions = useMemo(
  () => [
    ParticipantChip,
    ...createChipSuggestionExtensions({ options: optionsRef, handle: chipHandle }),
    createSlashCommandExtension({ items: slashItemsRef, handle: slashHandle }),
  ],
  [],
)
// …
<DocumentEditor extensions={extensions} /* … */ />
<ChipSuggestionPopover handleRef={chipHandle} campaignId={campaignId} />
<SlashCommandPopover handleRef={slashHandle} />
```

---

## 7. shadcn for the slash menu — cmdk as *styling*, never as *keyboard engine*

There are **two distinct ways to "use cmdk"**, and conflating them is the source
of every apparent contradiction here:

1. **cmdk as a keyboard *engine*** — render a `CommandInput`, let cmdk own
   filtering, `selectedIndex`, arrow-key nav, and `aria-selected`. **This is the
   part that fights `@tiptap/suggestion`**: both want to own focus and keydown.
   The Novel / `@harshtalks/slash-tiptap` / pagescms editors make it work only
   via a **synthetic-`KeyboardEvent` bridge** (hidden `CommandInput`, `#id`
   querySelector, a global keydown re-dispatch into the cmdk root).
   `chip-suggestion-popover.tsx`'s docblock rejected exactly this: the suggestion
   plugin *"is incompatible with both shadcn `Popover` (wants a trigger + focus
   ownership) and cmdk (wants its own input)."*

2. **cmdk as *styling primitives*** — use `Command` / `CommandGroup` /
   `CommandItem` / `CommandEmpty` as pre-styled shells, and drive selection +
   filtering yourself. **No `CommandInput`, no cmdk keyboard ownership.** This
   does **not** fight the suggestion plugin, because cmdk's engine is never
   engaged.

The community example the repo surfaced —
[`ehtisham-afzal/tiptap-shadcn`'s `floating-menu.tsx`](https://github.com/ehtisham-afzal/tiptap-shadcn/blob/master/components/tiptap/extensions/floating-menu.tsx)
— is **approach 2, not 1**: it hand-rolls `selectedIndex`, a manual keydown
listener, and a `useMemo` filter, and uses `Command`/`CommandItem` purely as the
styled container (no `CommandInput`). That is the **same keyboard model this doc
recommends** — it just wears `CommandItem` where §6.1 wrote `div role="option"`.
So it corroborates our approach; it does not revive the incompatibility. (Two
things in *that* file we deliberately don't copy: it's **TipTap v2**
(`FloatingMenu` from `@tiptap/react` + `tippyOptions`), and it **abandons
`@tiptap/suggestion`**, re-parsing the slash from line text in `shouldShow` —
more fragile, and it would make the slash menu diverge from the chip menu, which
*does* use suggestion.)

**Decision:** the slash menu keeps the **hand-rolled keyboard + `@tiptap/suggestion`**
model (§6.1) — consistent with the chip menu, so we don't ship two solutions to
one problem. For the **presentation shell**, either option is sanctioned:

- **7a — plain `SuggestionListbox` div** (matches the chip popover exactly;
  maximal consistency; we render group headings ourselves — trivial).
- **7b — shadcn `Command` primitives as the shell** (`CommandGroup` gives the
  "Basic blocks / Inline / …" headings and `CommandEmpty` the no-results row
  nearly for free — a better fit for a *grouped* slash menu than the flat chip
  listbox). **Constraint:** suppress cmdk's engine cleanly — **no `CommandInput`,
  do not rely on cmdk's `aria-selected`** — and drive selection solely from our
  `selectedIndex`. The `ehtisham-afzal` file sets selection in *two* places
  (cmdk's `aria-selected` **and** a manual `selectedIndex`/className), a double
  source of truth we must avoid.

Recommendation: **7b if the slash menu ships grouped** (it should — categories
read well), **7a if it stays flat**. Either way the keyboard/suggestion half is
unchanged, and `SuggestionListbox` can expose an optional `groups` prop so both
menus share one primitive. The cmdk *keyboard-engine bridge* (approach 1) remains
rejected — recorded in §11.

---

## 8. Markdown round-trip safety (which slash items are allowed)

Because storage is Markdown, a slash item may only insert a block that survives
`getMarkdown()` → `setContent(markdown)`. Classification:

| Block | Round-trips via `@tiptap/markdown` + StarterKit? | In the menu? |
| -- | -- | -- |
| Heading 1–4 | ✅ CommonMark `#` | ✅ |
| Bullet / ordered list | ✅ | ✅ |
| Blockquote | ✅ | ✅ |
| Code block | ✅ fenced | ✅ |
| Horizontal rule | ✅ `---` | ✅ |
| Bold/italic/strike/code marks | ✅ | ✅ (also bubble menu) |
| Participant chip | ✅ (custom tokenizer, byte-stable — [round-trip test](../../apps/web/components/editor/markdown-round-trip.test.ts)) | ✅ (via `@`) |
| **Task list** | ⚠ needs `@tiptap/extension-task-list` + GFM `- [ ]` support in the markdown serializer | ❌ until verified (**⚠ spike**) |
| **Table** | ⚠ GFM tables; not in StarterKit; serializer support unverified | ❌ (defer) |
| **Image** | ⚠ needs an upload flow + `![]()`; storage/Blob integration | ❌ (defer to its own ticket) |

**Enforcement, not a comment:** the allowed set should be a typed list the menu
is built from, and the round-trip test should be **extended to assert every
slash item's output survives a round-trip** (Design-by-Contract, Code Style #8).
That test is the gate that stops someone adding a table item that corrupts on
save. A slash item that can't be proven round-trip-safe doesn't ship.

**Prerequisite — the gate currently certifies the wrong editor.** The
round-trip test's `makeEditor` builds a **different editor than production**:
heading levels `[2, 3]` vs. `MarkdownField`'s `[1, 2, 3, 4]`, no Typography, no
link config. The very first slash item ("Heading 1") inserts a node the test
editor can't even represent. Before the test can serve as the §8 contract,
extract `MarkdownField`'s base extension set into **one shared factory**
(e.g. `baseEditorExtensions()` in `components/editor/`) consumed by both the
field and the test — the extension set is a distinction currently decided
twice, and it has already drifted (Code Style #9). This lands in P0, ahead of
the first slash item.

---

## 9. Control 2 — Floating selection (bubble) menu

### 9.1 v3 API (the v2→v3 deltas that break copied tutorials)

```tsx
import { BubbleMenu } from "@tiptap/react/menus"   // v3: moved here from @tiptap/react
```

- **`tippyOptions` is gone.** Positioning is Floating UI via an `options` prop:
  `options={{ placement: "top", offset: 6, flip: true, shift: true }}`.
- **Don't register the extension** — the React `<BubbleMenu>` wires its own
  plugin; do not add it to `useEditor({ extensions })`.
- `shouldShow`, `pluginKey`, `updateDelay` prop names are unchanged from v2.

```tsx
function EditorBubbleMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 6 }}
      shouldShow={({ editor, state, from, to }) => {
        if (from === to) return false                      // empty selection
        if (editor.isActive("codeBlock")) return false     // no marks in code
        const text = state.doc.textBetween(from, to, " ").trim()
        return text.length > 0                             // not whitespace-only
      }}
    >
      <BubbleToolbar editor={editor} />
    </BubbleMenu>
  )
}
```

### 9.2 shadcn inside — yes for controls, with the focus rule

`Button`, `Toggle`, `ToggleGroup`, `Separator` drop straight in (no portals, no
focus traps). **Two universal rules:**

1. Any interactive control must `onMouseDown={(e) => e.preventDefault()}` so
   pressing it doesn't blur the contentEditable, collapse the selection, and
   make `shouldShow` tear the menu down mid-click.
2. **Active states must come from `useEditorState`, never a bare
   `editor.isActive(…)` in render.** A React component holding `editor` does
   **not** re-render on editor transactions; a bare `isActive` read renders
   once and goes stale the moment the selection moves between bold and plain
   text. v3's `useEditorState({ editor, selector })` (from `@tiptap/react`)
   subscribes the component to transactions and re-renders only when the
   selected slice changes. This applies to every active-state control in the
   bubble menu *and* the drag handle's block menu.

```tsx
const marks = useEditorState({
  editor,
  selector: ({ editor }) => ({
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    code: editor.isActive("code"),
  }),
})

<ToggleGroup type="multiple" className="gap-0.5">
  <ToggleGroupItem value="bold"
    data-state={marks.bold ? "on" : "off"}
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => editor.chain().focus().toggleBold().run()}>
    <TextB />
  </ToggleGroupItem>
  {/* italic, strike, code … */}
</ToggleGroup>
<Separator orientation="vertical" className="mx-1 h-5" />
{/* link control — see 9.3 */}
```

### 9.3 The link input — swap content (recommended) or a container-portaled Popover

The trap to design around: opening a portaled `Popover`/`DropdownMenu` *inside*
the bubble menu moves focus out of the editor → the bubble menu's blur-to-hide
unrenders it before the click lands (TipTap maintainer note,
[discussion #4145](https://github.com/ueberdosis/tiptap/discussions/4145)). The
standard fix is to portal the sub-popover **into the bubble menu's own DOM**
(`container={bubbleRef}`) so focus never leaves the menu subtree.

> **Correction (verified 2026-07-13):** an earlier draft claimed the
> `container`-portal fix was unreliable on Base UI due to an *open* bug
> ([mui/base-ui#1930](https://github.com/mui/base-ui/issues/1930)). **That bug is
> fixed.** It was closed as completed on 2025-09-29 by
> [PR #2818](https://github.com/mui/base-ui/pull/2818), which first shipped in
> **Base UI v1.0.0** (2025-12-11); the fix commit is an ancestor of **v1.5.0**,
> the version [`packages/ui`](../../packages/ui/package.json) resolves
> (`@base-ui/react@^1.5.0`). So a container-portaled Base UI `Popover` inside the
> bubble menu is a **viable option**, not a blocked one. The recommendation below
> to *swap content* is now a **preference for simplicity**, not a workaround for a
> platform bug.

**Recommended: model the bubble menu as `mode: 'toolbar' | 'link'`** (swap the
toolbar for an inline `<Input>` in place — no second portal, no focus leaving the
menu's DOM, fewer moving parts than any nested-popover approach, and it sidesteps
the blur-to-hide class of issues by construction). **Alternative now on the
table:** a Base UI `Popover` with `container={bubbleRef}` (unblocked by the #1930
fix). Both are legitimate; prefer swap-content unless a future control needs a
richer popover than an inline input. Clicking the
link toggle flips `mode` to `'link'` and the menu re-renders an inline `<Input>`
+ apply/remove **in place of** the toolbar — no second portal, no focus leaving
the menu's DOM. Capture `{ from, to }` on entering link mode and restore it with
`setTextSelection(range).extendMarkRange('link').setLink({ href })` on apply,
because the input steals the caret. Add `mode === 'link'` to `shouldShow`'s
allow-list so the menu stays open while editing.

**Composition constraint:** `shouldShow` is a prop on `<BubbleMenu>` (the
parent) — so `mode` **cannot live inside `BubbleToolbar`** (the child) as a
naive reading of the two snippets suggests. Lift `mode` into
`EditorBubbleMenu`, which both passes a `shouldShow` closing over it and hands
`mode`/`setMode` down to the toolbar.

```tsx
function BubbleToolbar({ editor, mode, setMode }: {
  editor: Editor
  mode: "toolbar" | "link"
  setMode: (mode: "toolbar" | "link") => void
}) {
  const savedRange = useRef<{ from: number; to: number } | null>(null)
  const [href, setHref] = useState("")

  if (mode === "link") {
    const apply = () => {
      const r = savedRange.current
      if (r) editor.chain().focus().setTextSelection(r)
        .extendMarkRange("link").setLink({ href }).run()
      setMode("toolbar")
    }
    return (
      <div className="flex items-center gap-1">
        <Input autoFocus value={href} placeholder="https://…"
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()} />
        <Button size="sm" onMouseDown={(e) => e.preventDefault()} onClick={apply}>Apply</Button>
      </div>
    )
  }
  return (/* toolbar with a link Toggle that captures selection then setMode("link") */)
}
```

### 9.4 ⚠ Clipping spike

`document-editor.tsx` wraps the body in an `overflow-y-auto` scroller. A bubble
menu positioned inside it can clip. The escape hatch is `options.appendTo` to
portal to `body` — but that prop has a **known React-wrapper bug**
([tiptap#6837](https://github.com/ueberdosis/tiptap/issues/6837)) at some 3.x
patches. **⚠ spike** the bubble menu inside the actual scroller at our pinned
`3.23.6` before committing to the design; if `appendTo` misbehaves, the
fallback is to lift the menu render outside the scroll container.

---

## 10. Control 3 — Block drag handle

### 10.1 Component + gutter

`<DragHandle>` renders **as a sibling of `<EditorContent>`** (inside the `chrome`
slot), registers a plugin, and Floating-UI-positions your children into the left
gutter beside the hovered block. The editor wrapper needs `position: relative`
and left padding for the gutter.

**Gutter padding ownership.** That left padding collides with a deliberate
style decision: `DocumentEditor` sets `[&_.ProseMirror]:px-0` for the
borderless "reads like a document" look. The padding is a per-surface style
that must ride the same opt-in as the chrome itself — when a surface passes a
`chrome` with `drag`, `DocumentEditor` (not `MarkdownField`) supplies the
gutter padding class alongside it, so bare surfaces keep the flush document
look and chrome surfaces get the gutter in one decision, not two (Code Style
#9). Concretely: `EditorChrome`'s `drag` flag and the padding class are set
together at the surface, or `DocumentEditor` derives both from one
`chrome`-config prop.

```tsx
import DragHandle from "@tiptap/extension-drag-handle-react"

function BlockDragHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<{ node: PMNode | null; pos: number }>({ node: null, pos: -1 })
  return (
    <DragHandle
      editor={editor}
      computePositionConfig={{ placement: "left-start" }}
      onNodeChange={({ node, pos }) => setTarget({ node, pos })}
    >
      <BlockMenu editor={editor} target={target} />
    </DragHandle>
  )
}
```

### 10.2 The block menu — full shadcn `DropdownMenu` ✅

This control **is** trigger-driven, so it maps cleanly to shadcn `DropdownMenu`
(the one place the external research and our own instincts fully agree). The
menu anchors to its own trigger (its own portal), not to the editor, so there's
no coordinate conflict with the drag handle's Floating UI positioning.

```tsx
function BlockMenu({ editor, target }: { editor: Editor; target: { node: PMNode | null; pos: number } }) {
  const [open, setOpen] = useState(false)
  const del = () => target.node &&
    editor.chain().focus().deleteRange({ from: target.pos, to: target.pos + target.node.nodeSize }).run()
  const dup = () => target.node &&
    editor.chain().focus().insertContentAt(target.pos + target.node.nodeSize, target.node.toJSON()).run()
  return (
    <DropdownMenu open={open} onOpenChange={(o) => { setOpen(o); o ? editor.commands.lockDragHandle() : editor.commands.unlockDragHandle() }}>
      <DropdownMenuTrigger asChild>
        <button aria-label="Block actions" className="cursor-grab rounded p-0.5 text-muted-foreground hover:bg-muted active:cursor-grabbing">
          <DotsSixVertical weight="bold" className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom">
        <DropdownMenuItem onSelect={dup}>Duplicate</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={del}>Delete</DropdownMenuItem>
        {/* "Turn into…" submenu, gated to Markdown-safe targets (§8) */}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**The hover-hide race + the fix.** The handle hides when the pointer leaves the
block; moving the cursor onto the (portaled) open menu can fire `onNodeChange`
and change the target out from under the menu. Fix: **`lockDragHandle()` on
open, `unlockDragHandle()` on close** (shown above) and treat `target` as
latched while `open` — the drag-handle analog of the bubble menu's focus rule.
`pos` is *before* the block; the block spans `[pos, pos + node.nodeSize]`.

### 10.3 Notes

- `computePositionConfig` default is `{ placement: "left-start", strategy: "absolute" }`;
  use `strategy: "fixed"` if the gutter misaligns inside the scroller.
- `nested` prop enables dragging list items; deeply nested / custom NodeView
  blocks (our `ParticipantChip` is inline, so fine) can report the wrapper vs
  child in `onNodeChange` — **⚠ spike** against a beat with nested lists.
- Only offer "Turn into…" targets that are Markdown-safe (§8).

---

## 11. Design decisions & rejected alternatives

| Decision | Chosen | Rejected | Why |
| -- | -- | -- | -- |
| Editor engine | Keep TipTap 3 | BlockNote | Settled by the BlockNote evaluation (`docs/blocknote-evaluation/evaluation.md`, on the `claude/blocknote-editor-evaluation-5095d2` branch) — BlockNote inverts our Markdown-native storage. |
| Slash keyboard/trigger | Hand-rolled selection + `@tiptap/suggestion` | cmdk keyboard-engine + synthetic-event bridge (Novel) | Consistency with the chip menu; the bridge is two solutions to one problem. cmdk's *engine* fights the suggestion focus model. |
| Slash popover shell | `SuggestionListbox` div **or** shadcn `Command` primitives (§7a/§7b) | — | cmdk-as-*styling* is fine (no `CommandInput`); it never engages cmdk's keyboard engine. `Command` shell preferred if grouped. |
| Slash positioning | Manual `computePosition` (matches chip popover) | v3 managed `props.mount()` | Proven in-repo; lets one primitive serve both menus. `mount()` is the noted fallback. |
| Editor exposure | `chrome` render-prop on `MarkdownField` | Context / lift editor ownership upward | Keeps the field storage-blind and the sole editor owner; co-locates menus with `<EditorContent>`; no prop-drilling. |
| Bubble link input | Swap inline content (`mode` state machine) — *preferred for simplicity* | Container-portaled Base UI `Popover` (now viable — #1930 fixed in Base UI v1.0.0, in our v1.5.0) | Swap-content has no portal and no focus-leaves-menu risk. The nested-`Popover` route is unblocked but heavier; reach for it only if a control needs more than an inline input. |
| Drag menu UI | Full shadcn `DropdownMenu` | Hand-roll | It's genuinely trigger-driven; a11y menu semantics for free; no focus conflict. |
| Drag extension | Official `@tiptap/extension-drag-handle-react` **at `3.23.6` exactly** | Community `global-drag-handle`; a `3.27.x` install | Official has React `onNodeChange` + `lockDragHandle`; Yjs peer set is build-time-only. Peers are **exact-pinned** per version, so the install must match the stack version — `3.23.6` exists and dissolves the §14 bump question. Community is the fallback if peers prove intractable. |
| Bubble/block active states | `useEditorState` selectors | Bare `editor.isActive(…)` in render | Components holding `editor` don't re-render on transactions; bare reads go stale as the selection moves (§9.2). |

---

## 12. Phasing

Each phase is independently shippable and independently opt-in-able per surface.

1. **P0 — `chrome` seam + shared foundations.**
   Add the `chrome` render-prop to `MarkdownField`/`DocumentEditor`; extract the
   chip popover's floating-ui listbox skeleton into a shared
   `components/editor/suggestion-listbox.tsx`; re-point the chip popover onto it
   (proves the extraction is behavior-preserving via the existing chip e2e);
   **extract `MarkdownField`'s base extension set into a shared factory and
   re-point the round-trip test onto it** (§8 prerequisite — the test currently
   builds a divergent editor); add the code-block `allow` guard to the chip
   suggestion (§6.2).
   → verify: chip suggestion still passes `planner-notes.spec.ts`; round-trip
   suite green on the production extension set; **manual visual audit of the
   bare surfaces** (the new wrapper div moves where the border/focus-ring
   classes live — the chip e2e won't catch a styling regression).

2. **P1 — Slash menu.** `slash-command.ts` + `SlashCommandPopover` on the shared
   primitive; the Markdown-safe item list; extend the round-trip test to assert
   each item's output survives (against the shared factory from P0). Wire into
   Beat/NPC/Article surfaces. Spike the `insertContent("@")` re-trigger (§6.2)
   before including the "Link a participant" item.
   → verify: unit round-trip test per item + an e2e that inserts an H2 and a
   bullet list via `/` and asserts the saved Markdown.

3. **P2 — Bubble menu.** `@tiptap/react/menus` + `BubbleToolbar` with the
   swap-content link input, active states via `useEditorState` (§9.2), `mode`
   lifted to `EditorBubbleMenu` (§9.3). **Do the §9.4 clipping spike first.**
   → verify: e2e select-text → bold → assert `**…**` in saved Markdown; link
   apply → assert `[…](…)`; toggle states track a moving selection.

4. **P3 — Drag handle.** Install the drag cluster **at `3.23.6`** (resolve the
   §4 Yjs-peer caveat first), the `BlockDragHandle` + shadcn `DropdownMenu`
   block menu with lock-on-open; gutter padding rides the surface's chrome
   opt-in (§10.1).
   → verify: e2e delete + duplicate a block via the menu; assert Markdown.
   Drag-reorder via HTML5 DnD is **notoriously flaky in Playwright** — attempt
   it, but plan the fallback now: assert the reorder at the command level
   (`onNodeChange` target + a programmatic move) and keep the pointer-drag
   itself a manual/visual check rather than a required CI gate.

5. **P4 — polish.** `EditorChrome` composite + flags; per-surface enablement
   audit (which surfaces get chrome vs stay bare); a11y pass (roving focus,
   `aria-` on the listbox, handle keyboard access).

---

## 13. Risks & required spikes

| # | Risk | Spike / mitigation |
| -- | -- | -- |
| R1 | Drag-handle Yjs/collab peer deps break the Turborepo install/build | **⚠ spike** the install on a throwaway branch (§4). Version-mixing is already ruled out (peers are exact-pinned — install at `3.23.6`); the residual risk is only the non-optional Yjs peers. Fall back to devDep peer set or community extension. |
| R2 | Bubble menu clips inside the `overflow-y-auto` scroller; `appendTo` bug (#6837) | **⚠ spike** at pinned `3.23.6` (§9.4); fallback = render menu outside the scroller. |
| R3 | ~~Base UI nested-portal bug (#1930)~~ **resolved** — fixed in Base UI v1.0.0, present in our v1.5.0 | No longer a risk. Swap-content (§9.3) is still the preferred default for simplicity, not a workaround. |
| R4 | A slash/turn-into item corrupts the Markdown round-trip | The round-trip test is the gate (§8); no item ships without a passing assertion. **Gate precondition:** the test must build the production extension set via the shared factory (§8) — it currently doesn't. |
| R5 | Chrome-free "Obsidian" surfaces get chrome by accident | Opt-in per surface via `chrome`/flags; default is bare (§2.4, §5). |
| R6 | Nested-node `onNodeChange` targets the wrong node | **⚠ spike** drag on nested lists (§10.3); constrain `nested` config. |
| R7 | Toolbar/menu controls render stale active states | `useEditorState` selectors, never bare `editor.isActive` in render (§9.2); the P2 e2e asserts toggles track a moving selection. |
| R8 | Touch devices: no hover to summon the drag handle; iOS's native selection toolbar fights the bubble menu | No spike planned — **declared out of scope for v1** (§14). Chrome degrades gracefully: slash + Markdown shortcuts still work; drag/bubble are hover/selection enhancements. |

---

## 14. Open questions

- **Which surfaces get chrome?** Proposed: Beat, NPC, Article (long-form). Not
  the builder's terse animus fields. Needs Jackson's call.
- **Task lists / tables / images** — deferred (§8). Each is its own ticket with
  its own Markdown-serializer + (for images) Blob-upload story.
- **`props.mount()` reconsideration** — if we later add more suggestion surfaces,
  is the managed path worth adopting uniformly? Revisit after P1.
- **Stack bump to `3.27.x`** — no longer coupled to this design (the drag
  handle installs at `3.23.6`, §4). A future bump is a standalone chore; note
  that `@tiptap/markdown` is the one **exact-pinned** tiptap dep in
  `package.json` and the round-trip test calls it "still beta" — any bump's
  gate is the round-trip suite.
- **Touch/tablet support** — out of scope for v1 (R8). If DMs run the planner
  on iPads at the table, the drag handle (hover-summoned) and bubble menu
  (fights iOS's native selection toolbar) need their own design pass; slash
  commands and Markdown shortcuts remain fully usable meanwhile.

---

## Sources

TipTap v3 first-party docs & source:

- Suggestion utility (v3) — <https://tiptap.dev/docs/editor/api/utilities/suggestion>
- `@tiptap/suggestion` v3 source (`types.ts`, MIT `package.json`) — <https://github.com/ueberdosis/tiptap/tree/main/packages/suggestion>
- Slash-command example — <https://tiptap.dev/docs/examples/experiments/slash-commands>
- BubbleMenu (v3, Floating UI, `@tiptap/react/menus`) — <https://tiptap.dev/docs/editor/extensions/functionality/bubble-menu>
- FloatingMenu — <https://tiptap.dev/docs/editor/extensions/functionality/floatingmenu>
- Drag Handle React (MIT) — <https://tiptap.dev/docs/editor/extensions/functionality/drag-handle-react>
- "We're open-sourcing more of Tiptap" (drag handle → MIT, Jun 30 2025) — <https://tiptap.dev/blog/release-notes/were-open-sourcing-more-of-tiptap>
- v2 → v3 upgrade guide (tippy removal, menu import move, `immediatelyRender`) — <https://tiptap.dev/docs/guides/upgrade-tiptap-v2>
- npm `@tiptap/extension-drag-handle` (MIT, public, peer metadata) — <https://www.npmjs.com/package/@tiptap/extension-drag-handle>

Community / caveats:

- Novel slash-command (cmdk bridge — the rejected pattern) — <https://github.com/steven-tey/novel/blob/main/packages/headless/src/extensions/slash-command.tsx>
- shadcn `Command` (cmdk-based) — <https://ui.shadcn.com/docs/components/command>
- Bubble-menu + dropdown focus discussion — <https://github.com/ueberdosis/tiptap/discussions/4145>
- Base UI nested-portal-in-container bug (**fixed**, closed 2025-09-29) — <https://github.com/mui/base-ui/issues/1930> · fix [PR #2818](https://github.com/mui/base-ui/pull/2818), shipped Base UI v1.0.0 (2025-12-11), included in our v1.5.0
- BubbleMenu `appendTo` React-wrapper bug — <https://github.com/ueberdosis/tiptap/issues/6837>
- `tiptap-extension-global-drag-handle` (community fallback) — <https://github.com/NiclasDev63/tiptap-extension-global-drag-handle>

Repo precedent:

- [`markdown-field.tsx`](../../apps/web/components/editor/markdown-field.tsx), [`document-editor.tsx`](../../apps/web/components/editor/document-editor.tsx)
- [`chip-suggestion.ts`](../../apps/web/app/campaigns/[campaignShortId]/_components/notes/chip-suggestion.ts), [`chip-suggestion-popover.tsx`](../../apps/web/app/campaigns/[campaignShortId]/_components/notes/chip-suggestion-popover.tsx)
- [`beat-editor.tsx`](../../apps/web/app/campaigns/[campaignShortId]/_components/notes/beat-editor.tsx), [`markdown-round-trip.test.ts`](../../apps/web/components/editor/markdown-round-trip.test.ts)
- BlockNote evaluation — `docs/blocknote-evaluation/evaluation.md` (on the `claude/blocknote-editor-evaluation-5095d2` branch; the decision this builds on)
