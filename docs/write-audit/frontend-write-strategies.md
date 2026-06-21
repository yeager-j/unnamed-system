# Frontend Write Strategies — 2026-06-21

A spike survey of every strategy the **client** uses to trigger a write to the backend,
produced on the `feature/dungeons` epic branch. Companion to
[server-write-strategies.md](server-write-strategies.md), which covers how those writes
are *persisted*.

**The features genuinely diverge.** Underneath, almost everything calls a
`Result`-returning Server Action and reflects the result via `useTransition` + `sonner`
toast + (`revalidate` | `router.refresh` | `router.push`). But the *client trigger
layer* on top splits into **nine distinct mechanisms**, and which one a control uses is
decided per-feature — sometimes per-control within a feature. Three concurrency
substrates recur (per-class version refs, the `useQueuedWrite` token queue, debounced
promise-queues); the rest is how each surface chooses to be optimistic, debounced,
queued, or plain.

> **No `react-hook-form`, `useActionState`, or `useFormStatus` anywhere** — despite the
> stack listing RHF. Every input is hand-rolled `useState` + manual validation. (RHF is
> referenced in the PRD but used by no live surface.)

## The nine mechanisms

### 1. Optimistic + local-transition click dispatch
`apps/web/hooks/use-character.tsx:239-274` (`useCharacterWrite`) →
`apps/web/hooks/dispatch-character-write.ts:44`

The dominant character-sheet pattern. `write({ edit, surface, action })` applies an
optimistic edit through the shared `useOptimistic`/`reduceCharacter` frame inside a
*local* `useTransition`, dispatches with one silent stale→refetch→retry + cross-tab
broadcast, and lets React auto-revert on failure. Per-control `pending`, no global lock.
**Used by:** nearly every owner control — battle-condition toggles, HP/SP/victories
steppers, inventory equip, cast, all mechanic steppers, archetype unlock/rank-up.

### 2. Debounced autosave with shared serialized queue
`apps/web/hooks/use-debounced-auto-save.ts` (wrapped as `useCharacterAutoSave`,
`use-character.tsx:182-200`; and as `useBuilderAutoSave`, `hooks/use-builder-draft.tsx:120-137`)

Local draft + 500ms debounce + flush-on-blur/unmount; saves serialize through a shared
per-class promise chain so siblings read the freshly-bumped version token; rollback +
toast on failure. **Not** driven by `useOptimistic` — the input's own draft is the
optimistic display. **Used by:** character name / pronouns / ancestry / background; all
builder free-text + Markdown editors.

### 3. Bespoke single-shot transition (no provider optimism, cross-class)
`components/character-sheet/level-up-dialog.tsx:61-103`,
`components/character-sheet/rest-dialog.tsx:65-138`

The deliberate outliers: Level-up and Rest touch **multiple version classes**, which
the single-class dispatch pipeline can't compose, so they hand-roll their own transition
+ version refs. Level-up additionally opts *out* of stale-retry ("retry can mask a
conflict"). These are the seams a future multi-class write primitive would absorb.

### 4. Command-palette → existing actions
`components/character-sheet/command-palette.tsx`, `lib/commands/vitals.ts:32-41`

Not a new path — ⌘K commands receive the live `useCharacterWrite()` in their context and
ride mechanism #1. Parameterized commands (Take damage / Heal / Spend SP) collect an
amount via a tiny in-dialog form first. Owner-gated, desktop-only.

### 5. Navigation step-write (builder, draft-then-finalize)
`components/builder/builder-shell.tsx:184-243` (`ContinueLink`),
`components/my-characters/create-character-button.tsx:26-35`,
`components/builder/movements/persona/finalize-button.tsx`

The builder is **draft-then-finalize**: the draft row is minted up front
(`startCharacterDraftAction` on "Create"), every control writes incrementally via #1/#2,
and *forward* navigation persists the step pointer (`setBuilderStepAction`) inside a
transition before `router.push` — swallowing `stale` as benign. Back-nav and progress
dots are plain `<Link>`s that write nothing. Finalize is the single commit, flipping
`draft→finalized`.

### 6. Queued versioned-write + optimistic dual-container event dispatch (live sessions)
`apps/web/hooks/use-queued-write.ts:61-101` + `hooks/use-monotonic-version-ref.ts`;
encounter `components/combat/console/use-combat-console.ts:112-201` +
`console/dispatch-event.ts`; dungeon
`components/dungeon/explore/use-dungeon-console.ts:64-116` + `explore/dispatch-event.ts`

The live-session core. Each typed **event** is mirrored into one of **two**
`useOptimistic` containers (temporal row vs. map-instance row), enqueued on that row's
serialized version-token queue, and dispatched in a transition; `router.refresh()`
reconciles. Cross-writes (`addCombatant`) mirror *both* containers and advance *both*
tokens by hand. The `useQueuedWrite` substrate owns the monotonic version ref (synced
forward-only — a stale prop can't roll the token back), the serialized dispatch queue,
and one-shot stale-retry.

Dungeon mirrors encounter but adds non-optimistic gestures (`searchReveal`,
`finishDelve`, reminder toggles) and routes **live geometry edits** through this same
path (`editGeometry` event) rather than blob-autosave. Notable asymmetry: the dungeon
instance queue has **no `refetchVersion`** (`use-dungeon-console.ts:80-85`), so a stale
spatial write toasts rather than auto-retrying.

### 7. Debounced whole-blob canvas autosave (map templates)
`apps/web/hooks/use-map-autosave.ts`; `components/maps/canvas/map-canvas.tsx:172-177`

The no-Save-button map editor. Edits reduce local geometry client-side and emit the
**entire geometry blob**; name + geometry share one `maps.version` token through one
`versionRef`/`saveQueueRef` (two would false-`stale` each other), debouncing on
independent 600ms timers. Self-heals on the next edit; geometry does **not** hard-revert
on failure. **Same `MapCanvas` component** as #6, wired differently: `onGeometryChange`
(blob) for templates vs. `onGeometryEvent` (event) for live instances — the
trust-boundary split made visible in one component.

### 8. Realtime-ping → deduped refresh (read-trigger; consoles & watch views)
DM: `use-combat-console.ts:144-183`, `use-dungeon-console.ts:90-98`. Watch/fog:
`apps/web/hooks/use-snapshot-subscription.ts` (+ `use-encounter-snapshot.ts`,
`use-dungeon-snapshot.ts`)

Not writes, but how remote changes re-enter the client. DM consoles compare a ping
against the write ref and `queueMicrotask`-dedupe a `router.refresh()` (never forwarding
the ping into the write token — the UNN-378 fix). Watch/fog views run a
composite-version-guarded, realtime-first / ~1.5s-poll subscription with `AbortController`
out-of-order protection, stopping when the session ends (`ended` / `done`).

### 9. CRUD management surfaces — a spread of one-shot patterns
The campaign / my-characters surfaces are uniformly `useTransition` + toast + **no
optimism**, but diverge in shape:

| Shape | File | Notes |
|---|---|---|
| Plain button → action → redirect | `my-characters/create-character-button.tsx:26-35` | mints a draft, pushes to builder |
| `<form action>` + `FormData` dialog | `campaign/create-campaign-button.tsx:46-64`, `create-encounter-button.tsx:36-55` | native `required`/`maxLength`; create-campaign mixes `FormData` + a controlled Markdown field |
| Fully-controlled dialog, nested transitions | `campaign/create-dungeon-button.tsx` | inline map-create + local-append of the new row |
| `AlertDialog` confirm → action | `remove-player-button.tsx`, `remove-placement-button.tsx`, `leave-campaign-button.tsx`, `join-link-card.tsx` | revalidate-driven |
| Type-to-confirm destructive | `delete-campaign-button.tsx:45-71`, `my-characters/delete-character-dialog.tsx` | delete-character branches unnamed→discard vs named→type-to-confirm |
| cmdk combobox place/move | `campaign/add-character-dialog.tsx:65-84` | one action handles place *and* move |
| Zero-client-JS server-action form *(the real outlier)* | `app/join/[token]/page.tsx:107,159` | Server Component, `<form action={action.bind(...)}>`, no transition/toast/Result — the action just redirects |

Errors are toast-only everywhere (no inline field errors); native `required`/`maxLength`
is the only inline validation, and only on the two `FormData` dialogs. The
`live-encounter-lock` error branch is the one piece of shared cross-surface logic,
decoded to a labeled toast in remove-player / remove-placement / leave / delete-campaign
/ delete-character / add-character.

### Plus: staging rails (stage locally → batch-commit through #6)
`hooks/use-encounter-enemy-queue.ts` (localStorage + `useSyncExternalStore`, survives
reload) vs. `components/dungeon/shared/use-staged-enemies.ts` (ephemeral `useState`).
Both fan out to `addCombatant` dispatches on commit — same destination, different
persistence. The mid-fight add-combatant dialog
(`components/dungeon/combat/add-combatant-dialog.tsx:47-56`) commits one dispatch per
creature live; the setup path (`components/dungeon/setup/body.tsx:87-98`) batches the
whole roster at Start-combat.

## Two findings worth flagging

1. **Branch correction:** the **player combat-overlay write path is deleted** on
   `feature/dungeons` — no `applyOwnCombatEvent` / `use-own-combat-event` anywhere
   (verified zero matches). The watch view's conditions are read-only
   (`CombatStateDisplay`); a player's only writes there go through the standard
   character-sheet owner controls (#1/#2). This corroborates the encounter-side finding
   in the server survey.
2. **The divergence is mostly principled.** The split tracks three things: *who writes*
   (single owner → simple; multi-actor live → queued events), *trust boundary*
   (template blob-save vs. live event-dispatch on the same canvas), and *how
   rare/destructive* the write is (one-shot no-optimism for CRUD/level-up vs. optimistic
   for high-frequency steppers). The genuinely *unprincipled* divergences are small:
   three different "optimistic" implementations coexist in the builder alone
   (`useOptimistic`, `useState`-adopt-from-render, local-draft-rollback), and
   `use-map-autosave` duplicates the character-autosave concurrency core (noted as
   UNN-483 / -274 debt).

## Cross-surface summary

| Surface | Write mechanism(s) |
|---|---|
| Character sheet (owner) | #1 optimistic click-dispatch, #2 debounced autosave, #3 cross-class dialogs (level-up/rest), #4 command palette |
| Character builder | #2 debounced autosave, #5 draft-then-finalize step-writes, plus per-control optimism variants |
| DM combat console | #6 dual-container optimistic dispatch (encounter+instance queues), #8 ping→refresh |
| DM dungeon run-console | #6 dual-container dispatch (dungeon+instance) + non-optimistic search/finish/reminders + live `editGeometry`, #8 ping→refresh |
| Maps canvas editor | #7 debounced whole-blob autosave |
| Player encounter-watch | #1/#2 standard character writes only (overlay path deleted); #8 read-only snapshot subscription |
| Dungeon fog view | #8 read-only snapshot subscription |
| Campaign / my-characters / join | #9 one-shot CRUD patterns + staging rails |
