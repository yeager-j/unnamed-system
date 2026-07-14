# UNN-620 Shadcn Completion Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible Atomic/CodeMirror completion tooltip with a first-party shadcn participant menu while leaving CodeMirror as the only completion, keyboard, selection, apply, and editor-focus owner.

**Architecture:** The existing single `autocompletion()` instance remains intact and its native tooltip becomes visually hidden rather than removed, preserving CodeMirror's controller and ARIA behavior. A focused `participant-link-completion-menu.tsx` view plugin reads public completion state, mounts one controlled `Command` view at the caret, and mirrors pointer selection back into CodeMirror without taking focus.

**Tech Stack:** React 19, CodeMirror 6 autocomplete/view APIs, `@floating-ui/dom`, shadcn `Command` primitives from `@workspace/ui`, Vitest, jsdom.

## Global Constraints

- Do not edit `packages/editor/src`.
- Keep exactly one `autocompletion()` owner and keep `wikiLinks()` suggest-less.
- Do not render a `CommandInput`; typing remains in `.cm-content`.
- Do not add dependencies or move real campaign/editor surfaces off TipTap.
- Keep the public `createParticipantLinkExtensions(config): Extension[]` interface unchanged.
- Use semantic theme tokens and the existing Phosphor participant icons.

---

### Task 1: Controlled completion-menu bridge

**Files:**
- Create: `apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-link-completion-menu.tsx`
- Modify: `apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-links.test.ts`

**Interfaces:**
- Consumes: CodeMirror `Completion`, `completionStatus`, `currentCompletions`, `selectedCompletionIndex`, `setSelectedCompletion`, and `acceptCompletion`.
- Produces: `registerParticipantCompletion(completion, presentation): void` and `participantLinkCompletionMenu(): Extension`.

- [ ] **Step 1: Add failing DOM tests for the controlled menu**

Add assertions to the focused jsdom suite that start completion and verify:

```ts
await completionsOf(view)
await vi.waitFor(() => {
  expect(
    document.querySelector("[data-participant-completion-menu]")
  ).not.toBeNull()
})

expect(document.body.textContent).toContain("From the world web")
expect(document.body.textContent).toContain("Create")
expect(document.querySelector("[data-slot=command-input]")).toBeNull()
```

Add a selected-row synchronization assertion:

```ts
view.dispatch({ effects: setSelectedCompletion(1) })
await vi.waitFor(() => {
  expect(
    document
      .querySelector('[data-participant-completion-index="1"]')
      ?.getAttribute("data-selected")
  ).toBe("true")
})
```

Add pointer/focus and cleanup assertions:

```ts
view.focus()
const row = document.querySelector<HTMLElement>(
  '[data-participant-completion-index="0"]'
)
row!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }))
expect(view.hasFocus).toBe(true)
expect(view.state.doc.toString()).toBe("[[npc:n1|Maren]] ")

view.destroy()
await vi.waitFor(() => {
  expect(
    document.querySelector("[data-participant-completion-menu]")
  ).toBeNull()
})
```

- [ ] **Step 2: Run the focused test and confirm red**

Run:

```bash
npm run test -w apps/web -- --run 'app/campaigns/[campaignShortId]/_components/notes/participant-links.test.ts'
```

Expected: FAIL because the participant completion menu and registration interface do not exist.

- [ ] **Step 3: Implement the focused React/CodeMirror bridge**

Create a client module with these public internals:

```tsx
export interface ParticipantCompletionPresentation {
  iconKey: LinkerIconKey
  kind: "option" | "mint"
}

export function registerParticipantCompletion(
  completion: Completion,
  presentation: ParticipantCompletionPresentation
): void

export function participantLinkCompletionMenu(): Extension
```

Use a module-private `WeakMap<Completion, ParticipantCompletionPresentation>` and a `ViewPlugin` that:

```tsx
const status = completionStatus(view.state)
const completions = currentCompletions(view.state)
const selectedIndex = selectedCompletionIndex(view.state) ?? 0

root.render(
  status === "active" && completions.length > 0 ? (
    <ParticipantCompletionMenu
      view={view}
      completions={completions}
      selectedIndex={selectedIndex}
      anchor={() => view.coordsAtPos(view.state.selection.main.head)}
    />
  ) : null
)
```

Mount one root container under `document.body`, rerender on every relevant view update, and call `root.unmount()` plus `container.remove()` in `destroy()`.

Render the visual surface with no input and no internal filtering:

```tsx
<div data-participant-completion-menu aria-hidden="true">
  <Command shouldFilter={false} value={`completion-${selectedIndex}`}>
    <CommandList>
      <CommandGroup heading="From the world web">
        {worldRows.map(renderRow)}
      </CommandGroup>
      <CommandGroup heading="Create">{mintRows.map(renderRow)}</CommandGroup>
    </CommandList>
  </Command>
</div>
```

Every `CommandItem` must be inside its `CommandGroup`, use `forceMount`, and handle pointer interaction without transferring focus:

```tsx
<CommandItem
  forceMount
  value={`completion-${index}`}
  data-participant-completion-index={index}
  onMouseEnter={() => view.dispatch({ effects: setSelectedCompletion(index) })}
  onMouseDown={(event) => {
    event.preventDefault()
    view.dispatch({ effects: setSelectedCompletion(index) })
    acceptCompletion(view)
    view.focus()
  }}
>
  {content}
</CommandItem>
```

Position the panel from the caret virtual element with `computePosition`, `autoUpdate`, `offset(4)`, `flip()`, and `shift({ padding: 8 })`, matching the existing TipTap suggestion popover behavior.

- [ ] **Step 4: Run the focused test and confirm green**

Run the command from Step 2.

Expected: the focused suite passes, including group headings, no `CommandInput`, selection synchronization, pointer apply, focus preservation, and cleanup.

- [ ] **Step 5: Commit the bridge**

```bash
git add \
  'apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-link-completion-menu.tsx' \
  'apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-links.test.ts'
git commit -m 'feat: add controlled participant completion menu'
```

---

### Task 2: Integrate the shadcn view with the single completion owner

**Files:**
- Modify: `apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-links.ts`
- Modify: `apps/web/app/atomic-editor-theme.css`
- Test: `apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-links.test.ts`

**Interfaces:**
- Consumes: `registerParticipantCompletion()` and `participantLinkCompletionMenu()` from Task 1.
- Produces: the unchanged public `createParticipantLinkExtensions(config): Extension[]` with one autocompletion instance and the controlled visual menu extension.

- [ ] **Step 1: Change existing DOM-helper tests to require the shadcn view**

Remove assertions for `.cm-participant-completion-icon`. Keep label/detail/mint assertions, and require shadcn slots:

```ts
expect(document.querySelector('[data-slot="command"]')).not.toBeNull()
expect(document.querySelectorAll('[data-slot="command-group"]')).toHaveLength(2)
expect(document.querySelector('[data-slot="command-input"]')).toBeNull()
```

- [ ] **Step 2: Run the focused suite and confirm the integration test is red**

Run the focused command from Task 1.

Expected: FAIL while `participant-links.ts` still registers `addToOptions` DOM helpers and does not install the menu extension.

- [ ] **Step 3: Replace DOM-helper registration with presentation metadata**

In `participant-links.ts`:

```ts
import {
  participantLinkCompletionMenu,
  registerParticipantCompletion,
} from "./participant-link-completion-menu"
```

Register each completion after constructing it:

```ts
registerParticipantCompletion(completion, {
  iconKey: option.iconKey,
  kind: "option",
})
```

and:

```ts
registerParticipantCompletion(completion, {
  iconKey: kind,
  kind: "mint",
})
```

Return the menu extension beside the existing autocomplete owner:

```ts
return [
  wikiLinks({ resolve, onOpen, openOnClick: true }),
  participantLinkDecorations(config.world),
  autocompletion({
    activateOnTyping: true,
    icons: false,
    override: sources,
    tooltipClass: () => "cm-participant-native-completion",
  }),
  participantLinkCompletionMenu(),
]
```

Delete `completionRows`, `CompletionRow`, `renderCompletionIcon`, and `addToOptions` from `participant-links.ts`.

- [ ] **Step 4: Make the native tooltip visually hidden, not removed**

Replace completion-icon CSS with a visually-hidden native tooltip rule:

```css
.cm-tooltip-autocomplete.cm-participant-native-completion {
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip-path: inset(50%) !important;
  white-space: nowrap !important;
  pointer-events: none !important;
}
```

Style only the external shell layout around shadcn components with semantic tokens; do not override `Command` typography or colors.

- [ ] **Step 5: Run focused tests, typecheck, lint, and depcheck**

```bash
npm run test -w apps/web -- --run 'app/campaigns/[campaignShortId]/_components/notes/participant-links.test.ts'
npm run typecheck
npm run lint
npm run depcheck
```

Expected: all commands exit 0; lint may report the repository's pre-existing warnings but no errors.

- [ ] **Step 6: Commit the integration**

```bash
git add \
  'apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-links.ts' \
  'apps/web/app/campaigns/[campaignShortId]/_components/notes/participant-links.test.ts' \
  apps/web/app/atomic-editor-theme.css
git commit -m 'feat: render participant completions with shadcn'
```

---

### Task 3: Browser and full-story verification

**Files:**
- Verify: `apps/web/app/campaigns/[campaignShortId]/dev/editor/page.tsx`
- Verify: `apps/web/app/dev/editor/page.tsx`

**Interfaces:**
- Consumes: the final extension set from Task 2.
- Produces: verified `/dev/editor` behavior with the shadcn menu and no campaign-surface cutover.

- [ ] **Step 1: Run the full required command set**

```bash
npm run test
npm run typecheck
npm run lint
npm run depcheck
git diff --check
```

Expected: all commands exit 0; tests include the new controlled-menu cases.

- [ ] **Step 2: Start the worktree app with its existing local environment**

```bash
set -a
source /Users/jackson/Developer/Showtime/showtime-app/.env.local
set +a
npm run dev -w apps/web -- --port 3100
```

Expected: Next reports ready at `http://localhost:3100`.

- [ ] **Step 3: Verify the menu and editor-focus contract in the browser**

Open `/dev/editor` and verify:

1. Type `@Ve`; the shadcn menu opens at the caret without an input.
2. Arrow selection changes the highlighted `CommandItem` while `.cm-content` stays focused.
3. Choose Vell with Enter; `[[character:c1|Vell]] ` is inserted and the pill renders.
4. Type `[[Mar`; click Maren; the click preserves editor focus and applies the completion.
5. Rename Maren; the mounted pill updates to Captain Maren without a document change.
6. Inspect the console; no new errors or hydration warnings appear.

- [ ] **Step 4: Run recall and final diff review**

Read every `docs/lessons/*.md`, review the final diff once against the recorded symptoms, and confirm no wound remains. Verify `packages/editor/src` has no changes:

```bash
git status --short
git diff --check
git diff --name-only -- packages/editor/src
```

Expected: no output from the `packages/editor/src` command.

- [ ] **Step 5: Commit any verification-only correction**

If browser verification required a correction, stage only the files changed by that correction and commit:

```bash
git commit -m 'fix: polish participant completion interactions'
```

If no correction was required, do not create an empty commit.
