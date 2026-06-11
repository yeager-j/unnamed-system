# Frontend Audit — Full Findings

All 256 confirmed slice-level findings with complete evidence, grouped by severity. Architecture findings live in [REPORT.md](REPORT.md#architecture--dx). **⚠ unverified** = skipped machine verification (conventions/perf/debt); check the quoted evidence before acting.

## P0 (13)

### `apps/web/app/c/[shortId]/opengraph-image.tsx:48-65`
**OG image renders draft characters' names and portraits, defeating the sheet's deliberate draft redaction**  
*correctness · ✓ verified · slice: routes*

The OG route loads the raw row and renders it with no status check: `const character = await loadCharacterRowByShortId(shortId); const element = character?.portraitUrl ? (<img src={character.portraitUrl} .../>) : (<FallbackCard name={character?.name ?? null} />)`. Meanwhile `app/c/[shortId]/page.tsx` (lines 64-68) explicitly establishes the invariant this breaks: `// Drafts never get a real page rendered — give crawlers a neutral title and skip the OG block so a shared WIP URL doesn't leak the draft name. if (character.status === "draft") { return { title: "Character in progress — Unnamed System" } }`. File-convention `opengraph-image.tsx` metadata is injected by Next independently of (and with higher priority than) `generateMetadata`, so a shared draft URL still unfurls with an og:image — and that image shows the draft's name or uploaded portrait. Even ignoring meta injection, `/c/{shortId}/opengraph-image` is directly fetchable by anyone with the URL. The `characters.status` column defaults to "draft" (apps/web/lib/db/schema/character.ts:71), so every WIP character is exposed this way.

**Suggested fix:** In `OpenGraphImage`, treat a draft row the same as an unknown shortId: `const character = await loadCharacterRowByShortId(shortId); const visible = character && character.status !== "draft" ? character : null;` then branch on `visible` for both the portrait and the fallback name. That matches the redaction the page's generateMetadata already performs.

**Verifier:** Evidence is quoted exactly: the OG route loads the raw row via loadCharacterRowByShortId (no status filter — confirmed at load-character.ts:133-143, returns full CharacterRow with status/name/portraitUrl) and renders portrait or FallbackCard(name) with no draft check, while page.tsx:64-68 deliberately redacts drafts from generateMetadata and serves non-owners a DraftInProgressDialog. The OG file's own JSDoc confirms Next injects og:image independently of generateMetadata, so a shared draft URL still unfurls with an image showing the draft's real name/portrait, and /c/{shortId}/opengraph-image is directly fetchable. status defaults to "draft" (schema line 71), so every WIP character is exposed — a real leak of a state the codebase elsewhere takes pains to hide, and not a pattern documented in CLAUDE.md. The suggested fix (treat a draft row like an unknown shortId, falling back to the neutral "Character not found" card) mirrors the page's existing redaction and is sensible.

### `apps/web/components/builder/movements/ortus/virtues-control.tsx:67-101`
**Render-time prop adoption can clobber the local virtue draft mid-burst; next click composes the full 4-virtue payload from the clobbered draft, permanently dropping an earlier click (UNN-226 class)**  
*correctness · ✓ verified · slice: builder*

```ts
const [draft, setDraft] = useState<VirtueAllocation>(allocation)
const [previousAllocation, setPreviousAllocation] = useState(allocation)
if (allocation !== previousAllocation) {
  setPreviousAllocation(allocation)
  setDraft(allocation)
}
...
function setRank(key: VirtueKey, rank: 0 | 1 | 2) {
  if (draft[key] === rank) return
  applyAllocation({ ...draft, [key]: rank })
}
```

The designed interaction is exactly a three-click burst (+2, then +1, then +1). Each `applyAllocation` POSTs the FULL four-field allocation built from local `draft`. Every successful write calls `revalidateCharacter`, which re-renders the builder layout; when click 1's revalidated RSC payload lands between clicks (one server roundtrip, ~100-600ms — the same cadence as the clicks), the four virtue props change → `allocation` gets a new identity → the adoption block resets `draft` to click-1 state, silently discarding click 2 from the draft. Click 3 then composes `{...draft}` from that clobbered state and writes a full payload that omits click 2's rank; because the payload is the whole object and the dispatch pipeline silently retries it at the fresh version, click 3's write wins over click 2's already-committed write. Net: the player's middle +1 is reverted server-side. The comment on lines 58-66 explains why `useOptimistic` was avoided for exactly this drop-the-intermediate-intent failure, but the adoption-on-prop-echo reintroduces the same hole through a different window. CLAUDE.md's "Owner-mode writes" rule names this exact class: multiple controls (the four virtue rows) composing the full post-state client-side instead of per-field server merges.

**Suggested fix:** Follow the documented combat-state.ts pattern: expose a per-field action (`setVirtueRankAction(characterId, virtueKey, rank, expectedVersion)`) and let the server read the row and merge, so each click carries only its own delta and a prop echo can no longer drop a sibling click from the payload. The UI's cap-gating can keep using the local draft for disabled states.

**Verifier:** Evidence is accurately quoted and the mechanism holds end-to-end. The builder layout is revalidated by setCharacterVirtuesAction (revalidatePath('/builder/{shortId}','layout') since status==='draft'), which re-runs getBuilderCharacter and flows a fresh BuilderCharacter into BuilderDraftContext; when click 1's revalidated snapshot (e.g. {E:2,Em:0,W:0,F:0}) lands between clicks, the render-time adoption block (allocation !== previousAllocation) calls setDraft and snaps the local draft backward, discarding click 2's Em:1. Click 3 then composes {...draft} from the clobbered state and POSTs the full 4-field object at the now-current version (versionRef tracks each success), so the version guard does NOT catch it — it's a sequential self-overwrite, not a third-party stale write — and the schema accepts intermediate allocations (twos<=1 && ones<=2), so the write lands and permanently reverts the middle +1. This is not an accepted pattern: it directly violates CLAUDE.md's documented 'Owner-mode writes that touch one of several fields on a shared column' rule (the UNN-226 class), and the suggested per-field server-merge fix mirrors the prescribed combat-state.ts remedy.

### `apps/web/components/campaign/create-encounter-button.tsx:36-55, 65-98`
**Same React 19 form auto-reset on failure — name and notes cleared while the dialog stays open**  
*correctness · ✓ verified · slice: enemies-campaign*

Identical shape to create-campaign-button: `<form action={onSubmit}>` with uncontrolled `<Input name="name" ...>` and `<Textarea name="notes" maxLength={2000} ...>`; the failure branch (`toast.error("Couldn't create the encounter. Check the name and try again.")`) returns without throwing, so React 19's automatic post-action form reset clears both fields after the transition settles. A failed create leaves the dialog open with the error toast and an empty form — up to 2000 chars of private DM notes retyped from scratch, which makes this the worse instance of the pair.

**Suggested fix:** Same as the campaign dialog: prevent the auto-reset (controlled inputs, or onSubmit + preventDefault with manual FormData) so a failed create keeps the typed name and notes.

**Verifier:** Verified against the cited file: React 19.2.4 + `<form action={onSubmit}>` (line 65) with uncontrolled native `<Input name="name">` (77-84) and `<Textarea name="notes" maxLength={2000}>` (91-97); the Base UI Input and raw textarea primitives carry no value/defaultValue, so React's post-action uncontrolled-form reset applies. The failure branch (46-51) toasts and returns without throwing and leaves the dialog open (setOpen(false) only on success, line 52), so the reset clears both name and up to 2000 chars of DM notes while the user is staring at the error — and since onSubmit returns undefined synchronously, React fires the reset regardless of the inner transition's result. No accepted pattern in CLAUDE.md sanctions clearing inputs on a failed submit, and the suggested fix (controlled inputs or preventDefault + manual FormData) is the standard React 19 mitigation. The notes textarea makes this the worse instance of the documented pair, exactly as claimed.

### `apps/web/components/character-sheet/combat-state/ailment-editor.tsx:66-155`
**Ailment editor composes the full post-state array from optimistic state (UNN-226 class) — concurrent same-field writes are silently clobbered**  
*correctness, conventions · ✓ verified · slice: cs-state*

Every sub-control in OwnerAilmentEditor builds the complete ailments array client-side from the optimistic value and POSTs it whole: `function dispatch(next: string[]) { write({ edit: { kind: "ailments", ailments: next }, ... action: (expectedVersion) => setAilmentsAction({ characterId, ailments: next, expectedVersion }) }) }`, with the Downed toggle calling `dispatch(withDownedToggled(optimisticAilments, next))` and each row calling `dispatch(withNonDownedSelection(optimisticAilments, ...))`. Downed and the non-Downed selection are two independently-controlled sub-fields (the file's own helpers `withDownedToggled`/`withNonDownedSelection` encode exactly that), yet the write is "client builds the full object" — the shape CLAUDE.md's "Owner-mode writes" rule forbids, and the only combat-state control still using it (FlagRow/BattleConditionAxis/ExhaustionStepper all send per-field intent). The in-tab race is blocked by the shared `pending` disabling all rows, but the cross-tab/cross-device race is live and SILENT: (1) with realtime configured, an invalidation ping forwards the version refs immediately (`mergePingedVersions` in apps/web/hooks/character-version-sync.ts sets `ref.current = version` before `router.refresh()` delivers the new character data), so a click in the ping→refresh window composes the array from the stale base but dispatches with a fresh version token — the write succeeds first-try with no stale signal and overwrites the other tab's ailment; (2) without realtime, `dispatchCharacterWriteWithRetry` handles the resulting "stale" by refetching only the VERSION and re-sending the identical stale-composed payload, converting the optimistic-concurrency conflict into last-write-wins on the array. Either way the other client's ailment change (e.g. it set ["poisoned"], this tab toggles Downed → final state ["downed"]) is dropped with no error, no toast, and an optimistic UI that briefly lies. Multi-tab is an explicitly supported scenario here (UNN-203 BroadcastChannel + UNN-372 Ably exist for it).

**Suggested fix:** Split the write into per-sub-field intent actions merged server-side, mirroring setBattleConditionFlagAction: e.g. setDownedAction({ characterId, downed, expectedVersion }) and setActiveAilmentAction({ characterId, ailmentKey: string | null, expectedVersion }) — the server reads the row's current ailments and applies withDownedToggled/withNonDownedSelection there. "Clear ailments" can remain a whole-field wipe (it is genuinely whole-field intent).

**Verifier:** Verified end to end. The cited code is quoted accurately: OwnerAilmentEditor's `dispatch` composes the full ailments array from `optimisticAilments` client-side and POSTs it whole via `setAilmentsAction`, while Downed and the non-Downed single-select are two independently-controlled sub-fields writing the same jsonb column — the exact "client builds the full object on a shared column" shape CLAUDE.md's Owner-mode-writes rule forbids and names the UNN-226 cautionary tale. This is not an accepted pattern but the inverse of one: the sibling battle-condition controls already use per-field merge actions (`applySetBattleConditionAxis/Flag` call `readBattleConditions` then `{...current,[field]:...}`), and the schema file documents that pattern as deliberately avoiding "the client building the full object from possibly-stale optimistic state"; `applySetAilmentsForCharacter` writes `{ ailments }` verbatim with no server read/merge. Both silent-clobber mechanisms hold: `mergePingedVersions` forwards the version ref before `router.refresh()` lands fresh data (its own docstring says a save in that window "succeeds first-try"), so a click composes from the stale array but dispatches a fresh token → no stale signal, the other tab's ailment is overwritten with no toast; without realtime, `dispatchCharacterWriteWithRetry` refetches only the version and re-sends the identical stale-composed payload → last-write-wins. The `pending` guard only blocks in-tab races; cross-tab/cross-device is explicitly supported (UNN-203/UNN-372) and unprotected, and the suggested per-sub-field-action fix mirrors the existing battle-condition pattern exactly.

### `apps/web/components/character-sheet/level-up-dialog.tsx:139-148`
**"Spend them on the Archetypes tab" link cannot switch the tab — sheet tabs are client state, not routing**  
*correctness, perf, debt · ✓ verified · slice: cs-root*

The dialog renders `<Link href="?tab=archetypes" ... onClick={() => onOpenChange(false)}>Spend them on the Archetypes tab</Link>`. But the active sheet tab is in-memory client state: `SheetNavProvider` (components/character-sheet/sheet-nav-context.tsx:31) holds it as `useState<SheetTabKey>(defaultTab)` and is rendered un-keyed by app/c/[shortId]/page.tsx:117 (`<SheetNavProvider defaultTab={resolveTab(tab)}>`). A search-param-only soft navigation re-renders the page RSC with the new `defaultTab`, but React preserves the provider's `useState`, so `activeTab` never changes — `defaultTab` is only read on mount. The provider's own JSDoc states the constraint this Link violates: "The four tabs are in-memory client state — not routing — so a navigation command can't `router.push(?tab=)` to switch them; it calls setActiveTab here instead" (sheet-nav-context.tsx:12-14), and the command-palette registry correctly uses `ctx.setActiveTab(tab)` (lib/commands/navigation.ts:45). Net effect: after leveling up, clicking the CTA closes the dialog, scrolls to top, and rewrites the URL to `?tab=archetypes` while the Combat tab stays visible — the link silently no-ops AND leaves the URL disagreeing with the rendered tab (useTabUrlSync won't correct it because `activeTab` didn't change, so its effect doesn't re-run). Note the superficially similar link in archetypes/atlas/lineage-atlas.tsx:76 is fine — it navigates from a different route, so the sheet mounts fresh and `defaultTab` applies; only this in-page link hits the bug.

**Suggested fix:** Replace the `Link` with a button (or keep the anchor but intercept) that calls `useSheetNav().setActiveTab("archetypes")` plus `onOpenChange(false)` — the dialog is rendered inside `SheetNavProvider` (SheetHeader → HeaderOwnerActions → LevelUpDialog), so the context is available; `useTabUrlSync` will then mirror the URL automatically. Alternatively key `SheetNavProvider` by the resolved tab in page.tsx, but that re-creates all tab state on every ?tab= navigation — the setActiveTab route matches the existing command-palette pattern.

**Verifier:** All cited facts check out exactly: the Link uses `href="?tab=archetypes"` (level-up-dialog.tsx:140), the active tab is `useState(defaultTab)` (sheet-nav-context.tsx:31) rendered un-keyed at page.tsx:117, so a `?tab=` soft navigation re-runs the RSC with a new `defaultTab` prop but React preserves the existing state and `activeTab` never changes — `defaultTab` is mount-only. The provider's own JSDoc (lines 12-15) names this exact anti-pattern ("a navigation command can't router.push(?tab=) to switch them") and the command palette correctly uses `ctx.setActiveTab` (navigation.ts:45); the dialog is rendered inside the provider (page.tsx:117 → SheetHeader → HeaderOwnerActions → LevelUpDialog) so the suggested `useSheetNav().setActiveTab` fix is available and idiomatic. The atlas link (lineage-atlas.tsx:75) is genuinely a full cross-route navigation that remounts the sheet, so the finder's "only the in-page link is broken" distinction holds. Net effect is a user-visible no-op: the CTA closes the dialog and rewrites the URL while the Combat tab stays visible, and useTabUrlSync won't correct it because activeTab didn't change.

### `apps/web/components/combat/combatant-vitals-section.tsx:196-226`
**Enemy HP/Max writes compose an absolute post-state from the optimistic session — the documented UNN-226 stale-closure class**  
*correctness · ✓ verified · slice: combat-root*

`onDecrement={(amount) => onAdjust(id, "currentHP", hp.current - amount)}` / `onIncrement={(amount) => onAdjust(id, "currentHP", Math.min(hp.max, hp.current + amount))}` (lines 202-206), and for max HP `onAdjust(id, "maxHP", Math.max(0, hp.max - amount))` / `onAdjust(id, "maxHP", hp.max + amount)` (lines 221-224). `hp` comes from `detail`, which combat-console.tsx:85-93 derives from the `useOptimistic` session (`combatantDetail(session, …)`), and the `adjustEnemyVitals` event "sets one field … to an absolute value" (engine reduce/enemy-vitals.ts). So the absolute wire value is baked from an unconfirmed optimistic frame at click time. Two concrete corruption paths: (1) write A (damage) is in flight when the DM submits write B (heal) — B's absolute embeds A's optimistic effect; if A then fails (network drop, or A loses the commit race and is rejected `stale`), B persists damage the server never accepted, and the optimistic UI reconciles to it, so the failure toast lies. (2) The documented two-DM-tab scenario (use-combat-console.ts JSDoc: "a second DM tab's event"): the ping handler bumps the guard token *before* the refreshed session lands (use-combat-console.ts:99-101 `versionRef.current = ping.version` then `scheduleRefresh()`), so tab B's heal — computed from tab B's pre-refresh `hp.current` — passes the version guard and silently erases tab A's just-persisted damage. The sibling section in the same drawer states the rule this violates: combatant-counters-section.tsx:33-35 "Stepper buttons send a **delta** (±1), never an absolute, so back-to-back taps merge on the server instead of overwriting (the UNN-226 lesson)", matching CLAUDE.md's "Owner-mode writes" convention. The exposure window is narrower than UNN-226's toggles (the AdjustPoolPopover closes per submit), but the ping-window in path (2) lasts until the router.refresh round-trip completes, and the controls are explicitly never disabled (`disabled={false}` at lines 201 and 220), so overlapping writes are easy to issue.

**Suggested fix:** Make the wire payload a delta, not an absolute: extend the event vocabulary with delta semantics (e.g. `adjustEnemyVitals { combatantId, field, delta }` or `damageEnemy`/`healEnemy`), clamp in the reducer against the *server's* fresh row (it already floors at 0; add the max-clamp there too), and keep the same event for the optimistic mirror. Alternatively keep absolutes but compute them server-side from `(field, delta)` inputs. Until then, at minimum wire `isPending` into these popovers instead of `disabled={false}`.

**Verifier:** Confirmed against code: combat-vitals-section.tsx (lines 202-206, 221-224) computes an absolute wire value from `hp.current`/`hp.max` read off `detail`, which combat-console.tsx:85-93 derives via `combatantDetail(session,...)` from the `useOptimistic` session; the engine reducer (enemy-vitals.ts:30-69 / session-event.ts:238-243) sets that absolute, never merging a delta against the freshly-loaded server row. The codebase itself documents this exact class as forbidden — the sibling `adjustCounter` is explicitly "Delta, not an absolute ... so the reducer merges against the loaded session" citing "the UNN-226 lesson" (session-event.ts:165-168, combatant-counters-section.tsx:33-35), matching CLAUDE.md's owner-mode-write convention — so `adjustEnemyVitals` is the deviation, not an accepted pattern, and the suggested delta-with-server-clamp fix mirrors the existing counters reducer. The two-DM-tab path is a clean lost update: the ping handler bumps `versionRef.current` to the new version *before* `router.refresh()` lands the fresh session (use-combat-console.ts:100-102), so tab B's heal — an absolute baked from its stale pre-refresh `hp.current` — passes the version guard and silently erases tab A's just-persisted damage while the optimistic UI lies.

### `apps/web/components/combat/use-combat-console.ts:97-103`
**Forwarding versionRef from a realtime ping before the refresh lands defeats the version guard for absolute-payload events — silent lost update (UNN-226 class)**  
*correctness · ✓ verified · slice: combat-root*

`onPing: (data) => { ... if (ping.version <= versionRef.current) return; versionRef.current = ping.version; scheduleRefresh() }` bumps the write token to the remote writer's version immediately, but the new session only arrives when the scheduled `router.refresh()` round-trip completes (typically 100-500ms later). In that window the console still renders the stale session, and several controls compose absolute payloads from rendered state: combatant-vitals-section.tsx:202-208 `onDecrement={(amount) => onAdjust(id, "currentHP", hp.current - amount)}` (adjustEnemyVitals is an absolute set — see packages/game engine reduce/enemy-vitals.ts) and engagement-control.tsx:42-51 `toggle()` which rebuilds the full `targetCombatantIds` list from the rendered `targets`. A DM tap in the window POSTs `expectedVersion = <pinged fresh version>`, so the server guard passes and the stale-derived absolute overwrites the remote write with no rejection, no toast — e.g. tab B sets the ogre to 5 HP, tab A's ping bumps its token, tab A taps "-3" off the still-rendered 12 and persists 9, silently undoing tab B. Multi-writer is an explicitly supported scenario (this hook's own JSDoc: "another writer's change (a player's self-heal, a second DM tab's event) refreshes the page"). The version guard exists precisely to catch this, and the eager ref-forwarding switches it off for the ping-to-refresh window.

**Suggested fix:** Don't write the pinged version into the dispatch token directly; keep a separate `lastPingedVersion` for the dedupe/refresh compare and only advance `versionRef` when the refreshed props actually land (the existing prop-sync effect already does that). A dispatch issued against the older token then gets an honest 'stale' rejection (or, with the finding-1 retry, a correct re-reduce against the fresh row). Alternatively, convert adjustEnemyVitals/engagement to delta/add-remove events so stale-frame composition can't clobber a concurrent absolute.

**Verifier:** Verified end-to-end. use-combat-console.ts:100-101 eagerly writes the remote writer's ping version into versionRef (the dispatch token at line 127's expectedVersion) before the scheduled queueMicrotask→router.refresh() round-trip lands, so the console keeps rendering the stale session in that window. Two live-console controls then compose absolute payloads from that stale frame: combatant-vitals-section.tsx:203 `onAdjust(id,"currentHP", hp.current - amount)` (adjustEnemyVitals is a confirmed absolute set — reduce/enemy-vitals.ts:42 `statBlock.currentHP = value`) and the live engagement path (combatant-engagement-section.tsx:30-39 → engagement-control.tsx:42-51, rebuilding the full targetCombatantIds from rendered targets). saveEncounterSession's guard (writes/encounter.ts:101-105) passes because expectedVersion now equals the bumped DB version, so the stale-derived absolute silently overwrites the concurrent write with no stale error and no toast — the UNN-226 lost-update class CLAUDE.md warns against, in the second-DM-tab scenario this hook's own JSDoc (lines 44-46) calls supported; the suggested split-token fix is sensible.

### `apps/web/components/combat/use-combat-console.ts:121-136`
**Back-to-back dispatches within one round-trip both carry the same version token — the second is always rejected "stale", reverts, and shows a misleading toast**  
*correctness · ✓ verified · slice: combat-root*

`function dispatch(event) { startTransition(async () => { applyOptimistic(event); const result = await applyCombatEvent({ encounterId: encounter.id, expectedVersion: versionRef.current, event }) … versionRef.current = result.value.version` — `versionRef.current` is captured synchronously at click time and only bumped after the previous response returns. The server guard is a strict compare-and-bump (lib/db/writes/encounter.ts `bumpEncounterVersionGuarded`: `WHERE version = expectedVersion`, else `err("stale")`). So any second event dispatched before the first response (one network round-trip, ~150-500ms) is guaranteed rejected: its optimistic edit appears, then reverts, with the toast "This encounter changed elsewhere. Reload and try again." — wrong on both counts (it was the DM's own tap, and no reload is needed). The hook's own JSDoc claims this is solved ("A rapid follow-up tap … reads the freshly-bumped token synchronously from `versionRef.current` … so the second event isn't spuriously rejected as `stale`") but that only covers taps issued *after* the first response. Natural repros, because none of the drawer controls receive `isPending` (CombatantDrawer passes only `detail`/`onCombatEvent`/`pcVitalsVersions`): ticking two ailments in the conditions popover (it stays open between toggles), tapping a counter's +1 twice (combatant-counters-section.tsx even promises back-to-back taps "merge on the server"), toggling two action-economy chips. The identical pattern is in use-encounter-setup.ts:46-61, whose JSDoc likewise touts "add a combatant, then immediately place or engage it" — yet ImportPcsPanel buttons, ZonesPanel, and CombatantSetupRow are rendered without their `disabled` prop (encounter-setup.tsx:180-247), so two quick setup edits hit the same guaranteed rejection.

**Suggested fix:** Serialize dispatches against the token: keep a promise chain (or queue) in the hook so each `applyCombatEvent` call reads `versionRef.current` after the prior write settles (events are already order-independent intents reduced server-side), or have the server action retry the guarded save once with the row version it just read. Alternatively disable the drawer/setup controls on `isPending` — coarser, but at least honest.

**Verifier:** Confirmed against the code: `dispatch` reads `versionRef.current` inside the `startTransition` async body and only bumps it at line 133 after `applyCombatEvent` resolves, while the server guard (`bumpEncounterVersionGuarded`, `WHERE version = expectedVersion`, else `err("stale")`) is a strict compare-and-bump. React 19.2's bare `useTransition`+`useOptimistic` (not `useActionState`) does NOT serialize async callbacks, so two overlapping dispatches both read the same token N before either response returns — the second is guaranteed `stale` and fires the false "This encounter changed elsewhere. Reload and try again." toast. The repro paths are real: `CombatantDrawer` is passed only `detail`/`onClose`/`onCombatEvent`/`pcVitalsVersions` (no `isPending`), the counters/conditions sections take only `detail`+`onCombatEvent` (no gating), the counters JSDoc even promises back-to-back delta taps "merge on the server," and in encounter-setup.tsx the ImportPcsPanel/ZonesPanel/CombatantSetupRow controls receive no `disabled`/`isPending` (only Start is gated). This is not an accepted CLAUDE.md pattern, and the suggested fixes (serialize dispatches so each reads the settled version, single server retry, or gate on isPending) are sensible.

### `apps/web/components/my-characters/create-character-button.tsx:26-35`
**Rejected server-action promise bypasses the component's own retry toast (no rejection handling in the transition)**  
*correctness · ✓ verified · slice: small-surfaces*

```
startTransition(async () => {
  const result = await startCharacterDraftAction()
  if (!result.ok) {
    toast.error("Couldn't start a new character. Try again.")
    return
  }
  router.push(...)
})
```
The toast exists precisely for transient failure ("Try again"), but it only fires when the action *resolves* with a not-ok Result. The most common transient failure — the POST to the action failing (offline, flaky network, deploy in progress) — rejects the promise instead, and there is no try/catch, so the error escapes the async transition and surfaces through React 19's uncaught-transition-error path (the route error boundary) rather than the in-place retryable toast. The same unguarded `await <action>` shape appears in both delete-dialog handlers (covered separately).

**Suggested fix:** Wrap the awaited action in try/catch inside the transition and route the catch to the same `toast.error("Couldn't start a new character. Try again.")` path, keeping the user on the page with the button re-enabled.

**Verifier:** Evidence is quoted verbatim (lines 26-35). The action's signature is `Result<{shortId}, never>` — its success path is always `ok: true`, so the `if (!result.ok)` toast.error branch is unreachable on a *resolved* promise; the real transient failures (`unauthorized()` throwing on expired session, or the `db.insert` in `startCharacterDraft` failing on network/DB error) *reject* the promise. With no try/catch and — confirmed by find — no `error.tsx`/`global-error.tsx` anywhere in apps/web, the rejection escapes the async transition to React 19's uncaught-transition-error path, never the in-place "Try again" toast the component (and its JSDoc) is built around. CLAUDE.md documents no pattern exempting unguarded transition awaits, and peer handlers are inconsistent (create-campaign-button repeats the bug; join-link-card has a catch), so this is not an accepted convention.

### `apps/web/components/shared/adjust-pool-controls.tsx:71-90`
**Enter key in AdjustPoolForm silently fires the destructive (decrement) action, contradicting the visual primary button**  
*correctness, debt · ✓ verified · slice: primitives*

onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(onDecrement) } }} — Enter in the autofocused amount input always invokes the decrement handler. Every caller binds decrement to the harmful direction: header-owner-actions.tsx and combatant-vitals-section.tsx pass decrementLabel="Take damage" / "Spend SP", and currency-control.tsx passes decrementLabel="Spend" (wallet). Meanwhile the button grid renders decrement as variant="destructive" on the left and increment as the default/primary-styled Button on the right — so the visually primary action is increment, but the keyboard default is the destructive one. A user who opens "Adjust HP" to heal, types 5, and presses Enter takes 5 damage instead; in the wallet, Enter spends currency instead of adding. Nothing in the UI or the component JSDoc indicates Enter is bound to decrement, and the same binding was inherited by the currency form where "Enter = Spend" is hard to justify as intentional.

**Suggested fix:** Either remove the Enter binding entirely (require an explicit button click for a two-direction form), or make the Enter-bound action match the visually primary button (e.g. wrap in a <form> whose type="submit" button is the one Enter triggers and style it as the default). If Enter→damage is a deliberate combat-speed choice, gate it behind an explicit prop (e.g. enterAction="decrement") so the currency caller can opt out, and document it.

**Verifier:** Verified the cited lines verbatim: the autofocused amount Input's onKeyDown binds Enter to submit(onDecrement), while the button grid renders decrement as variant="destructive" (left) and increment as the default/primary-styled Button (right, no variant). All four call sites confirm onDecrement is always the harmful/cost direction — "Take damage"/"Spend SP" (header-owner-actions, combatant-vitals-section), "Spend" (currency-control), "Lower max" — so Enter, the natural reflex after typing into an autoFocus input, always fires the destructive action against the visually primary increment button. Nothing in CLAUDE.md sanctions this and the component JSDoc is silent about Enter binding, so it is not an accepted pattern. The suggested fixes (match Enter to the primary button, or gate direction behind an explicit prop) are sound.

### `apps/web/hooks/use-character.tsx:255-270`
**Click-write transitions don't catch thrown action errors — a network failure bypasses the toast path and propagates to the error boundary**  
*correctness · ✓ verified · slice: hooks-lib*

`useCharacterWrite`'s `write` runs `startTransition(async () => { if (edit) applyEdit(edit); const result = await dispatchCharacterWriteWithRetry({...}); ... toast.error(...) })` with no try/catch. `dispatchCharacterWriteWithRetry` (hooks/dispatch-character-write.ts:59, 69, 73) awaits the Server Action and `getCharacterVersionsAction` bare — a Server Action invocation *rejects* (rather than returning `Result.err`) on network drop, server crash, deploy-version skew ("Failed to find Server Action"), or an auth interrupt. In React 19, an error thrown in an async transition propagates to the nearest error boundary — so clicking "Take damage" while briefly offline replaces the sheet with the error fallback (or surfaces an unhandled rejection) instead of the designed "Couldn't save. Try again." toast. The sibling debounced path explicitly guards exactly this: use-debounced-auto-save.ts:193-202 catches with the comment "`save` threw (network drop, server crash, auth interrupt)... Roll back, surface a generic toast" — proving the throw case is a known, expected failure mode that the click path simply doesn't handle. The same gap exists verbatim in `useBuilderWrite` (hooks/use-builder-draft.tsx:201-219) and `useOwnCombatEvent.dispatch` (hooks/use-own-combat-event.ts:39-53).

**Suggested fix:** Wrap the awaited dispatch in try/catch inside each transition callback (use-character.tsx, use-builder-draft.tsx, use-own-combat-event.ts), routing a throw to the same generic-error toast the `Result.err` branch uses — mirroring useDebouncedAutoSave's catch. Alternatively centralize it: have `dispatchCharacterWriteWithRetry` catch throws and return a synthetic `Result.err`, so all three callers inherit the fix (useOwnCombatEvent doesn't go through that pipeline and still needs its own catch).

**Verifier:** Verified all three cited call sites: each awaits a Server Action bare inside startTransition(async()=>{}) with no try/catch, and dispatchCharacterWriteWithRetry awaits action()/getCharacterVersionsAction() bare (lines 59/69/73). Transport-level failures (network drop, deploy version skew, auth interrupt) reject the action invocation rather than returning Result.err — the sibling use-debounced-auto-save.ts:193-202 catches exactly this with a comment stating "expected failures should return Result.err, not throw," proving the throw case is a known, distinct failure mode the click path omits. I confirmed the app has no error.tsx/global-error.tsx and no unhandledrejection handler, so in React 19/Next App Router the throw propagates to Next's default error boundary, replacing the sheet/builder with an error UI instead of the designed toast. The fix (per-callback catch mirroring the debounced path, or centralizing in the dispatch helper with useOwnCombatEvent still needing its own since it bypasses that pipeline) is sensible.

### `apps/web/hooks/use-debounced-auto-save.ts:179-202`
**Failure rollback unconditionally clobbers the current draft, wiping keystrokes typed after the failed save dispatched and desyncing input from server**  
*correctness · ✓ verified · slice: hooks-lib*

```ts
        if (result.ok) {
          lastSavedRef.current = result.value.value
          return
        }
        setLocalValue(lastSavedRef.current)
```

(and the same `setLocalValue(lastSavedRef.current)` in the catch block, line 200). The rollback never checks that the draft still equals the `next` value whose save failed. Sequence: user types "A" → debounce fires, save(A) dispatched (or queued behind an in-flight sibling save — the shared per-class queue makes this window longer than one round-trip); user keeps typing, draft = "AB" with a new debounce armed; save(A) fails → `setLocalValue(lastSavedRef.current)` snaps the focused input back to the pre-"A" value, visibly deleting "AB" mid-typing. The armed debounce then fires `performSave("AB")` — which can succeed and set `lastSavedRef = "AB"`, but the success path never restores the draft, so the input shows the old value while the server holds "AB" (prop-sync is suppressed while focused). Worse, with the default `isEmpty: () => false`, a subsequent blur flushes the rollback-injected stale value, overwriting the user's persisted "AB".

**Suggested fix:** Roll back only when the draft hasn't moved past the failed value: capture `next` and use a functional update, e.g. `setLocalValue((current) => (isEqual(current, next) ? lastSavedRef.current : current))` — or compare against a `latestDraftRef` before reverting. Keep the toast either way.

**Verifier:** Verified against the code: both rollbacks (lines 184 and 200) call setLocalValue(lastSavedRef.current) with no guard that the live draft still equals the failed `next`, while the hook explicitly supports typing past an in-flight/queued save (the chained queueRef at line 168 and the "type B mid-flight" test). The success branch (line 180) only updates lastSavedRef and never restores the draft, and prop-sync is suppressed while focused (line 256; markdown editor line 124), so after a mid-type failure the input shows the stale rolled-back value while the server holds the newer text. Escalation is real: with the default isEmpty:()=>false used by EditableDetailField and MarkdownField, flush() on blur (lines 227-233) skips the revert branch and persists the stale rolled-back draft via performSave(value), silently overwriting the user's newer persisted text — a genuine lost update not endorsed by any CLAUDE.md pattern, and the suggested functional-update/latestDraftRef guard is the right fix.

### `apps/web/hooks/use-encounter-snapshot.ts:86-99, 114-137`
**Snapshot fetch responses applied without a version guard — out-of-order responses regress the watch view (indefinitely in realtime mode)**  
*correctness · ✓ verified · slice: hooks-lib*

The ping side compares versions before fetching (line 107: `if (version === undefined || version <= versionRef.current) return`), but both apply sides are unconditional. `refetch()` (lines 89-94): `.then((next) => { if (unmountedRef.current) return; versionRef.current = next.version; setSnapshot(next); setStale(false) })` — and the poll tick (lines 121-126) is identical. There is no `next.version <= versionRef.current` check and no AbortController, so two concurrent fetches whose responses land out of order regress both the rendered snapshot and `versionRef` to the older state. Concretely: two DM writes in quick succession publish pings v5 then v6; ping v6 arrives while the v5-triggered refetch is still in flight (versionRef is still v4, so 6 > 4 triggers a second refetch); if the v6 response lands first, the late v5 response then overwrites it — snapshot and versionRef both regress to v5. The same race exists between `onReconnect: refetch` and a ping refetch, and between overlapping poll ticks when latency exceeds the 1.5s interval (setInterval does not wait for the previous fetch). In polling mode the next tick self-heals in ~1.5s; in realtime mode no poll is running and the next ping only arrives on the next DM write — players watch stale HP/conditions until the DM does something else. Note `versionRef` also regressed, so even a redelivered v6 ping would pass the line-107 guard only because 6 > 5 — but Ably delivers each ping once, so in practice nothing re-triggers.

**Suggested fix:** Add the apply-side mirror of the line-107 guard in both `.then` branches: `if (next.version < versionRef.current) return` (or `<=` plus still clearing `stale`) before `versionRef.current = next.version; setSnapshot(next)`. Versions are monotonic server-side, so dropping older-or-equal responses is always safe. An AbortController keyed to the effect would also close it but the one-line compare is sufficient and matches the existing ping-side idiom.

**Verifier:** The cited code matches verbatim: the ping side guards (line 107 `version <= versionRef.current`) but both apply sites — refetch().then (89-94) and the poll tick (121-126) — write setSnapshot/versionRef unconditionally, with no apply-side version compare and no AbortController. Versions are confirmed server-side monotonic optimistic tokens (player-snapshot.ts:104-109, version-guard increments by one), so the out-of-order-response race is real: two rapid pings (v5, v6) each pass the line-107 guard while versionRef is still stale and fire concurrent refetches, and whichever promise resolves last wins, regressing both snapshot and versionRef to the older value. In realtime mode no poll is running to self-heal and Ably delivers each ping once, so the watch view shows regressed HP/conditions/turn order until the next DM write — a user-visible regression. The suggested fix (mirror the line-107 guard on the apply side) is safe under monotonicity and matches the existing idiom; this is the read-side analogue of the exact stale-overwrite class CLAUDE.md flags as a real bug, not an accepted pattern.

## P1 (47)

### `apps/web/app/builder/[shortId]/[step]/page.tsx:1-83`
**Builder route has no document title in any segment (WCAG 2.4.2 Page Titled, Level A)**  
*a11y · ✓ verified · slice: routes*

Neither this step page, nor app/builder/[shortId]/page.tsx, nor app/builder/[shortId]/layout.tsx exports `metadata`/`generateMetadata`, and the root app/layout.tsx exports no default `metadata` either — it only exports `RootLayout`. Every other route in the app sets a title (`export const metadata: Metadata = { title: "My Characters — Unnamed System" }` in app/page.tsx, `generateMetadata` in c/[shortId], campaigns, combat, join, atlas), so there is no fallback for the builder: `/builder/{shortId}/{step}` ships with no `<title>` element at all. Untitled documents fail WCAG 2.4.2 — screen-reader users identify and switch between tabs by title, and the builder is a 4-movement flow where the title is the cheapest orientation cue (which movement am I on?).

**Suggested fix:** Add `generateMetadata` to app/builder/[shortId]/[step]/page.tsx that titles the page from the validated step (e.g. `"Corpus — Character Builder — Unnamed System"`, reusing the step labels in components/builder/builder-steps), and add a default `metadata` title to app/layout.tsx so no future route can ship untitled.

**Verifier:** Verified directly: no `metadata`/`generateMetadata`/`<title>` exists anywhere in the `/builder` route tree (step page, entry page, or layout), and the root `app/layout.tsx` exports only `RootLayout` with no default `metadata` and renders `<html>` with no `<head>`/`<title>`, so there is no fallback — the builder ships with no document title. The evidence is accurately quoted and every other route family (home, c/[shortId], campaigns, combat, join, atlas) sets a title via the grep, making this a deviation from the project's own pattern, not an accepted convention (CLAUDE.md grants no exemption). The suggested fix is feasible: `BUILDER_STEPS` already carries per-step `label`s ("Corpus"/"Ortus"/"Animus"/"Persona") to title `generateMetadata` from the validated step, plus a root default to backstop future routes. This is a genuine WCAG 2.4.2 Page Titled (Level A) failure on the app's core character-creation flow.

### `apps/web/app/combat/[shortId]/page.tsx:94-110`
**Live combat console serializes every PC's full HydratedCharacter to the client via object spread, despite PcCombatantDetail being a lean Pick**  
*perf · ⚠ unverified · slice: routes*

```ts
const hydrated = await Promise.all(pcCharacterIds.map((id) => loadHydratedCharacterById(id))); const pcDetailById: Record<string, PcCombatantDetail> = Object.fromEntries(hydrated.filter((c) => c !== null).map((c) => [c.id, { ...c, className: ... }]))
```

`PcCombatantDetail` (packages/game/src/engine/encounter/roster-view.ts:54-75) is a compile-time `Pick<HydratedCharacter, 'id' | 'name' | ... | 'vitalsVersion'>` of ~14 fields, and its JSDoc explicitly promises "The client payload still skips the skills/inventory/child rows the console never renders." But `Pick` strips nothing at runtime: the `{ ...c }` spread ships the ENTIRE HydratedCharacter — `backstoryText`, `notes` (free-form markdown), `archetypeRows`, `knives`, `chains`, `talents`, full `inventory`, and `skills` with per-skill resolved attack rolls (foundation/character/hydrated-character.ts:97-134) — for every PC combatant, as a prop of the `"use client"` CombatConsole, so it all lands in the RSC serialization payload. This is the app's hottest surface: `use-combat-console.ts` calls `router.refresh()` after every applied combat event, on every realtime ping, and on reconnect (lines 90, 104, 134, 155), so the full sheets of all PCs are re-fetched and re-serialized over the wire on every single combat action.

**Suggested fix:** Construct the lean object explicitly instead of spreading: map each hydrated character to exactly the PcCombatantDetail fields ({ id: c.id, name: c.name, pronouns: c.pronouns, portraitUrl: c.portraitUrl, level: c.level, currentHP/maxHP/currentSP/maxSP, attributes, affinityChart, activeArchetypeKey, vitalsVersion, className }). TypeScript already guarantees no consumer reads beyond the Pick, so this is a safe drop-in; consider a small `toPcCombatantDetail(c, className)` helper next to the type so the contract is enforced at one boundary.

### `apps/web/components/builder/builder-shell.tsx:193-212`
**ContinueLink bypasses the versionRef pipeline and treats "stale" as success — the builderStep write is silently dropped exactly when the player edited anything just before clicking Continue**  
*correctness · ✓ verified · slice: builder*

```ts
const { id: characterId, identityVersion } = useBuilderDraft()
...
const result = await setBuilderStepAction({
  characterId,
  step: nextIndex,
  expectedVersion: identityVersion,
})
if (!result.ok && result.error !== "stale") {
  toast.error("Couldn't advance. Try again.")
  return
}
router.push(`/builder/${shortId}/${step.slug}`)
```

`setCharacterBuilderStep` is a version-guarded identity-class write, but the expected version here is the context prop, not the shared `versionRef` every other builder write reads. Any write whose revalidated payload hasn't committed yet (pick an archetype then click Continue; blur an autosaving field then click Continue — the blur-flush save races this very action) makes `identityVersion` stale → the action returns "stale" → the branch deliberately swallows it and navigates, so `builderStep` is never persisted. The component's own JSDoc says this call exists so "a returning player's 'Resume building' card deep-links to the right movement" — that is the behavior that silently breaks. Secondary: on success, `result.value.version` is discarded — `versionRef.current` is not updated and no cross-tab broadcast fires (the provider persists across the navigation at the layout level), so the next movement's first write dispatches at a stale token and burns a silent retry roundtrip until the prop-sync effect catches up.

**Suggested fix:** Route the step write through `useBuilderWrite().write({ surface: ..., action: (expectedVersion) => setBuilderStepAction({...}) })` (navigating in `onSuccess`, or after a one-shot retry resolves). That picks up the in-frame versionRef, the silent stale retry, the success-path ref update, and the cross-tab broadcast for free; "stale" then only surfaces on a real third-party conflict.

**Verifier:** Confirmed against the code: ContinueLink (builder-shell.tsx:193-212) reads identityVersion from useBuilderDraft() — the server-loaded draft prop (BuilderCharacter extends CharacterRow) — while every other identity-class builder write goes through useBuilderWrite/useBuilderAutoSave, which read the shared versionRef that dispatchCharacterWriteWithRetry mutates in-place on each success (dispatch-character-write.ts:60-66). setCharacterBuilderStep is a version-guarded identity-class write (writes/identity.ts → bumpCharacterVersionGuarded), so a just-fired identity write (pick archetype, blur an autosaving field) bumps the row past the still-stale draft prop; the action returns "stale", the branch `!result.ok && result.error !== "stale"` deliberately swallows it, and router.push fires anyway — dropping the builderStep write. That field is the resume cursor read by character-card.tsx:43, the /builder/{shortId} redirect, and app/c/[shortId]/page.tsx:108, so the documented "Resume building deep-links to the right movement" behavior silently regresses. No test locks in the swallow-stale behavior, and the suggested fix is the established UNN-274 shared-ref pattern.

### `apps/web/components/builder/builder-shell.tsx:251-290`
**Progress dots: current and unvisited steps are bare <span aria-label> — name not exposed on generic role, so the "Builder progress" list is mostly silent**  
*a11y · ✓ verified · slice: builder*

Current step: `<span aria-current="step" aria-label={label} className="block size-2 rounded-full bg-primary" />`; unvisited: `<span aria-label={label} className="block size-2 rounded-full border ..." />`. `aria-label` is prohibited on `role=generic` (ARIA 1.2) and is unreliably exposed by browsers/AT on a plain span; the spans also have no text content, so in browse mode the `<ol aria-label="Builder progress">` announces list items with nothing in them. A screen-reader user gets the visited steps (those are `<Link aria-label>`, which works) but cannot perceive which movement is current or which remain — the exact information the widget exists to convey.

**Suggested fix:** Put the label in the DOM: `<span aria-current="step" className="..."><span className="sr-only">{label}</span></span>` for current/unvisited dots (or add `role="img"` so the aria-label is honored).

**Verifier:** Evidence is accurately quoted: the current-step dot (lines 260-264) and unvisited dots (283-286) are bare `<span aria-label>` with no text content and no role, giving them the implicit ARIA `generic` role on which `aria-label` is prohibited (ARIA 1.2) and unreliably exposed by AT. With no text children, the `<ol aria-label="Builder progress">` announces empty list items for the current step and every remaining step — the exact "where am I / what's left" information the widget exists to convey — while only the visited steps (which are `<Link aria-label>`, a nameable role) are announced. No CLAUDE.md or docs convention accepts this pattern, and the suggested `sr-only` fix is already idiomatic here (13 existing usages). It's a genuine a11y blocker but narrow and degraded-not-broken (visited steps still announce, and it's a secondary progress indicator), so P1.

### `apps/web/components/builder/movements/corpus/path-bar.tsx:89-93`
**Path radiogroup has no accessible name — the visible "Path" heading is not associated**  
*a11y · ✓ verified · slice: builder*

`<RadioGroup value={optimisticPath} onValueChange={...} className="grid ...">` renders a `role="radiogroup"` with neither `aria-label` nor `aria-labelledby`; the `<h2 ...>Path</h2>` two lines above is unassociated. A screen-reader user tabbing into the three radios hears the radio names ("Health-Focused d12 / d8") but no group context naming what the choice is. The component otherwise does this correctly elsewhere (`virtues-control.tsx` passes `aria-label` to every ButtonGroup).

**Suggested fix:** Give the h2 an id and add `aria-labelledby` to the RadioGroup (or `aria-label="Path"`).

**Verifier:** Verified the quote: path-bar.tsx:89-93 renders the UI RadioGroup with neither aria-label nor aria-labelledby, and the h2 "Path" at line 83 has no id linking it. The UI RadioGroup wrapper is a pass-through to Base UI's RadioGroupPrimitive, which emits role="radiogroup" with no auto-derived accessible name, so the group is genuinely unnamed for assistive tech. This is not an accepted project pattern — the codebase's own convention names these controls (virtues-control.tsx:129 passes aria-label to ButtonGroup; archetype-card.tsx uses aria-label), and CLAUDE.md grants no exemption. The suggested fix (id+aria-labelledby or aria-label="Path") matches that existing convention.

### `apps/web/components/builder/movements/ortus/talents-picker.tsx:148-180`
**Talents combobox input has no accessible name — its visible label is an unassociated <label>, and the placeholder fallback disappears once one talent is picked**  
*a11y · ✓ verified · slice: builder*

`<FieldLabel>Background Talents ({gainedTalents.length}/{MAX_PLAYER_ADDED_TALENTS})</FieldLabel>` renders a bare `<label>` (verified: packages/ui `FieldLabel` → `Label` → plain `<label>` with no auto-wiring) with no `htmlFor` and it does not wrap the control. The typeahead input is `<ComboboxChipsInput placeholder={atCap ? "Remove a Talent..." : values.length === 0 ? "Add a Talent…" : ""} />` — verified to be Base UI `Combobox.Input` with no labeling of its own. So the `role=combobox` input has no accessible name, and once `values.length > 0` (below cap) even the placeholder is the empty string — a screen reader lands on an anonymous editable combobox. Clicking the visible label also focuses nothing.

**Suggested fix:** Give the input an id and point the label at it (`<FieldLabel htmlFor="background-talents">` + `<ComboboxChipsInput id="background-talents" ...>`), or pass `aria-label="Background Talents"` to `ComboboxChipsInput`. Same file: the "From your Origin Archetype" `FieldLabel` (line 132) labels nothing and should be a non-label element.

**Verifier:** Verified against source: FieldLabel → Label is a plain <label> with no htmlFor and it does not wrap the control (talents-picker.tsx:149-152 is a sibling of <Combobox>), and ComboboxChipsInput is Base UI ComboboxPrimitive.Input (combobox.tsx:266-277) that only spreads props with no default aria-label/id. At the call site (lines 168-176) only placeholder is passed, and the ternary collapses it to "" once values.length > 0 below cap, so the role=combobox input has no accessible name for a screen reader and the visible label clicks focus nothing. The finder's placeholder text is paraphrased ("Remove a Talent..." vs the actual "Remove a Talent to pick a different one") but the load-bearing empty-string fallback and structure are accurate; no CLAUDE.md exemption covers this, and the htmlFor+id or aria-label fix is the idiomatic remedy.

### `apps/web/components/builder/movements/persona/finalize-button.tsx:38-61`
**Finalize uses the server-prop identityVersion instead of the shared versionRef and has no stale retry — the click itself races the NameField's blur-flush save, yielding a spurious "out of sync" failure in the canonical type-name-then-finalize flow**  
*correctness · ✓ verified · slice: builder*

```ts
const { id: characterId, identityVersion } = useBuilderDraft()
...
const result = await finalizeCharacterAction({
  characterId,
  expectedVersion: identityVersion,
})
...
surfaceError(result.error)  // "stale" → toast("This draft is out of sync. Refresh and try again.")
```

Every other builder write goes through `dispatchCharacterWriteWithRetry` reading the provider's shared `versionRef` (bumped in-frame by sibling saves) with a one-shot silent stale retry. FinalizeButton bypasses both: it reads the context prop `identityVersion`, which lags the real version until the write's `revalidatePath` payload commits. Worse, the trigger is built into the flow: clicking Finalize fires `blur` on the focused NameField (focus moves on mousedown), whose `onFocusChange(false)` flushes a pending name save — so the name write and `finalizeCharacterAction` (carrying the pre-bump version) are in flight concurrently. Whenever the name save commits first, finalize fails "stale" and the player gets an error toast + `router.refresh()` at the commit moment of the whole builder, despite nothing actually being wrong. Same deterministic failure if the 500ms debounce save committed but the revalidated prop hadn't re-rendered before the click.

**Suggested fix:** Dispatch the finalize through the same pipeline as everything else: read `versionRef` (e.g. via `useBuilderWrite().write` or `dispatchCharacterWriteWithRetry`) so an in-flight sibling bump is visible in-frame and a single stale resolves via the silent refetch-and-retry instead of a user-facing error. The server-side gate re-runs every predicate, so a retry is safe.

**Verifier:** Verified the full causal chain in code: FinalizeButton (finalize-button.tsx:38-49) reads identityVersion from the draft context (server prop) and passes it as expectedVersion, never touching the shared versionRef in BuilderWriteContext that every other builder write mutates in-frame via dispatchCharacterWriteWithRetry, and it has no stale retry (line 55 goes straight to the "out of sync" toast). NameField is autoFocus'd and flushes a name save (same "identity" version class, per EDIT_SURFACE_CLASS) on blur, and finalizeCharacter is conditioned on (id, identityVersion) returning "stale" — so a Finalize click that blurs the name input while a name save is in flight races, and if the name save commits first, finalize stales spuriously with the pre-bump prop. CLAUDE.md and the hook JSDocs establish the shared-versionRef + silent-retry pipeline as the standard pattern this button uniquely bypasses, and the suggested fix (route through useBuilderWrite) matches it; the server gate re-runs every predicate so a retry is safe. P1 rather than P0 because the 500ms debounce makes it timing-dependent (a slow click after the prop re-renders succeeds), but it sits on the most natural type-name-then-finalize path and yields a false error at the builder's commit moment.

### `apps/web/components/builder/movements/persona/pronouns-field.tsx:43-46`
**Dangling label association: FieldLabel htmlFor="pronouns" but the Input has no id**  
*a11y · ✓ verified · slice: builder*

`<FieldLabel htmlFor="pronouns">Pronouns (Optional)</FieldLabel>` followed by `<Input type="text" aria-label="Pronouns" ...>` with no `id` prop. Verified that packages/ui `Input` (Base UI `InputPrimitive` outside a Base UI Field.Root) and `Field` (plain `div role="group"`) do no id auto-wiring, so `htmlFor="pronouns"` points at nothing: clicking the visible label does not focus the input, and the accessible name comes from the redundant `aria-label="Pronouns"`, which drops the visible "(Optional)" qualifier. Contrast with the sibling `narrative-pair.tsx`, which wires `id={inputId}`/`htmlFor={inputId}` correctly.

**Suggested fix:** Add `id="pronouns"` to the Input and remove the `aria-label` so the visible label is the accessible name.

**Verifier:** Confirmed against the code: pronouns-field.tsx:43-46 renders a visible `<FieldLabel htmlFor="pronouns">Pronouns (Optional)</FieldLabel>` over an `<Input>` that has no `id` (only `aria-label="Pronouns"`). I verified packages/ui `Input` is a bare Base UI InputPrimitive that only spreads props (no id injected), `Field` is a plain `<div role="group">` (no Base UI Field.Root id context), and `FieldLabel`→`Label` is a plain `<label>` passing `htmlFor` straight to the native attribute; a repo-wide grep found no `id="pronouns"` target, so the association dangles — label-click won't focus, and the accessible name drops the visible "(Optional)". The sibling ortus/narrative-pair.tsx wires `id={inputId}`/`htmlFor={inputId}` correctly, proving this is an inconsistency, not the intentional aria-label-only pattern of name-field.tsx (which renders no visible label). CLAUDE.md documents no exception, and the suggested fix (add `id="pronouns"`, drop `aria-label`) is sensible.

### `apps/web/components/campaign/join-link-card.tsx:90`
**Read-only invite-link Input has no accessible name**  
*a11y · ✓ verified · slice: enemies-campaign*

`<Input readOnly value={path} className="flex-1 font-mono text-sm" />` — packages/ui Input renders a bare Base UI `<input>` (verified: no implicit label), and this usage passes no `aria-label`, no `id`, and has no associated <label>. The nearby `CardTitle` ("Invite link") is a div with no programmatic association. The field is focusable (readOnly inputs are in the tab order), so a screen-reader user tabs into an unnamed field and hears only its value — a raw `/join/{token}` path with no explanation of what it is. Fails WCAG 4.1.2 / axe `label` rule.

**Suggested fix:** Add `aria-label="Join link"` to the Input (or wire a visible/sr-only <label htmlFor> with an id).

**Verifier:** The cited code is quoted exactly: line 90 is `<Input readOnly value={path} className="flex-1 font-mono text-sm" />` with no aria-label, id, or associated label. The packages/ui Input is a bare Base UI `<input>` that only spreads props (verified), so it has no implicit accessible name, and CardTitle renders a plain `<div>` with no programmatic association. readOnly inputs stay in the tab order, so a screen-reader user tabs into an unnamed field hearing only the raw `/join/{token}` path — a genuine WCAG 4.1.2 / axe `label` failure. This is not an accepted project pattern: sibling campaign components (create-encounter, create-campaign, delete-campaign) all label their inputs via htmlFor/FieldLabel/Label, and the suggested fix (add aria-label) is the standard, sensible remedy.

### `apps/web/components/campaign/live-encounter-banner.tsx:29-37`
**Dynamically-appearing "Combat is live" banner is not announced to AT**  
*a11y · ✓ verified · slice: enemies-campaign*

The banner root is `<div className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-4">` with no `role="status"`/aria-live. The whole point of the companion EncounterStatusListener (encounter-status-listener.tsx, in this slice) is to make this banner appear *without a reload* the moment combat goes live — a `status: "live"` ping triggers `router.refresh()` and the banner is inserted into the page. A sighted player waiting on the campaign page sees it appear; a screen-reader user is never informed. This is exactly the "updates are essential information" case: combat starting is the call to action for the player.

**Suggested fix:** Render the banner (or an always-present wrapper slot around it on the campaign page) as `role="status"` / `aria-live="polite"` so its insertion after the realtime refresh is announced. Note the live region must exist before the content appears for reliable announcement, so an always-rendered wrapper in the page is the robust shape.

**Verifier:** Evidence is accurately quoted: live-encounter-banner.tsx:29 is a plain div with no role/aria-live. The banner is rendered conditionally (page.tsx:126/190, `liveEncounter ? ... : null`) and EncounterStatusListener fires router.refresh() on a `status: "live"` ping (listener:43), so the RSC re-renders and inserts the banner with no reload — a sighted player sees it appear, a screen-reader user is never told. This is not an accepted pattern; the codebase's own near-identical primary-tinted CTA banner (ranks-banner.tsx:77) is correctly an `<Alert role="status">`, making this an inconsistent omission, and the finder's note that the live region must pre-exist the inserted content is technically correct.

### `apps/web/components/character-sheet/active-archetype-switcher.tsx:94-99`
**aria-label on the archetype switcher trigger hides the active Archetype name from AT and breaks Label in Name**  
*a11y · ✓ verified · slice: cs-root*

<ComboboxTrigger aria-label="Switch active Archetype" ...>{archetypeDisplayName(character.activeArchetypeKey)}</ComboboxTrigger> — aria-label replaces the button's content in the accessible name. A screen-reader user reading the owner header's identity line ("Level 5 · <button> · Wanderer") hears "Switch active Archetype" instead of the actual active Archetype name — information sighted users get is dropped entirely for AT users (the non-owner branch in sheet-header.tsx renders the name as plain text, so only owners are affected). It is also a WCAG 2.5.3 (Label in Name, Level A) failure: the visible label (e.g. "Aegis") is not contained in the accessible name, so voice-control users saying "click Aegis" cannot activate it.

**Suggested fix:** Make the accessible name start with the visible text and append the purpose, e.g. aria-label={`${archetypeDisplayName(character.activeArchetypeKey)} — switch active Archetype`}, or drop aria-label and add an sr-only suffix span inside the trigger ("(switch active Archetype)").

**Verifier:** Evidence is quoted verbatim (active-archetype-switcher.tsx:94-99). ComboboxTrigger (packages/ui/src/components/combobox.tsx) spreads props to Base UI's Trigger, rendering a native button whose children are the archetype name plus a decorative CaretDownIcon; for a button, aria-label outranks text content in the accessible-name algorithm, so AT users hear "Switch active Archetype" instead of the visible archetype name that sighted users read in the identity line — and the visible label is not contained in the accessible name, a WCAG 2.5.3 Label-in-Name Level A failure that breaks voice-control activation. sheet-header.tsx confirms only the owner branch (line 87) uses the switcher while the non-owner branch (line 90) shows the name as plain text, so the scope is exactly as claimed; no CLAUDE.md convention sanctions shadowing visible text, and every other codebase aria-label is on icon-only/no-visible-text controls. The suggested fix (prefix the accessible name with the visible text, or drop aria-label for an sr-only suffix) is the standard remedy.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-detail-panel.tsx:110-122`
**Dialog initialFocusRef is never attached — focus management silently no-ops on open**  
*a11y, debt · ✓ verified · slice: cs-surfaces*

The panel does `const headerRef = useRef<HTMLDivElement>(null)` then `<ResponsiveDialogContent initialFocusRef={headerRef} ...>` and `<ResponsiveDialogHeader ref={headerRef}>`. But `ResponsiveDialogHeader` (packages/ui/src/components/responsive-dialog.tsx:131) is `function ResponsiveDialogHeader({ className, children }: React.ComponentProps<"div">)` — it destructures only `className`/`children` and never forwards `ref` (no rest spread), so `headerRef.current` is always null. Consequences: (a) mobile — `ResponsiveDialogContent` runs `event.preventDefault(); initialFocusRef.current?.focus()` (responsive-dialog.tsx:111-118), which cancels Vaul's auto-focus and then focuses nothing, so keyboard/SR focus never moves into the open drawer; (b) desktop — Base UI's `initialFocus` gets a null ref and falls back to default initial-focus behavior, i.e. the exact bug the in-file comment says this exists to prevent: "Focus the header on open rather than letting the dialog auto-focus the first tabbable element — which, for an Archetype with no unlocked ... Skill rows, is the footer action button, scrolling the panel to the bottom on open." Additionally, the header `div` has no `tabIndex={-1}`, so even with ref forwarding the imperative `.focus()` on the Vaul path would no-op on a non-focusable element.

**Suggested fix:** Make `ResponsiveDialogHeader` forward `ref` (spread rest props onto the underlying SheetHeader/DrawerHeader — both already spread onto their div) and add `tabIndex={-1}` to the header in the panel so the imperative focus works on the Vaul branch. Verify on both the desktop Sheet and mobile Drawer branches that focus lands on the header on open.

**Verifier:** Verified the full chain. ResponsiveDialogHeader (responsive-dialog.tsx:131-141) destructures only {className, children} and renders <SheetHeader className={className}>/<DrawerHeader className={className}> without spreading rest props, so the ref={headerRef} passed at archetype-detail-panel.tsx:122 is silently dropped — even though SheetHeader/DrawerHeader themselves DO spread ...props onto their div. headerRef.current is therefore always null, so the mobile Vaul branch (preventDefault + null .focus(), lines 111-118) cancels auto-focus and focuses nothing, and the desktop Base UI branch passes a null initialFocus ref, reproducing the exact footer-focus/scroll-to-bottom bug the in-file comment (lines 111-114) says the code exists to prevent. The missing tabIndex={-1} sub-point is also correct for the imperative Vaul .focus() path, and CLAUDE.md sanctions no such no-op pattern; the suggested fix mirrors how the underlying header components already forward props.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-node-card.tsx:61-112`
**Node card button: invalid content model, flattened run-on accessible name, and misleading aria-pressed**  
*a11y · ✓ verified · slice: cs-surfaces*

The `<button>` wraps `<div>`s and a `<dl className="grid ...">` of attribute pairs. The HTML content model for button permits only phrasing content, and ARIA treats button descendants as presentational, so the dt/dd structure is discarded and the accessible name flattens to a run-on string of name + tier + four attribute label/value pairs + the state badge text. Also `aria-pressed={selected}` advertises a toggle button, but activating the card opens a modal detail dialog (LineageAtlas sets selectedKey, which opens ArchetypeDetailPanel) and re-activating cannot unpress it — `aria-haspopup="dialog"` describes the actual behavior.

**Suggested fix:** Give the button a curated accessible name (e.g. `aria-label={`${archetype.name}, ${TIER_LABELS[tier]} tier, ${stateLabel}`}`) so the flattened text run is replaced, and swap `aria-pressed` for `aria-haspopup="dialog"`. Optionally restructure so the dl sits outside the interactive element (card with an overlay button) if the attribute semantics should remain navigable.

**Verifier:** Verified against apps/web/components/character-sheet/archetypes/atlas/archetype-node-card.tsx:62-112: the <button> wraps <div> and a <dl>/<dt>/<dd> (flow content, not the phrasing content the HTML spec permits in a button), and carries no aria-label, so its accessible name flattens to a run-on of name + tier + affinity chips (which also render visible text) + four attribute pairs + state badge, with the dl semantics discarded as presentational. aria-pressed={selected} advertises a toggle, but onSelect → setSelectedKey opens a modal ResponsiveDialog (archetype-detail-panel.tsx open={node!==null}) and re-clicking the same card just re-sets the same key — it never unpresses — so aria-haspopup="dialog" is the accurate semantic, as claimed. No CLAUDE.md pattern sanctions this, and the suggested fix (curated aria-label, swap aria-pressed→aria-haspopup, optionally hoist the dl out of the interactive element) is sound. Real and unmitigated.

### `apps/web/components/character-sheet/combat-state/ailment-editor.tsx:88-114`
**Owner-mode ailment readout is hidden from assistive tech inside an aria-label'd button (and is invalid HTML)**  
*a11y · ✓ verified · slice: cs-state*

The popover trigger is `<button ... aria-label={isEmpty ? "Set ailment" : "Edit ailments"}>` whose children include `<AilmentEntries ailmentKeys={optimisticAilments} />` — a `<ul>` of ailment names + descriptions (ailment-list.tsx:36-53). Two problems: (1) `aria-label` overrides the button's content for name computation and role `button` has presentational children, so a screen-reader owner hears only "Edit ailments" — the actual current ailment (the essential readout, shown to sighted users in the same spot) is not exposed; they must open the popover and hunt for the pressed Toggle to learn their own state. The public (non-owner) view exposes it fine, so owner mode is strictly worse for AT. (2) `<button>` permits only phrasing content; nesting a `<ul>` inside it is invalid HTML.

**Suggested fix:** Render the AilmentEntries readout as a sibling of the trigger (e.g. readout text + an adjacent icon/edit button, or make the accessible name dynamic: aria-label={`Edit ailments — current: ${names.join(", ")}`}). Avoid list markup inside the button either way.

**Verifier:** Verified against the actual code: the owner trigger is `<button ... aria-label={isEmpty ? "Set ailment" : "Edit ailments"}>` (ailment-editor.tsx:90-93) and Base UI's PopoverTrigger render-prop composes the children — including `<AilmentEntries>`'s `<ul><li>` (ailment-list.tsx:36-53) — inside that button. Both sub-claims hold: (1) per ARIA, aria-label overrides content for the accessible name, so an SR owner hears only "Edit ailments" while the actual current ailment(s) — exposed fine in the public AilmentList path — is suppressed, making owner mode strictly worse for AT; (2) a `<ul>` nested inside `<button>` is invalid HTML (button takes phrasing content only). This is not a documented accepted pattern in CLAUDE.md, and the suggested fix (sibling readout or dynamic aria-label, no list markup in the button) is sensible.

### `apps/web/components/character-sheet/combat-state/exhaustion-stepper.tsx:33-52`
**disabled={pending} on the just-activated control drops keyboard focus on every write (pattern across all mechanic/combat-state controls)**  
*a11y · ✓ verified · slice: cs-state*

`<Button ... aria-label="Decrease exhaustion" disabled={pending || exhaustion <= 0} onClick={() => step("decrement")}>`. Activating the button sets `pending` synchronously, which re-renders the focused button with the native `disabled` attribute; browsers then move focus to `document.body`. A keyboard user incrementing exhaustion (or Valor, Perfection) must re-Tab to the control after every single click, and screen readers lose context mid-task. The same `disabled={pending}` is on the control being activated in valor-stepper.tsx:37/47, perfection-controls.tsx:68/78/91, flag-row.tsx:87, dawn-mode-toggle.tsx:35, dusk-mode-toggle.tsx:35, use-prisma-button.tsx:23, and the Toggles inside the ailment-editor popover (147, 170).

**Suggested fix:** Keep native `disabled` for the clamp bounds (value <= 0 / >= max) but express the in-flight state as `aria-disabled` + an onClick guard (or simply don't gate on `pending` — the write path is optimistic and the server clamps/serializes anyway), so the focused element never leaves the tab order.

**Verifier:** The evidence is quoted verbatim — exhaustion-stepper.tsx:38/48 shows `disabled={pending || ...}` on the just-clicked Button, and the same pattern is confirmed at the other cited locations (valor-stepper 37/47, perfection-controls 68/78/91, flag-row 87, ailment-editor 147/170). `pending` comes from `useTransition()` in `useCharacterWrite` and flips true synchronously when `write()` runs in the click handler, so the activated control re-renders disabled; the UI Button wraps Base UI's button which renders a real native `disabled` (no `focusableWhenDisabled`), so the browser blurs it to `document.body` — a real, repeatable focus-drop on every step for keyboard/SR users. CLAUDE.md documents no exception for this, and there is zero `aria-disabled` precedent in the components, so it is not an accepted pattern; the suggested fix (native `disabled` only for clamp bounds, `aria-disabled`+guard or drop the optimistic `pending` gate) is sound and fits the optimistic-write design. Severity P1: an a11y degradation on a primary owner interaction repeated across many controls, though the control remains reachable, so not P0.

### `apps/web/components/character-sheet/combat-state/exhaustion.tsx:34-48`
**Exhaustion effect text is locked behind a hover-only tooltip on a non-focusable Badge**  
*a11y · ✓ verified · slice: cs-state*

`<TooltipTrigger render={<Badge variant={...} className="cursor-help">...}` with `<TooltipContent>{entry.description}</TooltipContent>`. Badge (packages/ui/src/components/badge.tsx) renders via `useRender({ defaultTagName: "span", ... })` — a plain `span` with no `tabIndex`. Base UI tooltips open on hover or focus of the trigger; a span that can never receive focus makes the tooltip hover-only, so keyboard-only (and touch) users have no way to read `entry.description` — the rulebook effect text for the current exhaustion tier, which appears nowhere else on this card. The repo already knows this failure mode: packages/ui/src/components/tooltip-button.tsx wraps its trigger in `<span tabIndex={0}>` precisely because non-focusable triggers break Base UI tooltips (UNN-231 comment).

**Suggested fix:** Make the trigger focusable: render the Badge with `tabIndex={0}` (Badge forwards span props), or reuse the `<span tabIndex={0}>` wrapper convention from tooltip-button.tsx. Alternatively surface the tier description as visible text under the badge and drop the tooltip.

**Verifier:** Verified the quote at exhaustion.tsx:34-48 and Badge's `useRender({ defaultTagName: "span" })` with no tabIndex. Base UI's TooltipTrigger source (node_modules/@base-ui/react/.../TooltipTrigger.js) calls useRenderElement('button', ...) and merges useFocus/hover handlers but injects no tabIndex — it assumes a native focusable <button>, so substituting a non-focusable <span> Badge makes the tooltip hover-only, unreachable by keyboard or touch. The tier's rulebook effect text (entry.description) appears nowhere else on the card (unlike ailment-list.tsx which renders descriptions as visible text), and the repo's own tooltip-button.tsx documents the <span tabIndex={0}> fix for exactly this failure mode (UNN-231), so this is a real a11y gap, not an accepted convention; the suggested fix matches that precedent.

### `apps/web/components/character-sheet/editable-portrait.tsx:128-134`
**Hidden file input is keyboard-focusable, invisible, and unlabeled**  
*a11y · ✓ verified · slice: cs-root*

<input ref={inputRef} type="file" accept={PORTRAIT_ACCEPT} className="sr-only" onChange={onFileSelected} /> — Tailwind's `sr-only` only visually clips the element (1px, absolute, clipped); it stays in the tab order. A keyboard user tabbing through the sheet header lands on an invisible control with no visible focus indicator and no accessible name (no aria-label, no associated <label>), and pressing Enter/Space opens a surprise OS file picker. Screen readers announce an anonymous "file upload" button. The input is only ever meant to be driven programmatically via inputRef.current?.click() from the dropdown item (line 116).

**Suggested fix:** Take it out of the tab order and the accessibility tree: add tabIndex={-1} and aria-hidden="true", or simply use className="hidden" (programmatic .click() works on display:none file inputs in all modern browsers).

**Verifier:** Evidence is quoted verbatim (lines 128-134 match exactly). Tailwind's `sr-only` only visually clips the element — it does not set `display:none` or `tabindex`, so the native `<input type="file">` stays in the tab order and the accessibility tree. The code confirms the input is purely a programmatic handle (only ever fired via `inputRef.current?.click()` at line 116, with the labeled DropdownMenuTrigger/DropdownMenuItem as the real affordances), and it carries no aria-label or associated label, so a keyboard user lands on an invisible, unnamed control that opens a surprise OS file picker. This is duplicated (builder portrait-area.tsx does the same) but is not a documented/accepted pattern in CLAUDE.md, and the suggested fix (`tabIndex={-1}` + `aria-hidden`, or `hidden`/`display:none`) is correct since programmatic `.click()` still works on a display:none file input.

### `apps/web/components/character-sheet/explore/explore-tab.tsx:146-167 (also identity.tsx:74, background.tsx:103)`
**Explore surface has no real headings for its major sections — outline jumps h1 → h3**  
*a11y · ✓ verified · slice: cs-surfaces*

Every major block title on the Explore tab ("Identity", "Knives", "Chains", "Background", "Notes", "Virtues", "Talents", "On this sheet") renders via `CardTitle`, which is a `<div>` (packages/ui/src/components/card.tsx:47 — `function CardTitle(...) { return <div data-slot="card-title" ... /> }`), while the sub-labels inside Identity (`<h3 className="text-xs font-semibold...">{label}</h3>`, identity.tsx:74) and Background (background.tsx:103) are real `<h3>`s. The only true heading above them is the sheet `<h1>` (character name in sheet-header.tsx:77), so heading navigation jumps from h1 straight to facet-level h3s ("Pronouns", "Hopes") with no way to reach the section titles by heading. The `aria-label`ed `<section>` wrappers create regions but do not restore heading navigation.

**Suggested fix:** Render a real `<h2>` for each card/section title (e.g. place an `<h2>` inside `CardTitle`, or pass a heading element with the title classes), keeping the existing h3 facet labels beneath. Apply the same to the rail cards (Virtues, Talents, jump-nav).

**Verifier:** Every quoted detail is accurate: card.tsx:47 confirms CardTitle is a <div>, and all eight Explore section titles (Identity, Knives/Chains via narrative-section, Background, Notes, Virtues, Talents, "On this sheet") render through CardTitle. A grep of the entire explore tree finds zero <h2> elements — the only real headings are the two <h3> facet labels (identity.tsx:74, background.tsx:103, both matching the quoted className) plus the sheet <h1> (sheet-header.tsx:77, non-owner; owner-mode is an input styled like an h1). So heading navigation genuinely jumps h1 → h3, skipping the section titles, and the aria-labeled <section> regions don't restore it. This is not a documented accepted pattern in CLAUDE.md, and the suggested <h2> fix is sensible — the codebase already has a titleAs override precedent (active-archetype-card.tsx:32).

### `apps/web/components/character-sheet/ranks-banner.tsx:25-28, 61-65`
**Unguarded sessionStorage access in the useSyncExternalStore render snapshot crashes the whole sheet when storage is blocked**  
*correctness · ✓ verified · slice: cs-root*

`function readDismissedAtCount(characterId: string): number { const stored = sessionStorage.getItem(dismissalStorageKey(characterId)) ... }` is passed as the client `getSnapshot` of `useSyncExternalStore(subscribe, () => readDismissedAtCount(id), () => Number.POSITIVE_INFINITY)`, so it executes during render on every render of the banner. In browsers where storage access is denied — Chrome/Edge with "Block all cookies" (touching `window.sessionStorage` throws a SecurityError), and some embedded webviews/iframe contexts — the getter throws during render. There is no `error.tsx`/`global-error.tsx` anywhere under apps/web/app (verified by find), so the exception takes down the entire `/c/{shortId}` page — a public, shareable, signed-out-visible route — not just the banner, and for the owner it does so even though the banner is a purely cosmetic reminder. The `dismiss` handler's `sessionStorage.setItem` (line 72) throws in the same environments, though a handler-time throw is far less damaging than the render-time one.

**Suggested fix:** Wrap the storage read in a try/catch that returns the same `Number.POSITIVE_INFINITY` sentinel on failure (storage-blocked viewers simply never see the banner, matching the server snapshot), and guard `dismiss`'s setItem the same way. A tiny `safeSessionStorageGet` helper next to `dismissalStorageKey` in ranks-banner-visibility.ts keeps it testable.

**Verifier:** Evidence is accurately quoted: `readDismissedAtCount` (lines 25-28) calls `sessionStorage.getItem` unguarded and is the client getSnapshot of `useSyncExternalStore` (lines 61-65), so it runs during render of RanksBanner on every render — and crucially before the `role !== "owner"` early return (line 67), so even public/signed-out viewers of the shareable `/c/{shortId}` route execute it. Touching `window.sessionStorage` does throw a SecurityError in real configs (Chrome/Edge "Block all cookies", sandboxed iframes), and I confirmed there is no error.tsx/global-error.tsx anywhere under apps/web/app, so a render-time throw propagates and breaks the whole page rather than just the cosmetic banner. This is not a documented accepted pattern (the sibling use-encounter-enemy-queue.ts shares the same unguarded idiom but it's not sanctioned in CLAUDE.md, which explicitly says correctness issues should be surfaced), and the suggested try/catch-to-sentinel fix matches the existing server-snapshot semantics. Severity is P1 rather than P0 because the crash requires a non-default browser/embedding configuration to trigger, but when it does it blanks an entire public page.

### `apps/web/components/character-sheet/sheet-header.tsx:70-80`
**Owner-mode sheet has no <h1> — the page's only top-level heading exists only for non-owners**  
*a11y · ✓ verified · slice: cs-root*

OwnerOnly renders <EditableCharacterName .../> (a bare <input>, editable-character-name.tsx lines 57-83) while NonOwner renders <h1 className="font-heading text-2xl font-semibold">{character.name}</h1>. A repo-wide grep confirms no other h1 on the /c/[shortId] route, so for the owner the document has no level-1 heading at all — screen-reader heading navigation (the most common SR scanning strategy) finds nothing identifying the page, and the heading outline differs by viewer role for no semantic reason. Tab surfaces below then start at h2/h3 with no ancestor.

**Suggested fix:** Wrap the owner-mode input in the heading element: <h1 className=...><EditableCharacterName .../></h1> (an input is valid phrasing content inside h1, and the accessible-name computation includes the embedded control's value), keeping both branches structurally identical.

**Verifier:** Verified against the code: sheet-header.tsx:70-80 shows OwnerOnly rendering EditableCharacterName (a bare <input>, confirmed lines 57-83 of editable-character-name.tsx) while NonOwner renders the only <h1>. A repo-wide grep confirms the rendered /c/[shortId] page (page.tsx) and shell/layout contribute no other h1 — the other matches are a separate not-found render path and the distinct /archetypes/atlas sub-route. So the owner-mode document has zero level-1 heading while non-owners get one, a role-divergent heading outline not endorsed anywhere in CLAUDE.md; tab sections below use aria-labeled <section>s with no h1 ancestor. The suggested fix (wrap the input in <h1>) is valid phrasing content and keeps both branches parallel.

### `apps/web/components/combat/combatant-rail-row.tsx:39-90`
**Rail row aria-label flattens all vitals/status content for assistive tech**  
*a11y · ✓ verified · slice: combat-root*

The whole row is `<button type="button" onClick={() => onSelect(row.id)} aria-label={`Open ${row.name} detail`} ...>` wrapping the token, Fallen/Downed badges, the "acting" badge, counter badges, and two `VitalBar`s (`role="progressbar"` with aria-valuenow). Per ARIA, `button` has Children-Presentational semantics and `aria-label` overrides the name computed from content, so a screen-reader DM tabbing the rail hears only "Open Goblin detail" — HP/SP values, Fallen/Downed state, and acted/acting status are conveyed exclusively visually. The nested `role="progressbar"` elements (vital-bar.tsx) are dropped inside the button. Additionally, `<div>` flow content inside `<button>` (line 49) is non-conforming HTML (button permits phrasing content only).

**Suggested fix:** Drop the aria-label and let the name compute from content, or extend it with state (e.g. `aria-label={`${row.name}, HP ${row.hp.current} of ${row.hp.max}${row.isFallen ? ", fallen" : ""}${row.isCurrent ? ", acting" : ""}, open detail`}`). Alternatively restructure so the clickable button is the name only and the vitals render as sibling (non-presentational) content.

**Verifier:** Verified against the code: combatant-rail-row.tsx:39-90 is exactly a `<button>` with `aria-label={`Open ${row.name} detail`}` wrapping the token, Fallen/Downed/acting badges, counter badges, and two VitalBars (vital-bar.tsx confirms `role="progressbar"` + `aria-valuenow`). Per the ARIA accessible-name algorithm, `aria-label` overrides the name computed from contents, and `button` carries Children-Presentational semantics that prune the nested progressbars — so a screen-reader DM on the live combat-console rail (combat-console.tsx) hears only "Open X detail," with HP/SP, Fallen/Downed, and acted/acting state available visually only; no convention in CLAUDE.md sanctions flattening rich content this way (the module's other aria-labels are on icon-only buttons where the label is the full meaning). The `<div>` inside `<button>` (line 49) is also non-conforming HTML as claimed, and the suggested fix (extend the label with state or render vitals as non-presentational siblings) is sound. Severity is P1 (a11y blocker on the core scanning surface), tempered only by the drawer providing full detail on click.

### `apps/web/components/combat/combatant-rail-row.tsx:38-48`
**Rail row's aria-label + button's presentational children hide all combatant status (HP/SP, Downed, acting) from AT**  
*a11y · ✓ verified · slice: combat-root*

The entire row is one `<button ... aria-label={`Open ${row.name} detail`}>` containing the name, Fallen/Downed badges, the 'acting' badge, counter badges, two `VitalBar`s (`role="progressbar"` with aria-valuenow/max), and the expanded engagement/zone/reaction badges. Two compounding problems: (1) the ARIA `button` role has presentational children, so the nested `role="progressbar"` semantics are discarded entirely; (2) `aria-label` overrides name-from-content, so the button's accessible name is only 'Open Alice detail' — a screen-reader DM scanning the rail (the console's at-a-glance status surface) gets a list of identical-shaped 'Open X detail' buttons with no HP/SP values, no Downed/Fallen state, and no 'acting' marker.

**Suggested fix:** Compose the status into the accessible name, e.g. aria-label={`${row.name}, HP ${row.hp.current} of ${row.hp.max}${row.sp ? `, SP ${row.sp.current} of ${row.sp.max}` : ""}${row.isFallen ? ", Fallen" : ""}${row.isCurrent ? ", acting" : ""}, open detail`} — or restructure so the `<li>` holds the status content and a smaller labelled button opens the drawer. The inner `aria-label="Acted"` on CheckIcon (line 83) is dead weight either way (presentational subtree) and the state should ride the row's name.

**Verifier:** The evidence is accurately quoted: the whole row is one native `<button aria-label={`Open ${row.name} detail`}>` (lines 39-48) wrapping name, Fallen/Downed/acting/counter badges, two `VitalBar`s (confirmed `role="progressbar"` with aria-valuenow/min/max in vital-bar.tsx), and the expanded engagement/zone/reaction badges. Both ARIA mechanics are real: a `button` role has "children presentational" so the nested `progressbar` semantics are discarded, and `aria-label` overrides name-from-content, so AT only ever hears "Open X detail, button" — every row identical, with no HP/SP, Downed/Fallen, or acting state — on what the parent rail explicitly frames as the console's at-a-glance status surface. No `sr-only`/`aria-live`/`aria-describedby` fallback exists anywhere in components/combat, CLAUDE.md documents no accepted pattern sanctioning this, and the suggested fix is sound and implementable purely in the UI layer (all referenced fields — hp/sp/isFallen/isCurrent — already exist on RailRow; the `<li>` parent wrapper makes the restructure option viable too).

### `apps/web/components/combat/combatant-vitals-section.tsx:103-125`
**Drawer PC HP/SP writes bypass dispatchCharacterWriteWithRetry — no stale-retry where a concurrent player self-write is most likely, and no cross-tab version broadcast**  
*correctness · ✓ verified · slice: combat-root*

`run()` calls the pools actions directly: `const result = await action({ characterId, amount, expectedVersion: pcVitalsVersions.current[detail.characterId] ?? detail.vitalsVersion }); if (!result.ok) { toast.error(...); return }`. hooks/dispatch-character-write.ts documents itself as "The shared retry-and-broadcast pipeline every character write composes through (UNN-203)" — on 'stale' it refetches the class version and retries once, and on success it broadcasts the new version to sibling tabs. This write path does neither. The stale case here is not exotic: in live combat the player adjusts their own HP/SP from the watch view at the same moment the DM applies damage from the drawer — the DM's tap races the realtime ping that would have forwarded the token (use-combat-console.ts onPcPing), and instead of the silent merge every sheet write performs (deltas — damage/heal — merge perfectly on retry), the DM gets a hard 'This character changed elsewhere — reload and try again' and the edit is dropped. The missing broadcastCharacterVersion also means the DM's own other tab with that character's sheet open never hears the bump through the UNN-203 BroadcastChannel funnel.

**Suggested fix:** Route run() through dispatchCharacterWriteWithRetry (surface: the vitals edit surface, versionRef: a per-character RefObject view over pcVitalsVersions — or refactor the map to hold RefObjects) so the drawer write gets the standard refetch-retry-once and the cross-tab broadcast. The pcVitalsVersions forward-sync already tolerates the helper bumping the token ahead of the refresh.

**Verifier:** Verified: the drawer's PcVitals.run() (combatant-vitals-section.tsx:103-125) calls damageAction/healAction/spendSPAction/recoverSPAction directly — the SAME pools actions the sheet's HeaderOwnerActions routes through dispatchCharacterWriteWithRetry (surface:"pools"). On 'stale' the drawer just toasts and drops the edit, whereas the shared pipeline (whose JSDoc says "every character write composes through" it) silently refetches and retries once; the writes are delta-based (applyDamage/applyHeal re-hydrate fresh + apply the delta), so a retry merges perfectly — exactly the recovery that's lost. The concurrent-writer race is real: the watch-sheet-column renders SheetHeader/Vitals owner controls, so a player self-adjusting HP/SP (vitals class) contends with the DM's drawer damage (vitals class) while the echo ping that would forward the token via onPcPing is asynchronous. The cross-tab-broadcast prong is overstated — bumpCharacterVersionGuarded server-side already fires publishCharacterPing on every write, so a second DM tab hears the bump via Ably when configured; the missing broadcastCharacterVersion only matters in the Ably-unavailable poll-only fallback — but the primary stale-retry defect stands and the suggested fix is sound.

### `apps/web/components/combat/encounter-watch.tsx:41-85 (plus watch-sheet-column.tsx 35-114)`
**Watch view re-renders the entire owned character sheet on every snapshot tick — including idle 1.5s polls — with no memoization or prop narrowing anywhere in the chain**  
*perf · ⚠ unverified · slice: combat-root*

EncounterWatch is the polling surface's client root: `const { snapshot, stale } = useEncounterSnapshot(shortId, initialSnapshot)` and it passes the whole snapshot down: `<WatchSheetColumn shortId={shortId} snapshot={snapshot} ownedSheets={ownedSheets} />`. Two compounding problems. (1) The feeding hook (apps/web/hooks/use-encounter-snapshot.ts:118-131, the watch view's dedicated subscription seam) calls `setSnapshot(next)` unconditionally on every poll tick — `versionRef.current = next.version; setSnapshot(next); setStale(false)` — without comparing `next.version` to `versionRef.current`, even though that exact gate already exists for the realtime path (`if (version === undefined || version <= versionRef.current) return`). A fetched JSON body is always a fresh object, so in degraded/polling mode (no ABLY_API_KEY — the designed fallback, ADR Decision 3) the entire watch tree re-renders every 1.5s while the encounter sits idle. (2) Nothing in the slice mitigates: per tick, `Battlefield` re-runs `snapshot.combatants.filter(...)`, `new Map(snapshot.zones.map(...))`, and `resolvePlayerZoneLayout(snapshot)`; and `WatchSheetColumn` → `OwnedSheet` re-renders the app's heaviest component family — `CharacterProvider` + `SheetHeader` + `Affinities` + `MechanicWidget` + the full `Skills` list (the SkillRow popover subsystem) — even though `OwnedSheet` only consumes `snapshot.version` and one combatant (`snapshot.combatants.find((c) => c.id === sheet.combatantId)`). No `memo`/`useMemo` exists anywhere in components/combat (grep confirms zero hits). Even after fixing the hook, every real DM event (each End-turn, enemy HP tick, zone move) still re-renders the player's whole sheet column although their own combatant is unchanged. This is the one surface the app runs at a cadence on players' phones at the table.

**Suggested fix:** Two cheap, layered fixes. In the hook's interval callback, mirror the realtime gate: if `next.version === versionRef.current`, only clear `stale` (a same-value `setStale(false)` bails out) and skip `setSnapshot` — idle polls then cost zero renders. In the slice, stop handing the whole `snapshot` to the sheet column: have EncounterWatch (or WatchSheetColumn) extract `combatant = snapshot.combatants.find(...)` and `snapshot.version` per owned sheet and render a `React.memo`'d OwnedSheet on those narrow props, so battlefield-only changes no longer re-render SheetHeader/Affinities/MechanicWidget/Skills.

### `apps/web/components/combat/end-of-turn-modal.tsx:33-58`
**End-of-turn dialog's focus-restore target is unmounted — keyboard focus dropped to body**  
*a11y · ✓ verified · slice: combat-root*

The modal is opened programmatically (`open={modalOpen && phase === "resolving"}` in combat-console.tsx) with no registered DialogTrigger. The element focused before opening is the "End turn" button (combat-console.tsx line 221), but that exact button unmounts the moment the modal opens — the `phase === "resolving"` branch renders a *different* disabled `<Button>Resolving…</Button>`, and after Done the phase is "drafting", which renders a `<Badge>`. So when the dialog closes, Base UI has no live trigger or prior-focus element to restore to and focus falls to `<body>`. A keyboard DM lands nowhere at exactly the moment they must tab to the draft candidates in the TurnOrderStrip.

**Suggested fix:** Pass Base UI's `finalFocus` (exposed through the Dialog wrapper) pointing at a stable element — e.g. a ref to the turn-order strip's first draft candidate or the console header — so closing the modal lands focus on the next actionable control.

**Verifier:** Verified against Base UI 1.5.0 source. The modal is opened by state (`open={modalOpen && phase === "resolving"}`, combat-console.tsx:252) with no DialogTrigger, so `domReference` is never set; on close, `DialogPopup` passes `returnFocus: finalFocus`, and since `finalFocus` is unset, FloatingFocusManager applies its `returnFocus=true` default → `getReturnElement` falls back to `domReference?.isConnected ? domReference : getPreviouslyFocusedElement()`. There is no trigger, and the only previously-focused element (the "End turn" button, combat-console.tsx:221) unmounts in the same commit the modal opens (the `phase==="resolving"` branch renders a different disabled Button at :226), so `clearDisconnectedPreviouslyFocusedElements` drops it from the WeakRef stack — leaving `returnElement` null and `getFirstTabbableElement(null)` null, so no focus restoration runs and focus falls to `<body>`. The finder's quotes are accurate, no CLAUDE.md pattern waives Base UI focus semantics (it explicitly flags them as in-scope), and the suggested `finalFocus` fix is valid since DialogContent spreads `...props` to `DialogPrimitive.Popup`.

### `apps/web/components/combat/enemies/enemy-catalog-browser.tsx:203-206`
**onDecrement composes the next count from a render-captured queue value (UNN-226 class)**  
*correctness, debt · ✓ verified · slice: enemies-campaign*

`onDecrement={(key) => { const entry = queue.queue.find((item) => item.enemyKey === key); queue.setCount(key, (entry?.count ?? 0) - 1) }}` — the new absolute count is computed from `queue.queue` captured in this render's closure, then written with `setCount`. The hook was explicitly designed against this: its JSDoc says "every mutation reads the fresh stored value before applying its change (no stale closures)", and `add()` is a fresh-read relative mutator. The hook also deliberately syncs across tabs via the `storage` event, which makes the stale read observable: tab B bumps a creature 3→4; before tab A processes the storage event, clicking − in tab A computes 3−1 and writes count 2, erasing tab B's increment (net −2). Same exposure during the in-flight-commit window of the finding above.

**Suggested fix:** Add a fresh-read relative mutator to useEncounterEnemyQueue (e.g. `decrement(enemyKey)` implemented via `update()`, dropping entries at ≤0 like setCount does) and call that from onDecrement instead of computing the absolute count in the component.

**Verifier:** Evidence is quoted verbatim (enemy-catalog-browser.tsx:203-206) and the violated contract is real: the hook's JSDoc (use-encounter-enemy-queue.ts:70-71) explicitly promises "every mutation reads the fresh stored value before applying its change (no stale closures)", and its update()/add()/setCount()/remove() all re-read localStorage synchronously. onDecrement breaks this by computing the absolute next count from entry?.count read off queue.queue, which is parseQueue(raw) captured in the render closure (line 83), then writing that absolute value via setCount — exactly the UNN-226 "client composes post-state from a captured snapshot" pattern CLAUDE.md names as the cautionary tale. The hook deliberately syncs across tabs via the storage event (line 41), so a concurrent tab-B bump that hasn't yet re-rendered tab A is silently overwritten; onIncrement (line 202) avoids this by using the fresh-read relative add(), confirming a decrement mutator is the missing primitive and the suggested fix is sound. Severity is P1 not P0 because within a single tab React's synchronous re-render between clicks usually refreshes the closure, so the data-loss window is the genuine-but-narrower cross-tab / in-flight-commit-transition race rather than a guaranteed every-time overwrite.

### `apps/web/components/combat/enemies/enemy-catalog-browser.tsx:155-162`
**Committed players/enemies counts are conveyed by icon alone**  
*a11y · ✓ verified · slice: enemies-campaign*

`<span className="flex items-center gap-1"><UsersIcon className="size-4" /> {committedPlayers}</span>` and `<SkullIcon className="size-4" /> {committedEnemies}` — the meaning of each number is carried entirely by the icon. Phosphor's SSR icons render a plain `<svg>` with no `aria-hidden`, `role`, or `<title>` (verified in @phosphor-icons/react SSRBase), so AT either ignores them or announces an unnamed image; either way a screen reader hears just "3 2" with no indication these are the committed player/enemy counts for the encounter (WCAG 1.1.1). This header is the only place the existing roster size is shown on this surface.

**Suggested fix:** Add sr-only text (e.g. `<span className="sr-only">players committed</span>` after each count, or aria-label on each span like `aria-label={`${committedPlayers} players committed`}`) and `aria-hidden` on the icons.

**Verifier:** Evidence is accurately quoted (enemy-catalog-browser.tsx:155-162) and the icons are imported from @phosphor-icons/react/dist/ssr (line 7), the SSR variant that renders a bare <svg> with no accessible name when no label prop is passed — so the two header counters convey "players"/"enemies" by icon alone, leaving a screen reader to hear just the bare numbers (WCAG 1.1.1). This is NOT an accepted pattern but a deviation from one: the combat components consistently aria-hidden decorative icons and aria-label/sr-only icon-only semantics, and this very file already applies aria-hidden to its ArrowLeftIcon at line 135 (safe because adjacent text follows). The two header counters are the lone gap, with no neighboring text to rescue the meaning, and the suggested fix mirrors the file's own established convention.

### `apps/web/components/combat/enemies/enemy-catalog-list.tsx:163-207`
**Nested interactive controls: real <Button> inside a div with role="button" on every bestiary row**  
*a11y · ✓ verified · slice: enemies-campaign*

EnemyRow renders `<div role="button" tabIndex={0} onClick={onSelect} onKeyDown={...} aria-pressed={selected} ...>` and nests a real button inside it: `<Button size="icon-sm" variant="ghost" aria-label={`Queue ${row.name}`} onClick={(event) => { event.stopPropagation(); onAdd() }}>`. Interactive controls must not be nested (WCAG 4.1.2; axe rule `nested-interactive`, severity "serious"). The row's accessible name is computed from its contents, so a screen reader announces something like "Goblin L1 12 Queue Goblin, button" — the inner Queue button's label is swallowed into the outer button's name, and in SR browse/forms modes the inner control inside a role="button" container is unreliable to reach or distinguish. This is the primary interaction surface of the catalog (every row). Secondarily, `aria-pressed` is toggle-button semantics for what is master-detail selection (re-activating doesn't unpress), so "pressed" is announced misleadingly.

**Suggested fix:** Don't nest: make the row a CSS-grid/relative container with two sibling controls — a real <button> (or full-row stretched-link button) for select, and the Queue icon Button as a sibling (e.g. absolutely positioned over the row), so neither is inside the other's accessible boundary. Alternatively model the list as role="listbox"/role="option" with aria-selected for the selection state and keep Queue as a sibling action button per row.

**Verifier:** The evidence is accurately quoted: EnemyRow (lines 165-207) renders a `<div role="button" tabIndex={0} aria-pressed={selected}>` and nests a real `<Button>` (which wraps Base UI's Button, rendering a native `<button>` by default) for the Queue action inside it. This is a genuine WCAG 4.1.2 nested-interactive violation (axe "serious"): the inner button's accessible name is swallowed into the outer button's name, and a control inside a role="button" container is unreliable to reach in SR browse/forms modes. It is the primary interaction surface (every catalog row), is the only such pattern in the codebase (no documented exception in CLAUDE.md), and the suggested fix — sibling controls (a stretched-link/select button + a sibling Queue button), or listbox/option with aria-selected — is sensible and matches the project's "use a real control" conventions. The secondary aria-pressed-as-selection nit is also accurate (master-detail selection isn't toggle semantics).

### `apps/web/components/combat/enemies/enemy-queue-rail.tsx:96-98, 123-126`
**Queue count changes have no non-visual feedback (no live region, no toast)**  
*a11y · ✓ verified · slice: enemies-campaign*

The per-item count `<span className="w-5 text-center text-sm tabular-nums">{item.count}</span>` and the total `<span className="font-medium tabular-nums">{totalCount}</span>` are plain spans with no aria-live. Queuing is the surface's core loop and the add buttons live in *other columns* (the "Queue {name}" buttons in enemy-catalog-list.tsx and enemy-statblock-card.tsx) — a screen-reader user activates "Queue Goblin" and receives zero feedback that anything happened: no announcement, no toast (only the final commit produces a toast), and the changed number is in a visually distant rail. The +/- steppers have the same silence: after "Add one Goblin" the new count is not announced.

**Suggested fix:** Make the rail's totals announce: wrap the "Total enemies" value (or a single sr-only summary like `aria-live="polite"` "{totalCount} enemies queued") in a polite live region, so every add/increment/decrement/remove yields one concise announcement. Per-item counts can additionally be associated to their steppers via aria-describedby.

**Verifier:** The cited spans are quoted verbatim (per-item count lines 96-98, total lines 123-126), both plain spans with no aria-live or role="status". The add buttons genuinely live in other columns (enemy-catalog-list.tsx:199 "Queue {name}", enemy-statblock-card.tsx:54), call queue.add, and the hook (use-encounter-enemy-queue.ts) mutates localStorage purely client-side — the only toast in the flow fires on commit (enemy-catalog-browser.tsx:115,120), so every add/increment/decrement/remove yields zero non-visual feedback while the changed number sits in a visually distant rail. This is not an accepted project pattern: CLAUDE.md has no carve-out and the codebase already uses live-region patterns elsewhere (ranks-banner.tsx role="status", Spinner role="status", Alert role="alert"), making this an inconsistency. The suggested fix (polite live region on the total or an sr-only summary) is the standard minimal remedy.

### `apps/web/components/combat/engagement-control.tsx:67-80`
**Static aria-label="Engagement" overrides the trigger's dynamic status text**  
*a11y · ✓ verified · slice: combat-root*

`<PopoverTrigger render={<Button ... aria-label="Engagement" />}><SwordIcon weight="bold" />{triggerLabel}</PopoverTrigger>` — `triggerLabel` is "Engaged (2)" or "Free", but `aria-label` replaces the content-derived name, so AT announces only "Engagement". In `combatant-setup-row.tsx` this trigger is the *only* place a combatant's engagement status is displayed, making the state imperceivable to screen-reader users during setup. It also fails WCAG 2.5.3 (Label in Name): the visible label "Free"/"Engaged" is not contained in the accessible name "Engagement", so voice-control users saying "click Free" miss.

**Suggested fix:** Remove the aria-label (the visible text already names the control), or make it dynamic and inclusive of the state, e.g. `aria-label={`Engagement: ${triggerLabel}`}`.

**Verifier:** Evidence is accurately quoted: the Button at line 74 carries a static aria-label="Engagement" while the trigger content (SwordIcon + triggerLabel) is the only place the combatant's engagement state ("Free"/"Engaged (N)") is rendered, confirmed in combatant-setup-row.tsx lines 91-96 where the trigger is the sole status indicator. Per ARIA naming precedence (and Base UI honors it, since shadcn wraps Base UI here), an explicit aria-label overrides the content-derived name, so AT announces only "Engagement" and the state is imperceivable; it also fails WCAG 2.5.3 since the visible "Free"/"Engaged" text isn't contained in the accessible name. This is not a documented pattern in CLAUDE.md, and the suggested fix (drop the aria-label or make it inclusive of triggerLabel) is correct. P1 as an a11y blocker, though tempered: it lives on a DM-only encounter-setup surface, not a public/player path.

### `apps/web/components/combat/engagement-control.tsx:66-80`
**aria-label="Engagement" overrides the stateful visible trigger label ('Engaged (2)' / 'Free')**  
*a11y · ✓ verified · slice: combat-root*

`<Button ... aria-label="Engagement" />` is the popover trigger whose rendered children are `<SwordIcon/>{triggerLabel}` where triggerLabel is `"Engaged (2)"` or `"Free"`. The aria-label replaces name-from-content, so AT announces only 'Engagement, button' — the combatant's current engagement state, which the JSDoc says exists 'so the roster reads at a glance', is stripped from the accessible name. In the setup roster this trigger is the only engagement readout for a row (unlike the drawer section, which has adjacent text). It also fails WCAG 2.5.3 Label in Name: a voice-control user seeing 'Engaged (2)' cannot say 'click Engaged'.

**Suggested fix:** Drop the aria-label and let the name come from content ('Engaged (2)' / 'Free' is already a usable name), or make it contextual: aria-label={`Engagement: ${triggerLabel}`}.

**Verifier:** Evidence is accurately quoted: `aria-label="Engagement"` sits on the `Button` rendered as the `PopoverTrigger`, whose visible children are `<SwordIcon/>{triggerLabel}` with triggerLabel = "Engaged (N)" or "Free". Per ARIA name computation, aria-label overrides name-from-content, so AT announces only "Engagement, button" and loses the engagement state — and in the setup roster (combatant-setup-row.tsx) this trigger is the row's only engagement readout, with no adjacent text to recover it (the drawer section does have adjacent text, mitigating it there). This also fails WCAG 2.5.3 Label in Name: the visible "Engaged (2)" is not contained in the accessible name, breaking voice control. No CLAUDE.md convention endorses an aria-label that overrides a stateful visible label, and the suggested fix (drop it or `aria-label={`Engagement: ${triggerLabel}`}`) is sound.

### `apps/web/components/combat/import-pcs-panel.tsx:61-72`
**Repeated 'Add'/'Added' toggle buttons lack the character name and never expose that 'Added' removes**  
*a11y · ✓ verified · slice: combat-root*

Every roster row renders `<Button ... onClick={() => onToggle(character.id)}>{added ? "Added" : "Add"}</Button>` — with several placed characters the panel is a run of buttons all named 'Add' or 'Added'. A screen-reader user navigating by form controls (or a voice-control user) cannot tell which character each button adds, and the accessible name 'Added' gives no hint that activating it removes the PC from the roster (the JSDoc: 'A PC already in the roster shows as added and can be removed').

**Suggested fix:** Name each button per character and per action, e.g. aria-label={added ? `Remove ${character.name} from encounter` : `Add ${character.name} to encounter`} (keeping the short visible text).

**Verifier:** Confirmed at apps/web/components/combat/import-pcs-panel.tsx:61-72: each roster row's toggle Button's only accessible name is the visible "Add"/"Added" text (the Phosphor PlusIcon/CheckIcon from /dist/ssr are bare decorative SVGs contributing no name; there is no aria-label, aria-labelledby, or <label> association, and the character.name lives in an unrelated sibling div). With multiple placed characters this produces a run of identically-named "Add"/"Added" controls that a screen-reader or voice-control user cannot disambiguate, and "Added" never signals it removes. This is not an accepted pattern — it is the direct opposite: the combat component family pervasively uses per-entity labels (zones-panel `Remove ${zone.name}`, enemy-queue-rail `Add one ${item.name}`/`Remove ${item.name} from queue`, enemy-catalog-list/statblock-card `Queue ${row.name}`, combatant-setup-row `Remove combatant`), so this button is the lone outlier and the finder's suggested aria-label fix matches existing convention exactly. The only evidence inaccuracy is cosmetic (the finder omitted the icon child), which does not affect the accessible-name conclusion.

### `apps/web/components/combat/player-combat-state-control.tsx:28-52`
**Player's condition toggles are version-guarded against a polled snapshot version, so any concurrent DM event makes the player's edit fail with a wrong toast and no UI feedback**  
*correctness · ✓ verified · slice: combat-root*

`const { dispatch, pending } = useOwnCombatEvent(shortId, snapshotVersion)` with `snapshotVersion={snapshot.version}` wired from the polled/pinged `EncounterSnapshot` (encounter-watch.tsx → watch-sheet-column.tsx). `applyOwnCombatEvent` loads the *fresh* row, reduces against it, but then saves guarded on the client's stale token (`saveEncounterSession(encounter.id, next, expectedVersion)` in lib/actions/encounter/own-events.ts), and the guard is strict (`WHERE version = expectedVersion`). The encounter version bumps on every DM event (end turn, draft, move, enemy damage…), and during live combat the DM writes continuously; the player's token only advances when the next snapshot refetch lands (sub-second on realtime, up to ~1.5s+ on the poll fallback). Any toggle inside that window is rejected `stale`. Because this path deliberately has no optimistic mirror (`useOwnCombatEvent` JSDoc: "the edit isn't mirrored locally"), the player sees: click → brief `opacity-60` → nothing happens → toast "This encounter changed elsewhere. Reload and try again." — a lost edit during exactly the high-traffic moments the feature exists for, with reload advice that is meaningless on an auto-refetching surface. Note the guard adds nothing semantically here: the reduce already ran against the fresh session, and a player-overlay event (own ailment/flag) cannot conflict with the DM events that invalidate the token.

**Suggested fix:** In `applyOwnCombatEvent`, guard on the version of the row the action just read (making read-reduce-write atomic) rather than the client's snapshot token — or retry once on `stale` by re-reading and re-reducing. The expectedVersion from the snapshot can stay as a cheap precondition only if the server falls back to its own read-version on mismatch.

**Verifier:** Every evidentiary link is confirmed in code: the snapshot's version is the encounter row's optimistic token (player-snapshot.ts:232 `version: encounter.version`), wired as `snapshotVersion={snapshot.version}` (watch-sheet-column.tsx:103) into `useOwnCombatEvent`, which guards `applyOwnCombatEvent` on that stale client token; the DM's `applyCombatEvent` and the player's path BOTH bump the same single `version` column via `saveEncounterSession`→`bumpEncounterVersionGuarded` with a strict `eq(encounters.version, expectedVersion)`, so any concurrent DM event (endTurn/move/enemy-damage) invalidates the player's token until the next refetch lands. On `stale` the user gets the exact misleading toast ("This encounter changed elsewhere. Reload and try again.") with no optimistic mirror (JSDoc + absence of useOptimistic confirmed) — a silently lost edit during exactly the high-traffic live-combat window the feature targets. The guard is also semantically pointless here: the action already loads the fresh row and reduces against it (own-events.ts:56-65), and a player-overlay event can't conflict with the DM events that move the token, so the rejection is a pure false conflict; nothing in CLAUDE.md accepts this (the UNN-226 pattern it documents is the inverse, client-composed-object staleness). The suggested fix (guard on the just-read row version, or retry-once on stale) is sensible.

### `apps/web/components/combat/player-turn-order.tsx:32-48`
**No live region for polled turn-order changes on the player watch view**  
*a11y · ✓ verified · slice: combat-root*

`<CardAction ...>{currentActor ? (<>Now acting: <span ...>{currentActor.name}</span> · {COMBAT_SIDE_LABELS[currentActor.side]}</>) : ("Between turns")}</CardAction>` — this text silently swaps every time the polled/realtime snapshot changes (useEncounterSnapshot in encounter-watch.tsx). "Now acting: X" is the watch view's core purpose — it is the player's cue that their turn started — yet there is no `aria-live` anywhere on the surface, so a screen-reader player is never notified and must manually re-read the page each round. The same applies to the round number and to the `StatusPill` "Reconnecting…" / status flips (draft→live→ended) in encounter-watch.tsx lines 141-156.

**Suggested fix:** Wrap the "Round {round}" + "Now acting" readout in a container with `aria-live="polite"` (and `aria-atomic`), or maintain a visually-hidden polite live region in encounter-watch.tsx that announces actor/round/status transitions when the snapshot changes.

**Verifier:** The evidence is quoted accurately: player-turn-order.tsx:32-48 renders "Now acting: {name} · {side}" / "Between turns" and "Round {round}" with no aria-live, and the parent encounter-watch.tsx StatusPill (lines 141-156) likewise lacks one. useEncounterSnapshot confirms the snapshot is swapped in place via setSnapshot on every poll tick and realtime ping (no page navigation), so a screen reader is never notified of the actor/round/status transitions that are this view's stated core purpose ("turn tracker" cue per its JSDoc). The project already uses this exact pattern elsewhere (ranks-banner.tsx: <Alert role="status">), so the suggested polite-live-region fix is conventional and sensible, and nothing in CLAUDE.md accepts omitting it.

### `apps/web/components/combat/player-turn-order.tsx:79-83`
**aria-label on a generic <span> is prohibited and unreliably exposed**  
*a11y · ✓ verified · slice: combat-root*

`<span aria-label="has acted" className="text-muted-foreground">✓</span>` — ARIA prohibits `aria-label` on elements with a generic role; browsers/AT ignore it, so the span is announced as the raw "✓" character ("check mark") or skipped, not as "has acted". The hasActed state otherwise rides only on `opacity-50`.

**Suggested fix:** Use `<span role="img" aria-label="has acted">✓</span>`, or render the ✓ `aria-hidden` plus an `sr-only` "has acted" text node.

**Verifier:** Evidence is quoted exactly (player-turn-order.tsx:79-83): aria-label="has acted" sits on a bare <span> wrapping the literal "✓" glyph. A span with text content has the generic role, for which ARIA prohibits aria-label — browsers/AT ignore it and announce the raw checkmark or nothing, and the only other hasActed signal is the visual opacity-50 (line 75), invisible to AT. This is not an accepted project pattern: the sibling files watch-enemies-rail.tsx:75 and combatant-rail-row.tsx:83 put the same label on a Phosphor CheckIcon (an <svg>, where aria-label is valid), so the bare-span variant is the outlier bug, and the suggested role="img"/sr-only fix matches conventions the project already uses (sr-only in adjust-pool-controls.tsx).

### `apps/web/components/combat/player-turn-order.tsx:31-61`
**Polled watch-view turn tracker has no live region — turn changes are silent to screen readers**  
*a11y · ✓ verified · slice: combat-root*

The CardAction renders `Now acting:{" "}<span className="font-medium text-foreground">{currentActor.name}</span>` and the header renders `<h2 ...>Round {round}</h2>`. This component is fed by EncounterWatch from useEncounterSnapshot (realtime ping + ~1.5s polling fallback), so the current actor and round number change underneath the user with no interaction. `grep -rn 'aria-live\|role="status"\|sr-only' apps/web/components/combat` returns zero hits — there is no live region anywhere in the directory. The watch view at /c/encounter/{shortId} exists precisely to tell players whose turn it is; a screen-reader user never hears any turn change and must manually re-read the page every few seconds. This is essential, async-updated information (the exact case the audit lens names).

**Suggested fix:** Mark the current-actor readout as a polite live region, e.g. wrap the CardAction content in `<span aria-live="polite">` (or add `role="status"` to the CardAction element) so 'Now acting: X · Players' is announced when it changes. Keep the region scoped to the one-line readout (not the whole chip list) so each snapshot tick doesn't re-announce the full turn order; round changes can ride the same string ('Round 3 — Now acting: …').

**Verifier:** Evidence is quoted accurately: player-turn-order.tsx renders the `Round {round}` h2 and the `Now acting: {currentActor.name} · {side}` CardAction with no live region, and grep confirms zero aria-live/role=status/sr-only across components/combat/. The component is fed by EncounterWatch, a "use client" component driven by useEncounterSnapshot (realtime ping + ~1.5s polling fallback), so currentActor and round change without user interaction — async-updated info silent to screen readers on the exact view meant to announce turns. Live regions are an established pattern elsewhere in the app and no project doc carves out an exception, so this is a real a11y blocker, not an accepted convention; the suggested polite live region scoped to the actor readout is the correct fix.

### `apps/web/components/combat/turn-order-strip.tsx:51-75`
**Draft-candidate button unmounts on click, dropping keyboard focus to <body> every turn**  
*a11y · ✓ verified · slice: combat-root*

A candidate renders as `<button ... onClick={() => onDraft(row.id)}>` only while `isCandidate(row)` (`isDrafting && row.isEligible`); after `onDraft` dispatches `draftCombatant`, the optimistic session makes that row `isCurrent`, so the same map iteration re-renders it as the boxed `<span>` (lines 77-89) — the focused button is removed from the DOM and the browser resets focus to `<body>`. The same happens to the 'End turn' button in combat-console.tsx (replaced by the disabled 'Resolving…' button / 'Tap who's up' badge), which is also the element Base UI's dialog would try to restore focus to when the controlled EndOfTurnModal closes. Net effect: a keyboard-only DM loses their tab position on every single turn of combat and must re-traverse the console from the top — on the app's most interaction-dense surface.

**Suggested fix:** After a draft, move focus deterministically — e.g. keep a ref to the strip container and focus it (`tabIndex={-1}` + `.focus()`) or focus the next candidate button in a layout effect when `phase` flips. Alternatively render every chip as the same persistent `<button>` element (disabled when not a candidate) so the focused node never unmounts.

**Verifier:** The evidence is accurately quoted: a candidate row renders as a focusable `<button>` (turn-order-strip.tsx:54-73) only while `isCandidate` (isDrafting && isEligible); after `onDraft` calls `dispatch({kind:"draftCombatant"})`, useCombatConsole's `applyOptimistic` synchronously re-runs `reduceCombatSession`, setting the drafted combatant as `currentActorId` (console-view.ts:123 `isCurrent: combatant.id === session.currentActorId`) and flipping `phase` to "active" in combat-console.tsx. On re-render the same `key={row.id}` now matches `isBoxed`, so the `<button>` is replaced by a `<span>` (lines 79-88) — an element-type change React cannot reconcile in place, so the focused button unmounts and focus resets to `<body>`. The secondary claim holds too: EndOfTurnModal is a controlled Base UI Dialog whose opener ("End turn" button) is swapped to a disabled "Resolving…"/"Tap who's up" element by the time it closes, so focus restoration also lands nowhere useful. No CLAUDE.md pattern accepts this, and the suggested ref/layout-effect focus management (or persistent disabled button) is the correct remedy.

### `apps/web/components/combat/use-combat-console.ts:121-136`
**Back-to-back dispatches share a stale expectedVersion: the second tap within one server round-trip is rejected as 'stale' and its optimistic edit reverts**  
*correctness · ✓ verified · slice: combat-root*

dispatch() reads the version token at the top of the transition scope: `startTransition(async () => { applyOptimistic(event); const result = await applyCombatEvent({ encounterId: encounter.id, expectedVersion: versionRef.current, event }); ... versionRef.current = result.value.version; ... })`. React invokes the transition scope immediately (verified in node_modules/react-dom/cjs/react-dom-client.development.js:8885 `var returnValue = callback()` — async transitions are not queued), so two taps inside one network RTT both POST with the same `versionRef.current`; the ref is only bumped after the first response resolves. The server guard (`bumpEncounterVersionGuarded`, eq(version, expectedVersion) in lib/db/writes/encounter.ts:105-112) rejects whichever write lands second with `"stale"`, the client toasts "This encounter changed elsewhere. Reload and try again." and React reverts that event's optimistic state — the UI showed both taps applied, then snaps one back. This bites hardest on the drawer's stepper-style controls, none of which carry a pending guard: combatant-counters-section.tsx (whose JSDoc claims "back-to-back taps merge on the server instead of overwriting" — they don't merge, the second is rejected before the delta is ever applied), conditions-controls.tsx axis/ailment/flag buttons, combatant-actions-section.tsx toggles, and combatant-vitals-section.tsx EnemyVitals which passes a literal `disabled={false}` (lines 201, 220). The identical dispatch exists in use-encounter-setup.ts:46-61 and in the player's path (hooks/use-own-combat-event.ts, consumed by player-combat-state-control.tsx, also unguarded by pending). The codebase's own fix for exactly this — hooks/dispatch-character-write.ts, a refetch-fresh-version-and-retry-once pipeline 'every character write composes through' — was not adopted for encounter events, even though replaying the event against the fresh row is precisely the intended merge semantics (the wire payload is the event, the server re-reduces from the row it loads).

**Suggested fix:** Give the encounter dispatch the same one-shot stale-retry the character writes have: on `"stale"`, refetch the encounter's current version (a tiny read action) and re-issue the same event once before toasting. Alternatively (or additionally) serialize dispatches per hook through a promise queue so a second tap awaits the first response and reads the bumped versionRef. At minimum, stop advertising merge behavior the path doesn't have (counters JSDoc) and remove the literal `disabled={false}` in EnemyVitals in favor of a real pending guard.

**Verifier:** Confirmed from code: React's startTransition invokes the async callback synchronously (`var returnValue = callback()` in react-dom-client.development.js), so dispatch()'s body runs up to `await applyCombatEvent(...)` and reads versionRef.current synchronously; the ref only bumps at line 133 after the first response resolves. Two taps within one RTT therefore both POST the same expectedVersion against a single encounter.version column, and bumpEncounterVersionGuarded (eq(version, expectedVersion)) rejects the second as "stale" — React reverts its optimistic edit and toasts "changed elsewhere." The hook JSDoc's stale-defense only covers a *stale render frame* (a tap after the first await resolved), NOT two taps before it resolves, so this is not an accepted/documented mitigation; meanwhile the character-write path has exactly the one-shot stale-retry fix (dispatchCharacterWriteWithRetry) that the encounter dispatch — duplicated across use-combat-console, use-encounter-setup, and use-own-combat-event — never adopted. Evidence is accurate down to the counters merge JSDoc, the literal disabled={false} at lines 201/220, and the absence of any pending guard on the drawer's stepper controls; severity is P1 not P0 only because it requires two taps inside one network RTT rather than firing deterministically.

### `apps/web/components/combat/use-combat-console.ts:122-135, 145-156`
**No try/catch around awaited Server Actions in transitions: a transport-level rejection skips the toast and escalates to the route error boundary, with no error.tsx anywhere in the app**  
*correctness · ✓ verified · slice: combat-root*

`dispatch()` and `endEncounter()` do `const result = await applyCombatEvent(...)` / `await endEncounterAction(...)` with no try/catch. The Result type only models domain errors; a network blip, an aborted fetch, or a `forbidden()` thrown by `requireCampaignDM` rejects the promise instead. React 19 channels an async-transition rejection into the nearest error boundary (the rejected thenable is dispatched as the transition's finished state — react-dom-client.development.js:8894-8904), and `find apps/web/app -name error.tsx` returns nothing, so the whole combat console is replaced by Next's default client-exception screen mid-session; the optimistic edit reverts with no toast. Same unguarded shape in use-encounter-setup.ts:47-60 and combatant-vitals-section.tsx:111-124 (`run()` awaiting the pools actions). Contrast with the slice's read-side code which is careful here (hooks/use-realtime-channel.ts and use-encounter-snapshot.ts .catch() every fetch). For a DM driving live combat on conference-room wifi this is the difference between a 'try again' toast and losing the console.

**Suggested fix:** Wrap the awaited action in try/catch inside each transition (use-combat-console dispatch + endEncounter, use-encounter-setup dispatch, combatant-vitals-section run; hooks/use-own-combat-event has the same hole) and toast a generic 'Couldn't reach the server — check your connection' on throw. Adding a route-level error.tsx for /combat/[shortId] would also bound the blast radius, but the per-dispatch catch is the real fix since the optimistic revert + toast is the designed failure mode.

**Verifier:** Confirmed all four cited sites await a Server Action inside startTransition with no try/catch; the actions return Promise<Result<...>> modeling only domain errors, and `find app -name error.tsx/global-error.tsx` returns zero files, so a transport-level rejection (network drop, aborted fetch, server crash) escalates past the nonexistent boundary to Next's full-page client-exception screen with no toast — under React 19.2 a rejected async transition does revert the optimistic state but re-throws to the nearest boundary. This is demonstrably NOT an accepted pattern: the project's own useDebouncedAutoSave (hooks/use-debounced-auto-save.ts:171-202) wraps the awaited write in try/catch, names exactly "network drop, server crash, auth interrupt", rolls back, and toasts "Couldn't save. Try again." with the comment "expected failures should return Result.err, not throw" — the combat transitions deviate from that established convention. The finder's forbidden() sub-claim is overstated (the actions README explicitly says not to handle 403 in the UI and treats a tampered-call 403 as correct), but the core transport-rejection claim survives independently and the suggested per-transition try/catch + connectivity toast matches the existing pattern. P1 rather than P0 because it only triggers on actual transport failure, not every interaction, and no data is corrupted (optimistic state reverts) — but losing the live DM console mid-session is a material resilience gap.

### `apps/web/components/combat/use-combat-console.ts:121-136`
**A rejected server-action promise inside the transitions is uncaught — a network blip crashes the console to the error boundary instead of toasting**  
*correctness · ✓ verified · slice: combat-root*

`startTransition(async () => { applyOptimistic(event); const result = await applyCombatEvent(…)` with no try/catch; only `Result`-shaped failures reach `toast.error(...)`. A Server Action invocation rejects outright on a dropped connection, timeout, or non-action 5xx, and in React 19 an error thrown in an async transition propagates to the nearest error boundary — so a transient network failure while the DM taps End turn replaces the entire live console with the error page, discarding drawer/modal state, despite the hook's JSDoc promising "on failure the toast fires while React reverts the optimistic state automatically". Same shape in `endEncounter` (lines 144-157), use-encounter-setup.ts:46-61, and the drawer's PC-pools `run()` (combatant-vitals-section.tsx:103-125). This is an app-wide idiom (no write surface in apps/web try/catches its action call), but the DM console mid-combat is the surface where a hard crash is most costly.

**Suggested fix:** Wrap the awaited action in try/catch (or `.catch`) and route the failure through the existing toast path (`toast.error("Connection lost — change not saved.")`), letting useOptimistic revert as it already does for Result errors. If fixed, apply the same wrapper to use-encounter-setup.ts and the PC pools `run()` in combatant-vitals-section.tsx.

**Verifier:** Evidence is accurately quoted: dispatch (use-combat-console.ts:121-136), endEncounter (144-157), use-encounter-setup.ts:46-61, and combatant-vitals-section.tsx run() (103-125) all `await` a Server Action inside `startTransition(async …)` with no try/catch, and only the `Result`-shaped `!result.ok` branch reaches `toast.error`. A transport-level rejection (dropped connection, timeout, non-action 5xx) bypasses the `Result` channel and throws inside the async transition; I confirmed there is no `error.tsx`/`global-error.tsx` anywhere in apps/web/app and no error boundary in the combat route tree, so the throw lands on Next's default error UI, tearing down the live console (drawer/modal/optimistic state). This is not a documented accepted pattern — the actions README's "Failure modes the UI must handle" table enumerates only Result-channel codes and explicitly carves out only forbidden()/403 as the deliberate uncaught throw, while the hook's own JSDoc promises "on failure the toast fires." The suggested fix (wrap in try/catch and route through the existing toast path, letting useOptimistic revert) is sensible and matches the project's stated intent.

### `apps/web/components/combat/watch-enemies-rail.tsx:61-101`
**Acted enemies dimmed to opacity-50 push already-muted essential text far below contrast minimums**  
*a11y · ✓ verified · slice: combat-root*

`<div className={cn("... border-l-destructive p-2.5", ... enemy.hasActed && "opacity-50")}>` dims the whole card, inside which the zone name and ailment badges are `text-xs text-muted-foreground` (line 85). muted-foreground is oklch(0.5 0.012 270) (~4.6:1 on the light background); halving the card's opacity composites that to roughly 2:1 at 12px — well under the 4.5:1 minimum — for information the rail exists to show (where the enemy is, what ailments it carries). The header even instructs "grayed out = already acted this round", institutionalizing the failure for every acted enemy each round.

**Suggested fix:** Convey "acted" without nuking text contrast: keep the ✓ indicator and use a lighter treatment (e.g. reduced-saturation border/background, or opacity no lower than ~0.8), keeping body text at or above 4.5:1.

**Verifier:** The evidence is accurately quoted: watch-enemies-rail.tsx:64-67 applies `opacity-50` to the whole EnemyCard when `enemy.hasActed`, and lines 85-99 render the zone name and ailment text inside it. I confirmed `--muted-foreground` is `oklch(0.5 0.012 270)` (globals.css:70) against background `oklch(0.985 ...)` (line 59) — a base contrast of ~4.5:1 that, with no card background fill, composites at 50% opacity to roughly 1.6-2:1 on the zone name, well under WCAG AA 4.5:1; the ailment Badge's `text-destructive` (oklch 0.46) similarly drops to ~1.8:1. This is the rail's sole presentation of where the enemy is and what ailments it carries, and the header text "grayed out = already acted this round" institutionalizes it for every acted enemy each round; CLAUDE.md documents no exception sanctioning this. The suggested fix (retain the ✓ marker, use a non-opacity dim or floor opacity near 0.8) is sound, so the claim survives as a real a11y blocker.

### `apps/web/components/editor/markdown-field.tsx:98-110`
**Multi-line rich-text editor exposed without aria-multiline="true"**  
*a11y · ✓ verified · slice: small-surfaces*

`editorProps: { attributes: { "aria-label": ariaLabel, ...(ariaLabelledBy ? { "aria-labelledby": ariaLabelledBy } : {}), class: "prose ..." } }` — Tiptap (verified in the installed @tiptap/core 3.23.6: `attributes: { role: "textbox", ...editorProps.attributes }`) defaults the contenteditable to `role="textbox"`, and this component adds only the label attributes. Without `aria-multiline="true"`, screen readers announce a plain (single-line) text box, so users expect Enter to submit/leave the field rather than insert a paragraph — wrong expectations for a multi-paragraph Markdown notes editor (the surface is even sized `min-h-64`). ARIA APG explicitly calls for `aria-multiline="true"` on multi-line textbox widgets.

**Suggested fix:** Add `"aria-multiline": "true"` to `editorProps.attributes` alongside the existing aria-label wiring.

**Verifier:** The evidence is accurately quoted: editorProps.attributes (markdown-field.tsx:98-110) sets only aria-label, conditional aria-labelledby, and class — no aria-multiline. I confirmed @tiptap/core 3.23.6 sets role:"textbox" on the editor element (index.js:5118-5119), and attributes are spread after, so the surface is exposed as a textbox; combined with StarterKit (headings/paragraphs/lists), contentType markdown, min-h-64, and the real multi-paragraph consumer document-editor.tsx, this is genuinely a multi-line textbox missing aria-multiline="true", which AT announces as single-line. Nothing in CLAUDE.md accepts this omission, and the component's own JSDoc shows a11y was deliberately wired (aria-labelledby), so it's a real gap, not an intentional pattern; the suggested fix matches the ARIA APG remedy.

### `apps/web/components/shared/side-effect-badge.tsx:27-42`
**Side-effect rule description is mouse-hover-only: tooltip trigger is a non-focusable span Badge**  
*a11y · ✓ verified · slice: primitives*

`<TooltipTrigger render={<Badge variant="secondary" className="cursor-help">{sideEffect.name}</Badge>} />` — `Badge` renders a plain `<span>` (packages/ui/src/components/badge.tsx, `defaultTagName: "span"`). Base UI's TooltipTrigger opens on hover (`mouseOnly: true` in node_modules/@base-ui/react/tooltip/trigger/TooltipTrigger.js) or focus, and does not add `tabIndex` to a custom-rendered element, so the span can never receive keyboard focus and hover is mouse-pointer-only. The tooltip body (`<Prose inverted>{sideEffect.description}</Prose>`) is the only place the side effect's rule text surfaces in the Skill/attack popovers — keyboard-only, touch, and screen-reader users get just the chip name ("Critical", "Insta-Kill (Light)") with no way to read what it does. The repo's own TooltipButton (packages/ui/src/components/tooltip-button.tsx) documents this exact Base UI pitfall and owns a focusable-wrapper workaround, so the pattern for the fix already exists in-tree.

**Suggested fix:** Make the trigger focusable: `Badge` supports the `render` prop, so `render={<Badge variant="secondary" render={<button type="button" />} …/>}` keeps the chip styling while giving keyboard users a focus stop that opens the tooltip via Base UI's focus interaction (Badge already carries `focus-visible:` ring styles). Minimum viable alternative: add `tabIndex={0}` to the badge span.

**Verifier:** Verified against source: the evidence is quoted accurately. Base UI's TooltipTrigger renders a default `<button>` (focusable) but the consumer overrides it with `render={<Badge.../>}`, and Badge's `defaultTagName: "span"` produces a non-focusable element; the trigger's hover interaction is `mouseOnly: true` and `useRenderElement` injects no `tabIndex`, so the `useFocus` interaction can never fire for a span that can't take focus. The side effect's `description` surfaces only in `TooltipContent` (the chip text is just `sideEffect.name`), so keyboard-only, touch, and screen-reader users lose the rule text entirely — and the in-tree TooltipButton already documents and owns this exact focusable-wrapper workaround, confirming the fix direction. Not an accepted pattern per CLAUDE.md; the suggested fix (render Badge as a button, or tabIndex=0) is sound since Badge already carries focus-visible ring styles.

### `apps/web/components/shell/theme-hotkey.tsx:24-56`
**Global single-letter "d" shortcut with no disable/remap mechanism (WCAG 2.1.4, Level A)**  
*a11y · ✓ verified · slice: small-surfaces*

`if (event.key.toLowerCase() !== "d") { return } ... setTheme(resolvedTheme === "dark" ? "light" : "dark")` bound on `window.addEventListener("keydown", onKeyDown)` for the lifetime of the app. WCAG 2.1.4 (Character Key Shortcuts, Level A) requires that a shortcut using only a letter character can be turned off, remapped, or is active only when the relevant component has focus — none of the three holds here. The `isTypingTarget` guard only covers inputs/textareas/selects/contenteditable; with focus anywhere else (body after navigation, a link, a card button mid-tab), pressing "d" flips the entire app's theme. Speech-input users (Dragon etc.), whose dictation emits letter keystrokes, are the canonical victims of exactly this pattern. Aggravating context: a repo-wide grep shows this is the ONLY theme control in the app (no other `setTheme`/`useTheme` consumer), so it is also undiscoverable — nothing in the UI documents it, and pointer/touch users have no theme toggle at all.

**Suggested fix:** Require a modifier (e.g. Ctrl/Cmd+Shift+D — note Shift+letter alone still fails 2.1.4), or expose the toggle through the existing command palette / a visible control (e.g. an item in the account menu) and drop the bare-letter listener. If the bare "d" must stay, add a user setting to disable it.

**Verifier:** The evidence is quoted verbatim: theme-hotkey.tsx binds a bare-letter "d" keydown on window (line 48) that flips the whole app's theme (line 45), and the modifier guard (lines 33-39) ensures only the unmodified letter triggers. ThemeProvider mounts ThemeHotkey app-wide via app/layout.tsx, so the listener lives for the app's lifetime, and the isTypingTarget guard only excludes form fields/contenteditable — focus on body, a link, or a button still toggles. This fails WCAG 2.1.4 Level A (no off-switch, no remap, not focus-scoped), and a repo-wide grep confirms this is the only theme control (no command-palette or account-menu alternative), making it both an a11y blocker and undiscoverable. Nothing in CLAUDE.md sanctions this pattern, and the suggested fix (modifier or surface via the existing command palette/account menu) is sensible.

### `apps/web/hooks/use-encounter-snapshot.ts:114-137`
**Polling path commits an identical-content snapshot every 1.5s tick, re-rendering the whole watch view at idle**  
*perf · ⚠ unverified · slice: hooks-lib*

The interval callback sets state unconditionally on every successful poll:

```ts
const intervalId = setInterval(() => {
  fetcherRef.current(shortId)
    .then((next) => {
      if (cancelled) return
      versionRef.current = next.version
      setSnapshot(next)
      setStale(false)
    })
```

The ping path right above it is version-gated (`if (version === undefined || version <= versionRef.current) return` at line 107), but the poll path has no such guard: even when the DM has changed nothing, every tick produces a freshly parsed `EncounterSnapshot` object (new identity, equal content) and `setSnapshot(next)` commits it. In `components/combat/encounter-watch.tsx` that new identity flows into every snapshot-derived computation per tick: `Battlefield` re-runs `snapshot.combatants.filter(...)`, rebuilds `new Map(snapshot.zones.map(...))`, and calls the engine's `resolvePlayerZoneLayout(snapshot)`; `PlayerTurnOrder`, `ZoneLayout`, `WatchEnemiesRail`, and `WatchSheetColumn`/`PlayerCombatStateControl` all receive referentially-new props, so React Compiler memoization cannot bail on any of them. This is the app's hottest polling surface (players' phones at the table), and polling is the *entire* behavior whenever `ABLY_API_KEY` is absent or the realtime connection drops (ADR Decision 3 degraded mode) — so at idle the full 3-column tree re-renders and re-derives ~40 times a minute for no data change.

**Suggested fix:** Mirror the ping path's version gate in the poll success handler: only `setSnapshot(next)` (and forward `versionRef.current`) when `next.version > versionRef.current`; still call `setStale(false)` (a no-op bail when already false). The existing tests pass unchanged — they all advance `version` when asserting a swap. Same one-line guard applies to the shared `refetch()` used by ping/reconnect for consistency.

### `apps/web/hooks/use-own-combat-event.ts:27-54`
**Back-to-back condition edits within one round-trip dispatch a stale expectedVersion and are dropped with an error toast — the JSDoc's rapid-toggle claim only holds after the first response lands**  
*correctness · ✓ verified · slice: hooks-lib*

```ts
  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      const result = await applyOwnCombatEvent({
        shortId,
        expectedVersion: versionRef.current,
        event,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      versionRef.current = result.value.version
```

`versionRef` is bumped only when the first response returns. A second `dispatch` issued while the first is in flight reads the pre-bump token; `applyOwnCombatEvent` is strictly version-guarded (`saveEncounterSession(encounter.id, next, expectedVersion)` in lib/actions/encounter/own-events.ts) with no silent-stale retry — unlike every character write, which goes through `dispatchCharacterWriteWithRetry`. So the second edit is rejected, toasted, and lost. The window is realistic: there is no optimistic mirror (the comment says so — the UI only updates after the snapshot refetch, up to ~1.5s on the polling fallback), and the consumer `components/combat/player-combat-state-control.tsx` only dims during pending (`className={cn(pending && "opacity-60")}`) without disabling `ConditionsControls`, so a player toggling Charged then a battle-condition axis (or double-clicking a toggle that gave no feedback) hits it. The hook's own doc — "a rapid second toggle reads the freshly-bumped token … so it isn't spuriously rejected as stale" (lines 23-25) — is only true once the first round-trip completed.

**Suggested fix:** Serialize dispatches through a promise-chain queue (the `saveQueueRef` pattern from use-debounced-auto-save) so the second event reads the freshly-bumped token, and/or add the one-shot stale-refetch-retry the character pipeline has (refetch the snapshot version on "stale" and retry once). At minimum, have the consumer disable controls while `pending`.

**Verifier:** Evidence is accurately quoted and the race is real: two `startTransition(async ...)` dispatches do not serialize in React, so both read the pre-bump `versionRef.current` and send the same `expectedVersion`; `saveEncounterSession` (eq(version, expectedVersion)) returns `err("stale")` with no retry, the hook toasts "This encounter changed elsewhere. Reload and try again." and the second edit is lost — and the consumer only dims (`opacity-60`) without disabling the permissive `ConditionsControls`. The hook's JSDoc "rapid second toggle reads the freshly-bumped token" claim only covers stale render-frame staleness after the first round-trip lands, not in-flight concurrency. Unlike every character write (which gets `dispatchCharacterWriteWithRetry`'s one-shot stale-refetch-retry), this path has no recovery; the suggested fixes (queue serialization, mirror the character retry, or disable-on-pending) are sensible and have direct precedent. Not P0 because the failure is a visible toast with a working remedy (reload) requiring two edits inside one round-trip, and the identical race already ships on the DM console path (useOptimistic masks the UI but does not prevent the same stale rejection), making this a material but bounded defect.

### `apps/web/hooks/use-realtime-channel.ts:104-169`
**One full Ably Realtime client + WebSocket + token round-trip per hook instance — N concurrent connections on the DM console and watch view**  
*perf · ⚠ unverified · slice: hooks-lib*

Each `useRealtimeChannel` instance constructs its own client inside its own effect:

```ts
const realtime = new Realtime({
  authCallback: (_params, callback) => { ... fetchRealtimeToken(domain, shortId) ... },
  plugins: { WebSocketTransport, FetchRequest },
})
client = realtime
```

There is no shared client or connection: every instance opens its own WebSocket, POSTs `/api/realtime/token` on mount, and independently re-fetches tokens on expiry. The hook's own `RealtimeChannelListener` wrapper (lines 82-85) explicitly advertises mounting *one instance per list item*, and consumers do exactly that: `components/combat/combat-console.tsx:138` renders a listener per PC combatant on top of `use-combat-console.ts:94`'s own encounter subscription — a 4-PC live encounter holds **5 concurrent WebSockets** on the DM's device, each with its own heartbeats and token-renewal round-trips. The watch view stacks `useEncounterSnapshot`'s channel plus one per owned sheet's `CharacterProvider` (`use-character.tsx:142`), and `components/campaign/encounter-status-listener.tsx:49` opens one connection per listed encounter. Ably's documented best practice (and billing unit) is one connection per device multiplexing channels; per-component clients is the SDK's named anti-pattern. The multiplication is partly forced by the token route issuing single-channel capabilities, but the cost lands here.

**Suggested fix:** Share one lazily-created `BaseRealtime` client per page (module-level singleton or a provider), with per-hook-instance `channels.get(...).subscribe/unsubscribe` lifecycle. Requires widening the token route's capability from a single channel to the set of channels the page needs (e.g. accumulate requested channels and re-auth, or a namespaced-domain wildcard subscribe capability — knowledge-of-shortId auth is preserved by keeping the channel names server-resolved). Connection-state callbacks (`onReconnect`/`onAvailabilityChange`) then hang off the one shared connection.

## P2 (86)

### `apps/web/app/builder/[shortId]/_loader.ts:1-61`
**Builder loader inlines a raw Drizzle query in a route module instead of composing lib/db/queries/ reads**  
*conventions · ⚠ unverified · slice: routes*

The route-level loader builds persistence directly: `import { db } from "@/lib/db"` plus `db.select({ archetypeKey: characterArchetypes.archetypeKey }).from(characterArchetypes).where(eq(characterArchetypes.id, row.activeArchetypeId)).limit(1).then((rows) => rows[0] ?? null)` (lines 42-48). CLAUDE.md's Repo Structure assigns reads to `lib/db/queries/` ("queries/ Reads: load-character (central loader), character-list, versions, encounter-lock"), and every other page in app/ consumes named query wrappers (loadCampaignByShortId, loadEncounterRowByShortId, loadHydratedCharacterByShortId). This is the only app/ file importing `db` and a schema table directly. Compounding it, the loader's two other reads are imported from write modules — `import { loadCharacterChains } from "@/lib/db/writes/chains"` and `import { loadCharacterKnives } from "@/lib/db/writes/knives"` (lines 12-13) — so a route file now depends on the writes/ side of the documented role grouping for pure reads. Cost: the "where do reads live" rule stops being greppable (a future change to how archetype rows are read must know to look inside app/builder/), and the queries/ vs writes/ split the wrapper-naming rule is built on leaks.

**Suggested fix:** Move the activeArchetypeId→archetypeKey join into a named read in `apps/web/lib/db/queries/` (e.g. `queries/archetypes.ts` per the no-`character-`-prefix wrapper naming rule, or fold it into the existing load-character module), and have `getBuilderCharacter` compose only named query wrappers. Separately (touches files outside this slice), relocate or re-export `loadCharacterKnives`/`loadCharacterChains` from a queries/ module so reads aren't imported from writes/.

### `apps/web/app/campaigns/[shortId]/page.tsx:56-67`
**generateMetadata resolves the campaign name with no auth, bypassing the member/DM gate the page enforces**  
*correctness · ✓ verified · slice: routes*

`generateMetadata` returns `title: campaign ? `${campaign.name} — Unnamed System` : "Campaign not found — Unnamed System"` after an ungated `getCampaign(shortId)` read — it never calls `auth()` or `isCampaignMember`. The page body (lines 81-99) deliberately 404s for strangers, and its own JSDoc states the invariant: "**Neither**: `notFound()`, so a stranger with the URL can't tell the campaign exists". But metadata resolution runs independently of the page render, so for a signed-out or non-member request the segment's resolved title (containing the real campaign name) can be emitted on the not-found document — and at minimum the title differs between an existing and a non-existing shortId ("{name} —" vs "Campaign not found —"), which by itself confirms existence. Contrast `app/combat/[shortId]/page.tsx:23-34`, where `generateMetadata` goes through the auth-gated `getEncounterForDM` and strangers always get "Encounter not found" — the campaign route lacks that symmetry.

**Suggested fix:** Mirror the combat route: fold the viewer check into the cached loader (a `getCampaignForViewer(shortId)` that returns null unless the viewer is DM or member, per-request `cache`d) and have both `generateMetadata` and the page consume it, so non-members uniformly resolve "Campaign not found".

**Verifier:** Evidence is accurately quoted and verified: generateMetadata (page.tsx:56-67) resolves the title via getCampaign → loadCampaignByShortId, a pure shortId-keyed read with no auth() or isCampaignMember call, while the page body (81-99) deliberately notFound()s strangers and its JSDoc states the "a stranger with the URL can't tell the campaign exists" invariant. Because metadata resolution runs independently of render, a signed-out/non-member request gets the real campaign name in the document <title>, and the title itself ("{name} —" vs "Campaign not found —") confirms existence — defeating the documented privacy invariant. The contrast is genuine: the combat route's getEncounterForDM (encounter-access.ts:20-34) gates on auth() + dmUserId and returns the same null for missing/unauthorized, so its generateMetadata never leaks; the campaign route lacks that symmetry, and the suggested getCampaignForViewer fix mirrors the established pattern. Severity is P2, not higher: the leak is confined to a title string (name + existence), not deeper data.

### `apps/web/app/campaigns/[shortId]/page.tsx:108-112, 172-176`
**DmManageView and MemberOverview each independently fetch the same three data sources**  
*debt · ⚠ unverified · slice: routes*

`DmManageView` (line 109): `Promise.all([loadCampaignRoster(campaign.id), loadEncountersForCampaign(campaign.id), loadLiveEncounterForCampaign(campaign.id)])`. `MemberOverview` (line 173): identical triple fetch with identical arguments. Both are async server components called from `CampaignPage` after the role check. The parent already has the `campaign` row; it could fetch all three once and pass them as props, eliminating the duplicate queries.

**Suggested fix:** Hoist all three fetches into `CampaignPage` after the role check, then pass `roster`, `encounters`, and `liveEncounter` as props to both `DmManageView` and `MemberOverview`. Eliminates duplicate DB calls and makes the data flow explicit.

### `apps/web/app/campaigns/[shortId]/page.tsx:200-214`
**MemberOverview re-implements inline roster rendering that RosterList already handles**  
*debt · ⚠ unverified · slice: routes*

Lines 200–214: `roster.map(({ member }) => { ... return <li><Avatar>...</Avatar><span>{displayName}</span></li> })`. `DmManageView` (line 138) uses `<RosterList campaignId={campaign.id} roster={roster} />` for the same data. The member view bypasses the shared component and duplicates the Avatar + displayName pattern inline, importing Avatar, AvatarFallback, AvatarImage, and initials separately.

**Suggested fix:** Replace the inline `roster.map` in `MemberOverview` with `<RosterList campaignId={campaign.id} roster={roster} />` (the `RosterList` component will need its remove-player control to be optional/conditionally rendered based on the viewer role, or a separate read-only variant).

### `apps/web/app/campaigns/page.tsx:5, 30`
**SignedOutLanding imported from my-characters/ by a campaigns page — mislocated component**  
*debt · ⚠ unverified · slice: routes*

`import { SignedOutLanding } from '@/components/my-characters/signed-out-landing'` in `app/campaigns/page.tsx`. The component is defined under `components/my-characters/` but its copy says 'Sign in to manage your characters' — a characters-specific message — yet it now serves as the signed-out gate for campaigns too. Confirmed by prior survey of my-characters/shell/editor: this was already flagged as mislocated (MEMORY: 'SignedOutLanding mislocated (my-characters but used by campaigns)').

**Suggested fix:** Move `SignedOutLanding` to `components/shell/` (it is auth-shell chrome, not character-list chrome) or to `components/shared/`. Update the copy to be generic ('Sign in to continue') or allow a `title` prop so each page sets its own label.

### `apps/web/app/combat/[shortId]/page.tsx:49-52`
**Campaign row queried twice per request — page re-loads what getEncounterForDM just fetched, on every live-combat refresh**  
*perf · ⚠ unverified · slice: routes*

```ts
// getEncounterForDM already authorized the viewer against this campaign, so the
// row exists; resolve its public shortId for the "← Campaign" back link.
const campaign = await loadCampaignRowById(encounter.campaignId)
```

`getEncounterForDM` (app/combat/[shortId]/encounter-access.ts:29) already executed `loadCampaignRowById(encounter.campaignId)` for the DM check, and `loadCampaignRowById` (lib/db/queries/load-campaign.ts:24) is a plain async function with no React `cache` wrapper — so this is a second identical Neon roundtrip per request, awaited serially after the access chain. Because the live console `router.refresh()`es on every combat event/ping (use-combat-console.ts), this redundant query re-runs on every combat action, not just first paint.

**Suggested fix:** Return the campaign row (or just its shortId) from getEncounterForDM, which already holds it — e.g. resolve to { encounter, campaignShortId } — or wrap loadCampaignRowById in React cache so the second call is free. Either removes one serial DB roundtrip from every live-combat refresh; the enemies sub-route benefits too.

### `apps/web/app/combat/[shortId]/page.tsx:88-114`
**pcDetailById build logic duplicated verbatim with load-encounter-snapshot.ts**  
*debt · ⚠ unverified · slice: routes*

Lines 88–114 extract PC character IDs from the session, Promise.all-hydrate them, filter nulls, then Object.fromEntries with `className: getArchetype(key)?.name ?? null`. lib/db/queries/load-encounter-snapshot.ts lines 38–59 does the same extraction → Promise.all hydrate → filter null → Object.fromEntries with identical className logic. Any change to how `className` is resolved (e.g., archetype display name format) must be updated in both places with no compiler enforcement.

**Suggested fix:** Extract a shared `buildPcDetailById(combatants, hydrated)` helper in `lib/db/queries/` (or move to the engine layer as a pure function over already-hydrated data). Both the DM page's `live` branch and `getEncounterSnapshot` call it.

### `apps/web/app/combat/[shortId]/page.tsx:62-77`
**Draft-branch data shaping (hydrate → pcStatsById) belongs in the query/data layer per convention**  
*debt · ⚠ unverified · slice: routes*

Lines 62–77: the `draft` case hydrates `placedCharacters` one-by-one via `Promise.all`, filters nulls, then builds `pcStatsById: Record<string, InitiativeStats>` inline in the page. CLAUDE.md: 'Per-tab data shaping lives next to the data, not in the component. The inline .filter().map() blocks that turn hydrated state into the shape a section renders should be a pure helper in packages/game/src/engine/<domain>/ — the tab root calls one helper and focuses on layout.'

**Suggested fix:** Extract `loadPcStatsForCampaign(campaignId)` into `lib/db/queries/` that returns the `Record<string, InitiativeStats>` map directly, mirroring how `loadOwnedEncounterSheets` encapsulates its hydration loop. The page switch case becomes a single call.

### `apps/web/app/join/[token]/page.tsx:78-167`
**Join page has no heading element in any of its five states**  
*a11y · ✓ verified · slice: routes*

Every state of the page titles itself only with `<CardTitle>{campaign.name}</CardTitle>` (lines 103, 122, 138, 153) or `<CardTitle>This link is no longer valid</CardTitle>` (line 82). `CardTitle` in packages/ui/src/components/card.tsx renders a `<div data-slot="card-title">` (line 47-50), so the rendered document contains zero h1-h6 elements. This is the entry surface for invited players (public, signed-out-visible per the JSDoc): a screen-reader user landing from an invite link gets no heading to orient by (heading navigation is the most common SR scanning strategy), unlike every sibling page (home, campaigns, not-found all render an `<h1>`).

**Suggested fix:** Give each card state a real heading: render the campaign name / stale-link message as an `<h1>` styled like CardTitle inside the CardHeader (CardTitle accepts className passthrough, so an `<h1 className="font-heading text-sm font-medium">` drop-in, or a visually-hidden `<h1>` in `JoinPage`'s `<main>` if the card styling must stay untouched).

**Verifier:** Confirmed all evidence: the join page renders campaign name / stale-link text only as `<CardTitle>` (lines 82, 103, 122, 138, 153), which is a `<div data-slot="card-title">` per card.tsx:47-50, so the rendered document has zero h1-h6 elements. The root layout adds only SiteHeader (no page heading) and children, so no ancestor supplies one. Every sibling route (app/page.tsx, campaigns, campaign manage, not-found) renders an `<h1>`, and CLAUDE.md documents no exception for omitting page headings — so this is an inconsistency, not an accepted pattern. The fix is sound: CardTitle accepts className passthrough, so an `<h1>` styled like CardTitle, or a visually-hidden `<h1>` in `<main>`, drops in cleanly. P2 rather than P1 because the page is a single landmark with descriptive title text, a working `<title>`, a `<main>` landmark, and a labeled action button — content remains reachable, so it is a real heading-navigation/convention gap rather than a hard a11y blocker.

### `apps/web/app/page.tsx:46-50`
**role="list" container whose children are not listitems (ARIA required-owned-elements violation)**  
*a11y · ✓ verified · slice: routes*

The signed-in roster renders `<ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{characters.map((character) => (<CharacterCard key={character.id} character={character} />))}</ItemGroup>`. `ItemGroup` in packages/ui/src/components/item.tsx hardcodes `role="list"` (line 12), but `CharacterCard`'s root element is `Item` (components/my-characters/character-card.tsx line 49), which renders a plain `<div>` with no `role="listitem"` (packages/ui item.tsx `Item`, defaultTagName "div", no role). ARIA requires `role="list"` to own `listitem` children; axe flags this as `aria-required-children`. Screen readers announce a list whose item count is wrong or zero (NVDA/JAWS derive count from listitem roles), misrepresenting the roster structure. The sibling surface app/campaigns/page.tsx (lines 54-60) renders the same kind of card grid correctly with `<ul>`/`<li>`.

**Suggested fix:** Mirror app/campaigns/page.tsx: replace `ItemGroup` with a `<ul className="grid ...">` and wrap each `CharacterCard` in an `<li>` (Item renders fine inside li), or wrap each card in a `div role="listitem"`. Alternatively drop list semantics entirely (plain div grid) since each card already exposes its own actions.

**Verifier:** Confirmed from code: ItemGroup (packages/ui/src/components/item.tsx:12) hardcodes role="list"; Item (lines 59-81) renders via useRender with defaultTagName "div" and no role prop (only data-slot="item"), and CharacterCard uses Item as its root (character-card.tsx:49), so the role="list" container's children are roleless divs — a genuine ARIA aria-required-children violation that axe flags. The evidence is accurately quoted and the sibling app/campaigns/page.tsx (lines 54-60) proves the correct ul/li pattern exists in-repo, so the suggested fix is sensible and not an accepted CLAUDE.md pattern. Severity is P2 rather than P1: the list is unlabeled and the cards' links/actions stay fully reachable, so it degrades the structural announcement (wrong/zero item count) rather than blocking access to content.

### `apps/web/components/archetype/archetype-affinities.ts:1-17`
**hasNonNeutralAffinities is exported but has zero importers — entire file is dead**  
*debt · ⚠ unverified · slice: primitives*

export function hasNonNeutralAffinities(archetype: Archetype): boolean — grep of all apps/web source files returns only the definition. No caller exists.

**Suggested fix:** Delete the file. The same guard is re-derived inline in ArchetypeAffinityChips (returns null early when chips.length === 0) and ArchetypeAffinitiesChart (renders a fallback paragraph when chips.length === 0), so nothing is lost.

### `apps/web/components/archetype/archetype-affinity-chips.tsx:46-50`
**Non-Neutral-affinity chart shaping is re-implemented inline in two components (and a third helper) instead of one engine helper**  
*conventions, debt · ⚠ unverified · slice: primitives*

archetype-affinity-chips.tsx:46-50 and archetype-affinities-chart.tsx:20-24 contain the byte-identical inline shaping block:

```ts
const chips = AFFINITY_DAMAGE_TYPES.flatMap((type) => {
  const affinity = archetype.affinities[type]
  if (!affinity || affinity === "neutral") return []
  return [{ type, affinity }]
})
```

and apps/web/components/archetype/archetype-affinities.ts:11-16 is a third UI-layer encoding of the same domain question (`hasNonNeutralAffinities` via `.some(...)`). CLAUDE.md: "Per-tab data shaping lives next to the data, not in the component. The inline `.filter().map()` blocks that turn hydrated state into the shape a section renders should be a pure helper in `packages/game/src/engine/<domain>/`". The engine already owns this domain file — packages/game/src/engine/archetypes/affinity.ts holds `resolveAffinity`, which encodes the "absent entry = Neutral" defaulting rule these components each re-encode by hand (`!affinity || affinity === "neutral"`). Three parallel implementations of a chart-interpretation rule in the UI layer is exactly the drift the convention exists to prevent.

**Suggested fix:** Add a pure `nonNeutralAffinities(archetype): { type: AffinityDamageType; affinity: Exclude<Affinity, "neutral"> }[]` to packages/game/src/engine/archetypes/affinity.ts (export via the engine barrel); have ArchetypeAffinityChips and ArchetypeAffinitiesChart map over it, and express hasNonNeutralAffinities as `nonNeutralAffinities(a).length > 0` (or retire it — see notes).

### `apps/web/components/archetype/archetype-attributes-inline.tsx:1-34`
**ArchetypeAttributesInline exported but has zero importers**  
*debt · ⚠ unverified · slice: primitives*

export function ArchetypeAttributesInline(...) — grep of all apps/web source files returns only the definition line. No component imports from this module or references this export.

**Suggested fix:** Delete the file. ArchetypeAttributesGrid is used in every detail surface (sheet, atlas, builder). If an inline/compact layout is needed for a future surface, add an `inline` prop to ArchetypeAttributesGrid at that time (similar to how DetailSection already offers an `inline` prop).

### `apps/web/components/archetype/archetype-ranked-skills.tsx:58-66`
**role="list" container whose only children are <button> rows — ARIA required-children violation**  
*a11y · ✓ verified · slice: primitives*

`<ItemGroup className="gap-0">{skills.map((ranked) => (<SkillRow …/>))}</ItemGroup>` — `ItemGroup` renders `<div role="list">` (packages/ui/src/components/item.tsx line 12), and each `SkillRow` renders `<PopoverTrigger render={<Item render={<button type="button" />} …}` (apps/web/components/shared/skill-row.tsx lines 72-79), i.e. the list's direct children are buttons with no `listitem` role (Popover.Root renders no DOM). ARIA `list` requires owned `listitem` children; axe flags this as the serious "aria-required-children" violation, and VoiceOver/NVDA announce a list containing zero items before reading the buttons, which is confusing context. Root cause is partly the packages/ui primitive, but this slice owns the composition (SkillRow supplies the button rows).

**Suggested fix:** Wrap each SkillRow in `<div role="listitem">` inside the ItemGroup (or have SkillRow render its Popover inside a listitem wrapper). Alternatively fix at the source: make ItemGroup's `role="list"` opt-in/removable in packages/ui for button-row groups — the same composition exists in character-sheet/skills.tsx and combat/enemy-statblock.tsx, so a primitive-level fix covers all consumers.

**Verifier:** Verified against source: ItemGroup hard-codes role="list" (item.tsx:11-12); SkillRow renders PopoverTrigger render={<Item render={<button type="button"/>} />} (skill-row.tsx:72-79); Base UI Popover.Root (popover.tsx:8-10) emits no DOM, so the list div's direct children are buttons with no listitem role — a real aria-required-children violation, not a pattern sanctioned anywhere in CLAUDE.md. The same composition recurs in skills.tsx and enemy-statblock.tsx, confirming the root cause is the packages/ui primitive and the suggested primitive-level fix (opt-out role) is the sensible direction. Downgraded to P2 because it is a semantic-context defect (confusing empty-list announcement) rather than an AT blocker — the buttons and their labels remain operable and announced.

### `apps/web/components/archetype/archetype-skill-chips.tsx:1-38`
**Entire file is dead — both exports have zero importers**  
*debt · ⚠ unverified · slice: primitives*

export function ArchetypeSkillChips(...) and export function ArchetypeSynthesisChip(...) — grep of all apps/web source files (excluding .next) returns only the definition lines. No component, page, or lib file imports from this module.

**Suggested fix:** Delete the file. If a Synthesis-Skill chip is needed in a future surface, it is trivial to re-introduce. Keeping dead exports inflates the archetype kit surface and forces future readers to wonder whether these are used somewhere not immediately visible.

### `apps/web/components/archetype/archetype-talents.tsx:29-44`
**ArchetypeTalentChips is exported but has zero importers**  
*debt · ⚠ unverified · slice: primitives*

export function ArchetypeTalentChips({ archetype }: { archetype: Archetype }) — grep of all apps/web source files returns only the definition. ArchetypeTalents (the section-framed variant) is used in 3 callers; the chip-only variant is not.

**Suggested fix:** Delete the export. If a future compact-row surface needs chips without the section frame, the badge rendering loop is trivial to inline or extract then.

### `apps/web/components/archetype/format.ts:12-18`
**formatTalentLabel redefines the Talent display label outside lib/ui/labels.ts and diverges from the canonical catalog name**  
*conventions · ⚠ unverified · slice: primitives*

format.ts defines:

```ts
/** Talent-key slug → display label (`handle-animal` → `Handle Animal`). */
export function formatTalentLabel(talent: string): string {
  return talent
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
```

consumed twice in apps/web/components/archetype/archetype-talents.tsx (lines 20 and 39). CLAUDE.md Code Conventions: "Display labels live in `apps/web/lib/ui/labels.ts`. Any `Record<X, string>` map that turns a domain key into a human-readable string ... goes there — don't redefine inline, even for a one-off consumer." labels.ts already has the canonical helper (line 512): `export const talentLabel = (key: TalentKey): string => getTalent(key)?.name ?? key`, which the builder's talents-picker.tsx uses. The slug-mangler bypasses the authored data catalog (the repo's stated source of truth): for `"sleight-of-hand"` it produces "Sleight Of Hand" while packages/game/src/data/character/talents/registry.ts:27 authors "Sleight of Hand" — so the moment an Archetype grants that talent, the archetype kit and every catalog-backed surface (builder picker, enemy statblock) display different names for the same talent. `Archetype["talents"]` is already `TalentKey[]` (packages/game/src/foundation/archetypes/schema.ts:147), so the typed helper is a drop-in.

**Suggested fix:** Delete formatTalentLabel from apps/web/components/archetype/format.ts and import talentLabel from @/lib/ui/labels in archetype-talents.tsx (both call sites).

### `apps/web/components/builder/builder-provider-shell.tsx:34-46`
**Full CharacterRow serialized into the client draft context and re-streamed on every builder save**  
*perf · ⚠ unverified · slice: builder*

`export function BuilderProviderShell({ character, children }: { character: BuilderCharacter; children: ReactNode })` ... `<BuilderDraftProvider character={character}>`. `BuilderCharacter` extends the entire `CharacterRow` (packages/game/src/foundation/character/records.ts:35-84). Builder client consumers (every `useBuilderDraft()` call site in this slice) read ~20 fields (id, identityVersion, name, pronouns, portraitUrl, pathChoice, originArchetypeKey, the four virtues, gainedTalents, ancestry/background/backstory, the five identity-trait columns, knives, chains). The other ~28 fields — currentHP/SP, hitDiceRemaining, skillDiceRemaining, victories, currency, prismaCharges/prismaMaxCharges, exhaustion, level, notes, ownerId, campaignId, status, builderStep, activeArchetypeId, originCharacterArchetypeId, savedArchetypeRanks, vitals/inventory/progressionVersion, createdAt/updatedAt, plus five jsonb blobs (manualBonuses, sparkLog, ailments, battleConditions, partyComposition) — are never read by any builder client component. Because every builder write calls `revalidateCharacter` → `revalidatePath('/builder/{shortId}', 'layout')` (apps/web/lib/actions/revalidate.ts:24-27), this full object is re-serialized into the RSC payload after every debounced autosave commit (every ~500ms pause while typing in the Animus writer, every Virtue/Path/Talent click). Serialization cost is modest for a draft (jsonb mostly empty), but it is pure dead weight repeated on the builder's hottest write path, and it widens invalidation breadth: any change to any row column re-streams the whole prop.

**Suggested fix:** Have `getBuilderCharacter` (app/builder/[shortId]/_loader.ts) return an explicit Pick of the ~20 fields the builder actually consumes (the repo already practices exact `Pick` slices in the engine, and `StepGateCharacter` in builder-step-gates.ts:33-47 shows the gate-side slice). Type `BuilderProviderShell`/`BuilderDraftProvider` against that slice so unused combat-state/progression columns never cross the RSC boundary.

### `apps/web/components/builder/builder-step-gates.ts:33-47`
**StepGateCharacter carries 7 fields that no gate predicate ever reads**  
*debt · ⚠ unverified · slice: builder*

interface StepGateCharacter { knives, chains, personalityTraits, hopes, dreams, fears, secrets … } — but nextGateForStep only accesses originArchetypeKey, virtueExpression/Empathy/Wisdom/Focus, and name. Animus is explicitly ungated by design (doc comment line 22–24). The finalize action call site (lib/actions/character-finalize.ts:70-87) faithfully supplies all 7 dead fields. No gate predicate will ever consume them unless Animus gating is added.

**Suggested fix:** Trim StepGateCharacter to the 6 fields actually used (name, originArchetypeKey, the four virtue scalars). Update the finalize action call site to pass only those. If Animus gating ships later, expand the interface at that point.

### `apps/web/components/builder/movements/animus/document-editor.tsx:95-143`
**Removing a Knife/Chain with unsaved edits triggers the autosave's unmount flush against the deleted row, surfacing a spurious "Couldn't save" error toast right after a successful removal**  
*correctness · ✓ verified · slice: builder*

```ts
const onError = () => toast.error(messages.saveError)
```

The body editor's `useBuilderAutoSave` (via `useDebouncedAutoSave`) fires a final save on unmount whenever the draft is dirty (`flushOnUnmount` in apps/web/hooks/use-debounced-auto-save.ts lines 261-275), and `WriterPane` remounts the editor by key on doc swap. Flow: the player types into a Knife's body (debounce pending), then clicks the sidebar's remove action on that Knife. The remove commits, `onSuccess` resets the selection to Backstory (writer-sidebar.tsx line 158), the keyed editor unmounts, and the unmount flush dispatches `updateCharacterKnifeDescriptionAction` for the just-deleted row — which returns "knife-not-found" (lib/db/writes/knives.ts line 24). That error is not "stale", so the retry pipeline returns it directly and the unconditional `onError` toasts "Couldn't save the Knife. Try again." — a failure report for an entity the player deliberately deleted moments earlier. The same fires if the 500ms debounce elapses while the remove is in flight.

**Suggested fix:** In the writer's wiring, treat the row-gone errors as benign: have `DocumentEditor` accept (or `wireActions` supply) an `onError` that swallows "knife-not-found" / "chain-not-found" for knife/chain documents (mirroring how talents-picker swallows "duplicate-talent"), keeping the toast for genuine save failures.

**Verifier:** The claim is confirmed end-to-end against the code. The body editor's `useBuilderAutoSave` has no `isEmpty` guard, so `flushOnUnmount` (use-debounced-auto-save.ts:261-275) fires a final `updateCharacterKnifeDescriptionAction` for any dirty non-empty body; `writer-pane.tsx:76` keys the editor by ref so the `resetToDefault()` on remove success (writer-sidebar.tsx:158) unmounts it. Crucially, remove and body share one identity-class `versionRef` (use-builder-draft.tsx), so the remove's version bump leaves the flush reading the fresh version — the guard PASSES and the UPDATE matches zero rows, returning `knife-not-found` (named-entry-list.ts:203), which is not `stale`, so `dispatchCharacterWriteWithRetry` returns it directly and the unconditional `onError` (document-editor.tsx:95) toasts "Couldn't save the Knife." for a row the player just deleted. The quoted evidence is verbatim, this is not a documented pattern (the suppression hook exists in `useBuilderWrite` but not the autosave `onError`), and the suggested swallow-the-row-gone-error fix mirrors the existing talents-picker precedent. Severity P2: a real but transient, non-corrupting spurious toast on a narrow timing path.

### `apps/web/components/builder/movements/animus/document-editor.tsx:148-168`
**Fixed document titles (Backstory / Identity Traits) render as a focusable read-only textbox with all focus styling stripped, instead of a heading**  
*a11y · ✓ verified · slice: builder*

`<Input id={titleInputId} ... readOnly={!isTitleEditable} ... className="... border-0 ... focus-visible:border-0 focus-visible:ring-0 ..." />` with an sr-only label "Title". For Backstory and the five Identity Trait docs there is no `updateTitle` action, so this is a permanent read-only tab stop announced as "Title, edit text, read-only — Backstory" rather than the pane's section heading, and because the Input primitive's default `focus-visible:ring-1`/`border-ring` are explicitly zeroed out, tabbing onto it produces no visible focus indication (a caret in a read-only input is the only possible cue). The writer pane ends up with no heading element at all below the sidebar's h1.

**Suggested fix:** Render fixed titles as a real heading (e.g. `<h2>` styled identically) and only mount the Input when `actions.updateTitle` exists; for the editable case, keep a perceptible focus cue (the underline-color treatment `name-field.tsx` uses, rather than ring-0/border-0).

**Verifier:** All evidence is accurately quoted and confirmed against the code. For the `backstory` and `identity` cases in writer-pane.tsx (lines 135-160, 237-260), the actions object omits `updateTitle`, so `isTitleEditable` is false (document-editor.tsx:96) and the Input is permanently `readOnly` while its value is the canonical section label (`ref.label`, e.g. "Backstory", "Personality Trait") — semantically a heading, not editable content, yet exposed to AT as a read-only textbox with an sr-only "Title" label. The Input primitive's default focus cue (`focus-visible:border-ring focus-visible:ring-1`) is explicitly zeroed by `focus-visible:border-0 focus-visible:ring-0` in the className, so tabbing onto it gives no visible indicator; the only heading in the surface is the sidebar's movement-level h1, so the writer pane has no heading element of its own. The suggested fix is sensible and grounded in a real in-repo precedent (name-field.tsx:75 keeps `focus-visible:border-foreground` on a border-b underline while zeroing the ring), and no CLAUDE.md convention sanctions this.

### `apps/web/components/builder/movements/animus/identity-trait-messages.tsx:11-16`
**IDENTITY_TRAIT_MESSAGES.description, .placeholder, and .emptyReason are dead data — only .label is consumed**  
*debt · ⚠ unverified · slice: builder*

The only call site that reads from IDENTITY_TRAIT_MESSAGES is documents.ts:108 (`IDENTITY_TRAIT_MESSAGES[field].label`). The description for identity traits in the editor is instead provided by a parallel private function `identityDescriptionFor()` in writer-pane.tsx (lines 264-277) — longer, differently worded prose covering the same semantic territory. The IdentityTraitMessages interface has 4 fields; 3 are dead. Additionally, IDENTITY_TRAIT_MESSAGES.placeholder and .emptyReason are never referenced anywhere in the app.

**Suggested fix:** Two options: (a) Delete the dead fields from IDENTITY_TRAIT_MESSAGES (reducing it to a label map) and consolidate the description prose into it, removing identityDescriptionFor() from writer-pane.tsx; (b) wire identityDescriptionFor() to read from IDENTITY_TRAIT_MESSAGES.description so there is one source of truth. Either way delete .placeholder and .emptyReason unless a consumer is added.

### `apps/web/components/builder/movements/animus/writer-pane.tsx:264-277`
**identityDescriptionFor is a switch-as-lookup that duplicates and diverges from IDENTITY_TRAIT_MESSAGES, whose JSDoc claims to be the single source for this copy**  
*conventions · ⚠ unverified · slice: builder*

writer-pane.tsx hand-rolls a per-field lookup:
```
function identityDescriptionFor(field: IdentityTraitField): string {
  switch (field) {
    case "personality":
      return "A Personality Trait is a small, specific habit or quirk..."
    ...
```
Meanwhile identity-trait-messages.tsx defines `IDENTITY_TRAIT_MESSAGES: Record<IdentityTraitField, IdentityTraitMessages>` with `description`, `placeholder`, and `emptyReason` fields and a JSDoc claiming "each label/blurb/placeholder is in one place". That claim is false: only `.label` is ever consumed (documents.ts:108). The writer pane authors its own divergent `description` copy in the switch, its own generic `bodyPlaceholder: \`Write your ${ref.label}…\`` instead of the map's authored placeholders, and the map's `emptyReason` ("Add at least one Personality Trait to continue.") describes a Next-gate that doesn't exist — builder-step-gates.ts documents that "Movement 3 (Animus) is permissive by design" and never gates. Two parallel sources of the same per-field display copy, one of them mostly dead and self-described as canonical, plus a switch used as a lookup where a keyed map already exists (CLAUDE.md: avoid switch lookups; use a registry/map).

**Suggested fix:** Consolidate to one source: put the actually-rendered description/placeholder copy into IDENTITY_TRAIT_MESSAGES, index it from `wireActions`'s identity case (`IDENTITY_TRAIT_MESSAGES[ref.id].description`), delete the `identityDescriptionFor` switch, and delete the unused `placeholder`/`emptyReason` fields (or wire them if the copy is the desired version). Fix the map's JSDoc to match reality.

### `apps/web/components/builder/movements/animus/writer-sidebar.tsx:132-161`
**handleRemove decides the post-remove selection from `wasActive` captured at click time — a selection change during the in-flight remove makes the decision stale**  
*correctness · ✓ verified · slice: builder*

```ts
const wasActive = refsEqual(activeRef, ref)
...
write({
  ...
  onSuccess: () => {
    if (wasActive) resetToDefault()
  },
})
```

`wasActive` snapshots the selection when the trash icon is clicked, but `onSuccess` runs a server roundtrip later. If the active doc is removed and the player selects another document B during the flight, `wasActive` is still true and `resetToDefault()` stomps their fresh selection of B back to Backstory. Conversely, if the player selects the doomed document mid-flight (`wasActive` false), no reset happens and the pane drops to the "That entry is no longer available." fallback instead of Backstory. The correct question is "is the removed ref active *now*?" — answerable at success time, not click time.

**Suggested fix:** Decide at success time against current state: expose a context helper like `clearIfActive(ref: DocumentRef)` on AnimusDocumentContext that does `setActiveRef((prev) => refsEqual(prev, ref) ? DEFAULT_DOCUMENT_REF : prev)`, and call that from `onSuccess` instead of the click-time `wasActive` snapshot.

**Verifier:** The evidence is accurately quoted and the chain holds: `useBuilderWrite.write` does an `await dispatchCharacterWriteWithRetry` server roundtrip (use-builder-draft.tsx:201-208), `wasActive` is captured at click time (line 136) and consumed in the async `onSuccess` (line 158), and the selection-setting `SidebarMenuButton` (lines 183-186) has NO `disabled={pending}` guard, so the player can re-select mid-flight. Both branches are real — a fresh selection of B gets stomped to Backstory (wasActive stale-true), and selecting the doomed doc mid-flight (wasActive stale-false) skips the reset so the pane drops to the "no longer available" fallback instead of Backstory. This is not an accepted pattern; CLAUDE.md's "Owner-mode writes" section flags exactly this class of closure-captured-at-click-time stale decision as the UNN-226 cautionary tale, and the suggested `clearIfActive(ref)` functional-updater fix mirrors the existing `selectDocument` pattern (animus-context.tsx:41-43). It is a genuine but narrow race (sub-second in-flight window, recoverable wrong selection rather than data loss), so P2 rather than P0.

### `apps/web/components/builder/movements/corpus/archetype-card.tsx:123-131`
**listAffinityHighlights re-implements, inline in the component file, the exact non-neutral-affinity shaping already duplicated across the shared archetype kit**  
*conventions, debt · ⚠ unverified · slice: builder*

```
function listAffinityHighlights(archetype: Archetype): { type: AffinityDamageType; affinity: Affinity }[] {
  return AFFINITY_DAMAGE_TYPES.flatMap((type) => {
    const affinity = archetype.affinities[type]
    if (!affinity || affinity === "neutral") return []
    return [{ type, affinity }]
  })
}
```
This is byte-for-byte the same flatMap as components/archetype/archetype-affinity-chips.tsx:46-50, and the same not-neutral predicate appears again in archetype-affinities-chart.tsx:22 and archetype-affinities.ts:14. CLAUDE.md: data shaping that turns domain state into the shape a section renders "should be a pure helper in packages/game/src/engine/<domain>/ (e.g. ... archetypes/display.ts)" — and components/archetype/ exists precisely as the "rendering kit shared by sheet + builder". Three independent encodings of "which affinities are notable" can drift (ordering, treatment of undefined entries) without a compiler complaint.

**Suggested fix:** Extract one pure helper (engine archetypes domain, e.g. a `listNotableAffinities(archetype)` next to engine/archetypes/affinity.ts, or at minimum the existing components/archetype/archetype-affinities.ts module) and consume it from archetype-card.tsx, archetype-affinity-chips.tsx, and archetype-affinities-chart.tsx.

### `apps/web/components/builder/movements/corpus/archetype-card.tsx:52-77`
**Origin selection state is invisible to assistive tech: aria-label on the card button overrides content, and the selected-check span's aria-label sits inside a presentational-children button**  
*a11y · ✓ verified · slice: builder*

The whole card is one button: `<button type="button" onClick={onToggleExpand} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${LINEAGE_LABELS[archetype.lineage]} details`}>`, and the selected indicator inside it is `<span aria-label="Currently selected as Origin" ...><CheckIcon .../></span>`. Two problems compound: (1) `role=button` has Children-Presentational semantics, so the inner span's aria-label is never announced and the `<h3>`/`<dl>` semantics inside the card are flattened (`<h3>`/`<dl>` inside `<button>` is also invalid HTML — button permits only phrasing content); (2) the button's own `aria-label` overrides all inner content, so the accessible name is only "Expand Warrior Lineage details". Net effect: a screen-reader user scanning the 3×4 grid cannot tell which Archetype is currently chosen as Origin — the only programmatic state on the card is `aria-expanded`. The sticky "X chosen" bar only reflects the *expanded* card, so comparing requires expanding every card one by one.

**Suggested fix:** Convey selection on the button itself: e.g. `aria-pressed={selected}` or fold it into the name (`aria-label={`${expandVerb} ${lineage} details${selected ? ", currently selected as Origin" : ""}`}`). Longer-term, restructure so the card's rich content (heading, attribute dl) lives outside the button (heading-with-stretched-button pattern) instead of being flattened inside it.

**Verifier:** The cited code is quoted verbatim: the whole card is one `<button>` with `aria-label={`${expanded ? "Collapse" : "Expand"} ... details`}` whose only state attribute is `aria-expanded`, and `selected` controls only a visual border plus a nested `<span aria-label="Currently selected as Origin">`. The technical claims are correct — an explicit `aria-label` on the button is the accessible name and overrides inner content, and `role=button` carries Children-Presentational semantics so the inner span's label is not exposed; I confirmed there is no `aria-pressed`/`aria-current`/`aria-selected`/role override or sr-only text anywhere in the corpus movement, and the StickyChooseBar only reflects the *expanded* card (`expanded.key === optimisticKey`), so a SR user genuinely cannot tell which Archetype is the chosen Origin without expanding each. Nothing in CLAUDE.md sanctions this pattern, and the suggested fix (`aria-pressed={selected}` or folding selection into the button name) is standard and minimal. I set P2 rather than P1 because selection remains fully operable and visually indicated — it is a degraded, non-blocking a11y defect confined to one builder step, not a task-blocking failure.

### `apps/web/components/builder/movements/corpus/path-bar.tsx:16-30`
**PATH_DIE duplicates the engine's PATH_DICE table under a JSDoc that falsely claims the engine doesn't own it**  
*conventions · ⚠ unverified · slice: builder*

path-bar.tsx hardcodes:
```
/**
 * Per-path die pairing — presentation-only copy not owned by the game engine.
 ...
 */
const PATH_DIE: Record<PathChoice, { hp: number; sp: number }> = {
  "health-focused": { hp: 12, sp: 8 },
  balanced: { hp: 10, sp: 10 },
  "skill-focused": { hp: 8, sp: 12 },
}
```
But the engine DOES own this exact data: packages/game/src/engine/character/stats/stats.ts:190-198 defines `PATH_DICE: Record<PathChoice, PathDice>` with identical values (`hitDie: 12, skillDie: 8`, …), exports `getPathDice`, and its JSDoc says "Source-of-truth lives here next to PATH_STATS". The sheet's rest-dialog.tsx already imports `getPathDice` for the same display purpose. CLAUDE.md: "Never put game logic in the UI layer. The UI should simply render what the game engine provides it." This is rulebook data (rulebook 1.1 die sizes) re-encoded in a component where it can silently drift from the engine if a path's dice ever change, and the comment actively misleads the next reader into believing no engine source exists. The field names also lie: `hp: 12` holds a die-face count, not HP.

**Suggested fix:** Delete PATH_DIE. Import `getPathDice` from @workspace/game/engine (as rest-dialog.tsx already does) and derive both `formatDie` and the `hpShare` split from `getPathDice(choice).hitDie` / `.skillDie`.

### `apps/web/components/builder/movements/ortus/talents-picker.tsx:112`
**Stale-error message for the remove-talent write is semantically wrong**  
*debt · ⚠ unverified · slice: builder*

`messages: { stale: 'Couldn't remove Talent. Try again.', error: 'Couldn't remove Talent. Try again.' }`. The `stale` key surfaces when the server returns a version conflict — the right action is to refresh, not retry the same operation. Using 'Couldn't remove Talent. Try again.' for a stale conflict will mislead users into retrying when they should refresh. Compare the add-branch stale message on line 92-93: 'Someone else updated this character — refresh to see the latest.'

**Suggested fix:** Change the stale message to 'Someone else updated this character — refresh to see the latest.' (or omit it to fall back to the hook's default 'Couldn't sync — refresh to see the latest.').

### `apps/web/components/builder/movements/persona/portrait-area.tsx:99-105`
**Visually hidden file input (sr-only) stays in the tab order with no label and no visible focus**  
*a11y · ✓ verified · slice: builder*

`<input ref={inputRef} type="file" accept={PORTRAIT_ACCEPT} className="sr-only" onChange={onFileSelected} />`. `sr-only` only clips the element visually — it remains focusable and exposed to AT. Tabbing from the avatar, keyboard focus lands on a 1px invisible, unlabeled file control (announced as a nameless "file upload" / "Choose File"): the visible focus indicator disappears for that stop (WCAG 2.4.7) and screen-reader users hear a control with no name duplicating the adjacent "Upload portrait" button that drives it via `inputRef.current?.click()`.

**Suggested fix:** Take it out of both the tab order and the accessibility tree since the visible Button is the affordance: add `tabIndex={-1} aria-hidden="true"` (or use `className="hidden"` — `input.click()` still works on display:none file inputs).

**Verifier:** Evidence is quoted exactly: portrait-area.tsx:99-105 is a type="file" input with className="sr-only" and no tabIndex/aria-hidden/aria-label/associated label, driven only programmatically via inputRef.current?.click() from the visible "Upload portrait" Button. sr-only clips visually but leaves the element focusable and in the a11y tree, so a keyboard user gets an invisible 1px tab stop with no visible focus ring (WCAG 2.4.7) and SR users hear a nameless file control (WCAG 4.1.2) duplicating the real button — the input exists solely to be clicked. CLAUDE.md documents no convention endorsing this (and the identical sibling at editable-portrait.tsx:128 shares the bug, so it's repeated, not intentional), and the suggested tabIndex={-1} aria-hidden="true" / className="hidden" fix is correct since input.click() still works on a hidden input. It is a real but non-blocking a11y defect — the visible labeled Button remains fully keyboard/AT-operable, so the upload flow itself works — making it a degraded extra tab stop rather than a P1 blocker.

### `apps/web/components/campaign/add-character-dialog.tsx:7, 120`
**Client dialog imports archetypeDisplayName, dragging the full archetype/skill/talent catalogs + mechanics registry into the campaign-page client bundle for one subtitle label**  
*perf · ⚠ unverified · slice: enemies-campaign*

`import { archetypeDisplayName } from "@workspace/game/data"` used once: `Level ${character.level} · ${archetypeDisplayName(character.activeArchetypeKey)}`. `archetypeDisplayName` lives in packages/game/src/data/archetypes/registry.ts, whose module scope imports all six archetype definitions plus `DEMO_ARCHETYPES`, `getSkill` (the whole skills catalog — the largest data directory), `getTalent`, and `getMechanic` (engine behavior modules), and runs `validate()` (Zod `archetypeSchema.parse` + cross-registry checks) over every archetype at module init. Because this component is "use client" and no other client component on /campaigns/[shortId] touches @workspace/game, this single label is what pulls the game-data catalogs and their init-time validation into that route's client bundle. The parent `CharacterPlacementSection` is an async RSC that already shapes the `available` rows server-side.

**Suggested fix:** Resolve the label on the server: have `CharacterPlacementSection` (or the `loadOwnedFinalizedCharactersWithPlacement` shaping) attach a precomputed `archetypeLabel` string to each `OwnedPlacementCharacter` passed as `available`, and drop the `@workspace/game/data` import from the client dialog. (`placed-character-card.tsx` also calls `archetypeDisplayName` but is server-rendered, so it can share the same precomputed field without cost.)

### `apps/web/components/campaign/add-character-dialog.tsx:105-131`
**Chosen character is conveyed only by a check-icon opacity toggle — no programmatic selected state**  
*a11y · ✓ verified · slice: enemies-campaign*

The chosen item is marked solely by `<CheckIcon className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />` inside `CommandShortcut`. cmdk's `CommandItem` sets `aria-selected` to its *highlighted* item (verified in cmdk source: `"aria-selected": !!R` tracks the internal active value, moved by ArrowUp/Down and pointer-move), not the app's `selected` state — so after the user arrows through the list, `aria-selected` diverges from the actual chosen character while the only truthful signal is an opacity-toggled SVG that is invisible to assistive tech. A screen-reader user cannot determine which character is currently staged before pressing the footer button; the only hints are the disabled state and the "Add"/"Move here" label flip, which don't identify the item.

**Suggested fix:** Expose the chosen state programmatically: render an sr-only "Selected" span inside the chosen CommandItem next to the check icon (and add `aria-hidden` to the CheckIcon), or pass `aria-checked={isSelected}` through CommandItem (props are spread onto the option element).

**Verifier:** Evidence is accurately quoted: the chosen item is conveyed solely by an opacity-toggled CheckIcon (lines 124-129) with no text/aria. I verified cmdk's source: the Item renders role="option" with "aria-selected":!!R where R=P(v=>v.value&&v.value===b.current) — i.e. aria-selected tracks the store's *active/highlighted* value (moved by arrows/pointer), not the dialog's separate `selected` useState, so the two diverge after the user arrows past the staged item. The packages/ui CommandItem's own built-in check (line 165) is suppressed here via group-has-data-[slot=command-shortcut]:hidden and is keyed on data-checked which is never set, so there is no alternate aria signal. The suggested fix is valid — props spread through cmdk's `...q` before its hardcoded attrs, so an sr-only span or aria-checked passthrough works (aria-checked is not a cmdk-owned attr). Not a hard blocker since the footer label flip + move-confirmation text give partial feedback and the action remains completable, but it's a real a11y gap in identifying the staged character.

### `apps/web/components/campaign/create-campaign-button.tsx:46-64, 74-94`
**React 19 form-action auto-reset wipes the typed name on the failure path**  
*correctness · ✓ verified · slice: enemies-campaign*

The dialog form uses `<form action={onSubmit}>` with an uncontrolled `<Input name="name" required ... />`. React 19 (`react@^19.2.4` per apps/web/package.json) automatically resets uncontrolled fields after a form action completes — and onSubmit never throws on logical failure (`if (!result.ok) { toast.error("Couldn't create the campaign. Check the name and try again.") ; return }`), so from React's perspective every submit succeeds and the reset always applies. On the failure path the dialog stays open with the toast telling the user to "Check the name and try again" against a Name field that was just emptied. The inconsistency is visible here because the description is a controlled MarkdownField (`value={description}`) that survives the reset while the name does not.

**Suggested fix:** Avoid the auto-reset: either make the name input controlled, or switch to `onSubmit={(e) => { e.preventDefault(); ... }}` with FormData built manually, so failed submissions preserve the user's input.

**Verifier:** The code matches the quotes: a plain `<form action={onSubmit}>` with an uncontrolled `<Input name="name" required ... />` (Base UI pass-through, no value/defaultValue) and a controlled `MarkdownField` for description; `onSubmit` returns `{ ok:false } -> toast + return` without closing the dialog, so a failed submit leaves the dialog open. React 19.2 auto-resets uncontrolled fields of a function-action form, clearing `name` while the controlled `description` survives — exactly the inconsistency described, and CLAUDE.md/actions README document no sanctioned pattern here. The finder's only imprecision is timing: because `onSubmit` returns undefined (async work is fire-and-forget inside `startTransition`), the reset fires on every submit, not specifically "after the action completes" — but the observable failure-path symptom (open dialog, emptied name, "check the name and try again") is real and the suggested fix (control the input or preventDefault + manual FormData) is correct. Severity P2: genuine but low-frequency (the `required`/`maxLength` client guards mean it mainly surfaces on server/DB failures) and non-destructive (retype a short name), not a P0 happy-path break.

### `apps/web/components/campaign/create-campaign-button.tsx:21, 100-107`
**TipTap editor statically imported into the /campaigns bundle for a rarely-opened dialog**  
*perf · ⚠ unverified · slice: enemies-campaign*

`import { MarkdownField } from "@/components/editor/markdown-field"` — MarkdownField is "use client" and imports `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-typography`, `@tiptap/extension-placeholder`, and `@tiptap/react` (i.e. the full ProseMirror stack). CreateCampaignButton renders on the My Campaigns list page (`/campaigns`), so every visitor downloads and parses the entire editor bundle even though the field only appears after clicking "Create campaign" and opening the dialog. The only other MarkdownField consumer is the builder's document editor, where the editor is the page's purpose; here it is optional-description chrome on an otherwise lightweight list page. There is no `next/dynamic` usage anywhere in apps/web, so nothing defers it.

**Suggested fix:** Load the editor on demand: `const MarkdownField = dynamic(() => import("@/components/editor/markdown-field").then(m => m.MarkdownField), { ssr: false })` (or split the dialog body into a lazily-imported component mounted when `open` becomes true). The Spinner/Field chrome can stay static; only TipTap needs deferring.

### `apps/web/components/campaign/create-campaign-button.tsx:100-108`
**Campaign description is authored as Markdown (`MarkdownField`) but all read sites render it as a raw string**  
*debt · ⚠ unverified · slice: enemies-campaign*

<MarkdownField
  ariaLabel="Campaign description"
  value={description}
  onChange={setDescription}
  placeholder="A short pitch for your players."
  className="[&_.ProseMirror]:min-h-24"
/>

Both `campaign-card.tsx` (line 19) and `app/campaigns/[shortId]/page.tsx` (lines 121, 185) render `{campaign.description}` as plain text inside a `<span>` — Markdown syntax like `**bold**` appears verbatim. The create dialog's use of `MarkdownField` sets a false expectation for DM authors.

**Suggested fix:** Either: (a) render the description through the shared `<Prose>` component wherever it is displayed (manage page, campaign card), or (b) replace `MarkdownField` in the create dialog with a plain `<Textarea>` since no rendering path honours the Markdown. Option (a) is consistent with how character notes and builder descriptions are handled.

### `apps/web/components/campaign/encounter-list.tsx:9-13`
**`STATUS_VARIANT` is an inline `Record<EncounterStatus, BadgeVariant>` that belongs in `lib/ui/labels.ts` per convention**  
*debt · ⚠ unverified · slice: enemies-campaign*

```ts
const STATUS_VARIANT = {
  draft: "secondary",
  live: "default",
  ended: "outline",
} as const
```

CLAUDE.md: "Display labels live in apps/web/lib/ui/labels.ts. Any Record<X, string> map that turns a domain key into a human-readable string (damage types, attributes, lineages, ranges, etc.) goes there — don't redefine inline, even for a one-off consumer." This badge-variant map turns an `EncounterStatus` key into a UI value; `ENCOUNTER_STATUS_LABELS` is already in `labels.ts` for the companion string map.

**Suggested fix:** Move the map to `lib/ui/labels.ts` as `ENCOUNTER_STATUS_BADGE_VARIANT: Record<EncounterStatus, BadgeVariant>`, co-located with `ENCOUNTER_STATUS_LABELS`. Import it in `encounter-list.tsx`.

### `apps/web/components/campaign/encounter-status-listener.tsx:46-57`
**One full Ably Realtime client + WebSocket per non-ended encounter, unbounded as drafts accumulate**  
*perf · ⚠ unverified · slice: enemies-campaign*

`{encounters.map(({ shortId }) => (<RealtimeChannelListener key={shortId} ... />))}` mounts one listener per non-ended encounter (the page's `activeEncounters` includes every draft, and drafts never transition to ended on their own). Each `RealtimeChannelListener` runs `useRealtimeChannel`, which per instance POSTs `/api/realtime/token` and constructs its own `new Realtime({...})` (hooks/use-realtime-channel.ts:125-142) — a dedicated WebSocket connection per encounter, held open for both the DM view and every member's overview view, including while the tab is hidden. Ably channels are designed to multiplex over a single connection; N independent connections means N token round-trips on every page load, N concurrent connections counted against the Ably connection quota per viewer, and linear growth with a campaign's draft backlog.

**Suggested fix:** Make the subscription count constant per page: either ping a single campaign-scoped channel ({ns}:campaign:{shortId}) for status transitions so this surface needs exactly one listener, or extend the token route/hook to issue a multi-channel capability and share one Realtime client across channels. Short of that, cap the listener set (e.g. live + N most-recent drafts).

### `apps/web/components/campaign/placed-character-card.tsx:55-61`
**portraitSrc re-implements the shared avatarSrc helper (lib/ui/portrait.ts) instead of calling it**  
*conventions, debt · ⚠ unverified · slice: enemies-campaign*

```ts
function portraitSrc(character: OwnedPlacementCharacter): string {
  if (character.portraitUrl) return character.portraitUrl
  const seed = character.name.trim() || character.shortId
  return `https://avatar.vercel.sh/${encodeURIComponent(seed)}`
}
```

apps/web/lib/ui/portrait.ts already exports avatarSrc(portraitUrl, seed) with the identical portrait-or-gradient rule, and its JSDoc states it exists "so the portrait-or-gradient rule lives in one place" — it is consumed by my-characters/character-card.tsx and the combat rail/drawer/zone tokens. This card's own JSDoc even admits the duplication: "(same scheme as the My Characters card)". CLAUDE.md Code Style #8 explicitly calls out duplicating logic that a shared utility covers; if the fallback service or rule changes, this card silently drifts from every other avatar in the app.

**Suggested fix:** Replace the local portraitSrc with `avatarSrc(character.portraitUrl, character.name.trim() || character.shortId)` imported from @/lib/ui/portrait, and delete the local function.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-detail-panel.tsx:238-257`
**Unmet prerequisites are distinguished only by color and an aria-hidden icon**  
*a11y · ✓ verified · slice: cs-surfaces*

`{unmet ? <LockSimpleIcon weight="bold" className="text-muted-foreground" aria-hidden /> : null}` followed by `<span className={unmet ? "text-muted-foreground" : undefined}>{name} Rank {prereq.rank}</span>` — the met/unmet distinction in the Prerequisites list is conveyed solely by an AT-hidden icon plus muted text color; the list item's text content is identical either way. A screen-reader user inspecting a Locked archetype (whose action button only says "Prerequisites not met") cannot tell which prerequisite is the blocker — the central planning information of this panel.

**Suggested fix:** Append a textual state to each item — e.g. sr-only "(not met)" or a visible outline badge like the "Re-select" badge used in inheritance-slots.tsx, which correctly pairs its icon with text.

**Verifier:** The evidence is accurately quoted: lines 246-255 distinguish unmet prerequisites solely by an `aria-hidden` LockSimpleIcon plus `text-muted-foreground` color on a span whose text content (`{name} Rank {prereq.rank}`) is identical for met and unmet items — the `<li>` carries no aria-label/title/role, so a screen reader announces the same string either way. This is a genuine WCAG 1.4.1 (use of color) gap, not an accepted project pattern; CLAUDE.md contains no convention sanctioning color-only or icon-only state encoding. The fix direction is sound and grounded in the codebase's own `inheritance-slots.tsx` (lines 121-127), which correctly pairs its aria-hidden WarningIcon with visible "Re-select" text. Confirmed the Locked action button (archetype-action-button.tsx:70-76) reads only "Prerequisites not met," so this list is the sole place the specific blocker is conveyed; severity is P2 since it degrades a non-critical planning surface rather than causing a correctness/data bug.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-node-card.tsx:71-107`
**Locked cards stack opacity-70 on text-muted-foreground small text — likely below 4.5:1 contrast**  
*a11y · ✓ verified · slice: cs-surfaces*

`muted && "opacity-70"` is applied to the whole card while the 12px tier line (`font-mono text-xs text-muted-foreground`) and the attribute `<dt className="text-muted-foreground">` labels already use the muted token. Light theme `--muted-foreground: oklch(0.5 0.012 270)` (packages/ui/src/styles/globals.css:70) sits near ~4.9:1 against the card background at full opacity; alpha-blending the entire card at 0.7 pushes that small text to roughly 3:1 — under the 4.5:1 minimum — on exactly the Locked cards whose tier/attribute info a planner reads to decide what to pursue next.

**Suggested fix:** Mute locked cards selectively instead of dimming all text: keep text at normal opacity and convey the locked state via the existing badge/border/icon treatment, or define a dedicated locked-foreground token that stays >= 4.5:1.

**Verifier:** The cited code is quoted accurately: line 74 applies `muted && "opacity-70"` to the whole locked card, and the small text it dims uses `text-muted-foreground` at `text-xs` (12px) on lines 88-89 and 101. I computed the OKLCH→sRGB contrast: light-theme muted-foreground on the card is 5.75:1 at full opacity but drops to 3.05:1 when the card is alpha-composited at 0.7 (dark theme: 5.48→3.34), both under the 4.5:1 AA minimum for normal text. The locked card is a fully interactive button (rendered with `onSelect`, no `disabled`), so the WCAG "inactive component" exemption that covers every other opacity-50/70 use in packages/ui does not apply here; no project convention sanctions opacity-dimming active content. The suggested fix (convey locked state via the existing badge/border/icon instead of dimming all text, or a dedicated >=4.5:1 token) is sensible and matches the file's existing StateBadge/LockSimpleIcon treatment.

### `apps/web/components/character-sheet/combat-state/ailment-editor.tsx:26-48, 122-125`
**Rulebook ailment-exclusivity rule (one ailment at a time; Downed stacks) is implemented only in the UI layer**  
*conventions · ⚠ unverified · slice: cs-state*

`withDownedToggled` and `withNonDownedSelection` (lines 33-48) implement the rule from packages/rules "3.7 Ailments, Technicals, & Saving Throws.md": "A character cannot be afflicted with more than one Ailment; the most recent Ailment takes priority... The Downed ailment is an exception" — `withNonDownedSelection` is precisely "most recent takes priority" (replace), and the popover copy hardcodes the rule text ("One at a time. Downed stacks with another.", line 124). The component's own JSDoc concedes "The server schema is intentionally permissive (state.ts:122-129)", i.e. the engine enforces nothing — this component is the rule's only home. CLAUDE.md: "Never put game logic in the UI layer. The UI should simply render what the game engine provides it." The cost is already visible: the encounter surface's shared editor (apps/web/components/combat/conditions-controls.tsx, AilmentPicker) re-decided the same question the other way ("Track any combination — the app doesn't enforce one at a time"), so the two surfaces disagree about a rulebook rule and any future surface (command palette, DM tools) must re-derive it.

**Suggested fix:** Move the selection semantics into a pure engine helper (e.g. packages/game/src/engine/character/ailment-selection.ts exporting toggleDowned/selectAilment over readonly string[]), unit-tested in the package, and have the editor call it. If finding 1's per-field actions are adopted, the server-side merge is the natural place for the engine helper to run, resolving both findings at once.

### `apps/web/components/character-sheet/explore/explore-tab.tsx:53-59`
**Scroll-spy pins the highlight to the LAST section whenever the page doesn't scroll at all**  
*correctness, debt · ✓ verified · slice: cs-surfaces*

`const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2; if (atBottom) { setActive(STORY_SECTIONS[STORY_SECTIONS.length - 1]!.id); return }`. When the whole Explore tab fits in the viewport (sparse character — "None recorded." cards — on a tall display), `scrollY` is 0 and `scrollHeight <= innerHeight`, so `atBottom` is true from the very first `resolve()` on mount. The jump nav then permanently highlights "Notes" while the user is looking at Identity at the top, and clicking any nav item can never change it (there is nothing to scroll). The bottom-out override is documented as covering "a short final section [that] can't be scrolled past the probe line" — i.e. it assumes the page scrolls; the no-scroll degenerate case inverts the highlight.

**Suggested fix:** Only apply the bottom-out override when the document is actually scrollable, e.g. `const scrollable = document.documentElement.scrollHeight > window.innerHeight + 2; if (scrollable && atBottom) { … }` — otherwise fall through to the probe loop, which correctly resolves the first section.

**Verifier:** Evidence is quoted verbatim (explore-tab.tsx:53-59). The bug is real: `documentElement.scrollHeight` is at least `innerHeight`, so when the Explore tab fits entirely in the viewport (sparse character — empty "None recorded." cards — on a tall display) with `scrollY === 0`, the condition `innerHeight + 0 >= scrollHeight - 2` holds on the very first `resolve()` at mount, pinning `active` to the last section ("Notes"). JumpNav (jump-nav.tsx:61) drives the highlight off that `active`, and clicking a nav item calls `window.scrollTo` on an unscrollable page so no scroll event re-runs `resolve()` — the highlight is permanently wrong and unrecoverable. Inactive tab panels are unmounted (sheet-tabs.tsx), so the document height really is just the Explore content, making the degenerate case reachable; the suggested fix (gate the bottom-out override on `scrollHeight > innerHeight + 2` so it falls through to the probe loop, which resolves the first section at scroll 0) is sound. Severity P2 rather than higher because it only triggers on the narrow combination of a sparse character plus a viewport tall enough to fit the whole tab — content-rich characters scroll and behave correctly.

### `apps/web/components/character-sheet/explore/jump-nav.tsx:42-49`
**JumpNav unconditionally preventDefaults clicks, hijacking modifier-key clicks and never committing the hash**  
*correctness, a11y · ✓ verified · slice: cs-surfaces*

`const jumpTo = (id: string) => (event: React.MouseEvent) => { const el = document.getElementById(id); if (!el) return; event.preventDefault(); … window.scrollTo({ top, behavior: "smooth" }) }`. The handler never checks `event.metaKey / ctrlKey / shiftKey / altKey / button !== 0`, so a cmd/ctrl-click intended to open the anchor in a new tab is swallowed and converted into a same-tab smooth scroll. The component's own JSDoc claims `href="#id"` "keeps it a real link for keyboard and middle-click" — middle-click survives only because it fires `auxclick`, but every modified left-click is hijacked. The unconditional preventDefault also means the `#explore-…` hash never reaches the URL, so the link affordance (copy-link via right-click works, but clicking never produces a shareable/back-navigable URL state) is half-broken relative to what the markup advertises.

**Suggested fix:** Bail out before preventDefault for non-plain activations: `if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return`. Optionally follow the scroll with `history.replaceState(null, "", `#${id}`)` so the URL reflects the jumped-to section.

**Verifier:** The evidence is quoted verbatim (jump-nav.tsx:42-49) and the JSDoc claim at lines 27-33 is real. The handler calls event.preventDefault() unconditionally after the !el guard, with no check for metaKey/ctrlKey/shiftKey/altKey or event.button, so cmd/ctrl-clicks on the real `<a href="#id">` fire onClick and have their open-in-new-tab default cancelled — a genuine hijack of a standard link affordance. Confirmed there is no history.replaceState/pushState anywhere in the file or its parent ExploreTab, so the #id hash never commits to the URL; the parent does render real id anchors with scroll-mt. This is the only smooth-scroll anchor handler in the codebase, so it is not an accepted documented pattern, and the suggested guard (bail before preventDefault on modified/non-primary clicks) is the standard correct fix.

### `apps/web/components/character-sheet/explore/talents.tsx:155-233`
**AddTalentPopover hand-rolls a searchable picker instead of using the packages/ui Combobox used for the identical job in the same slice**  
*conventions, a11y · ✓ verified · slice: cs-surfaces*

AddTalentPopover builds the search-and-pick interaction by hand: a raw `<Input autoFocus value={query} ...>` over `const filtered = needle ? remaining.filter((option) => option.label.toLowerCase().includes(needle)) : remaining`, rendered as a `<ul className="max-h-64 overflow-y-auto">` of plain `<button>` rows, with a hand-written empty state (`No matching Talents.`) and manual query reset on close (`if (!next) setQuery("")`). The repo has `@workspace/ui/components/combobox` (and `command.tsx`) for exactly this pattern — `inheritance-slots.tsx` in this same slice builds the equivalent "search a list, pick one, fire a per-field write" flow on `Combobox`/`ComboboxInput`/`ComboboxEmpty`/`ComboboxList` (lines 263-311), and the Combobox primitive predates the last touch of talents.tsx (combobox.tsx committed 2026-05-24; talents.tsx last modified 2026-06-07). CLAUDE.md Habits: "When building UI components, see if there is a shadcn/ui component that already does what you need." The hand-rolled version also silently lacks the Base UI listbox behavior (typeahead/arrow-key navigation/active-item semantics) the primitive provides, so the two pickers in the same feature behave differently.

**Suggested fix:** Rebuild AddTalentPopover on @workspace/ui/components/combobox (the SlotPicker in inheritance-slots.tsx is the in-slice worked example): items = remaining, itemToStringLabel = option.label, onValueChange = onPick. Deletes the manual filter, empty-state, and query-reset code.

**Verifier:** The cited code is quoted verbatim (talents.tsx:155-233): the raw `<Input autoFocus value={query}>`, the `filtered` expression, the `<ul className="max-h-64 overflow-y-auto">` of plain `<button>` rows, the "No matching Talents." empty state, and the `if (!next) setQuery("")` reset all match. The Combobox primitive exists (packages/ui/src/components/combobox.tsx, committed 2026-05-24, predating talents.tsx's last touch 2026-06-07) and is used for the same picker-fires-a-write pattern in inheritance-slots.tsx; even more tellingly, builder/movements/ortus/talents-picker.tsx picks the SAME TalentKey domain through the SAME addGainedTalentAction/removeGainedTalentAction on a Combobox and reuses the identical "No matching Talents." ComboboxEmpty string — so the hand-rolled version diverges from a same-domain, same-write-path precedent with no CLAUDE.md exception or code comment justifying it (CLAUDE.md explicitly says "see if there is a shadcn/ui component that already does what you need"). The fix direction is sensible and the a11y point holds (Base UI Combobox gives listbox/arrow-key/active-item semantics the bare `<ul>`/`<button>` list lacks). The finder's "same slice" framing is slightly off (inheritance-slots is in archetypes/, not explore/), but that is a framing nit, not a substance error, and the closer talents-picker precedent more than compensates.

### `apps/web/components/character-sheet/explore/talents.tsx:131-151`
**Inherited-Talent state is conveyed only by an aria-hidden icon**  
*a11y · ✓ verified · slice: cs-surfaces*

`{inherited ? <LockIcon weight="bold" className="size-3 opacity-60" aria-hidden /> : null}` — this lock icon is the sole marker that a chip is granted by the active Archetype (the JSDoc: "Talents granted by the active Archetype are marked inherited and stay locked"), and it is hidden from AT with no text alternative; the chip's accessible content is just the label. The absence of a remove button is not an announcement, and for non-owners no chip has a remove button at all, so screen-reader users cannot distinguish inherited Talents from explicitly-gained ones on any view.

**Suggested fix:** Add sr-only text to the chip when inherited (e.g. `<span className="sr-only">, inherited from Archetype</span>`) or an aria-label on the Badge that includes the inherited state.

**Verifier:** The evidence is accurately quoted: talents.tsx:136-138 renders the lock icon with aria-hidden, and the chip's only accessible content is <span>{label}</span> (line 139) — no sr-only text or aria-label conveys the inherited state, and for non-owners no chip has a remove button, so the inherited/gained distinction is invisible to AT on every view. The engine's `inherited` flag (display.ts) is a real semantic distinction (Archetype-granted, ordered first), confirming this isn't decorative noise. This runs counter to the project's documented a11y pattern: the sibling virtues.tsx deliberately pairs every aria-hidden icon/meter with an accessible text counterpart, and the suggested sr-only/aria-label fix matches that convention. It's genuine a11y information loss, but narrow — the label is still announced; only the secondary "granted by Archetype" status is dropped — so it's below an outright a11y blocker.

### `apps/web/components/character-sheet/level-up-dialog.tsx:58-66`
**Level-up transition math recomposed in the UI instead of using the engine's pure applyLevelUp**  
*conventions · ⚠ unverified · slice: cs-root*

The dialog hand-computes the post-level-up state: `const nextLevel = character.level + 1`, `const nextMaxHP = character.maxHP + pathStats.hpPerLevel`, `const nextMaxHitDice = computeMaxHitDice(nextLevel)`, `const nextVictories = character.victories - VICTORIES_PER_LEVEL`, `const nextSavedRanks = character.savedArchetypeRanks + ARCHETYPE_RANKS_PER_LEVEL`. This duplicates, line for line, the rule transition in `packages/game/src/engine/character/leveling.ts` `applyLevelUp` (lines 77-87: `victories: character.victories - VICTORIES_PER_LEVEL`, `savedArchetypeRanks: character.savedArchetypeRanks + ARCHETYPE_RANKS_PER_LEVEL`, `hitDiceRemaining: computeMaxHitDice(level)` …). `applyLevelUp` is pure, exported through the engine barrel (`engine/index.ts` line 9: `export * from "./character/leveling"`), and unused here. CLAUDE.md: "Never put game logic in the UI layer. The UI should simply render what the game engine provides it." If the level-up rule changes structurally (e.g. rank grants become tier-dependent, dice no longer refill, carryover changes), this preview silently shows numbers different from what confirming actually applies — the dialog is literally a confirmation of "the deterministic state change" per its own JSDoc.

**Suggested fix:** Build the preview from the engine: call `applyLevelUp(character)` (pure, already exported) for next victories / saved ranks / dice, and keep only the max-HP/SP display delta on `getPathStats` (which the engine JSDoc explicitly blesses for UI display). Alternatively add a `previewLevelUp(character)` helper next to `applyLevelUp` in packages/game/src/engine/character/leveling.ts and render its output.

### `apps/web/components/character-sheet/level-up-dialog.tsx:47-55`
**Prop-drilling HydratedCharacter into LevelUpDialog — same CLAUDE.md convention violation as RestDialog**  
*debt · ⚠ unverified · slice: cs-root*

```ts
export function LevelUpDialog({ character, open, onOpenChange }: { character: HydratedCharacter; ... })
```

Accesses character.level, character.pathChoice, character.maxHP, character.maxSP, character.hitDiceRemaining, character.maxHitDice, character.skillDiceRemaining, character.maxSkillDice, character.savedArchetypeRanks, character.victories, character.id, character.progressionVersion, character.vitalsVersion. All come from the same CharacterProvider context.

**Suggested fix:** Same as RestDialog: remove the `character` prop, add `const character = useCharacter()` inside the dialog. The only wrinkle is that LevelUpDialog also calls broadcastCharacterVersion directly (cross-class write, intentional per the JSDoc) — that doesn't change with this refactor.

### `apps/web/components/character-sheet/mechanics/healer/dawn-mode-toggle.tsx:1-57`
**Structural DRY violation: `DawnModeToggle` and `DuskModeToggle` are near-identical**  
*debt · ⚠ unverified · slice: cs-state*

diff of dawn-mode-toggle.tsx vs warlock/dusk-mode-toggle.tsx shows the two files are structurally identical — identical Toggle markup, cn() class-merge logic, icon swap pattern, dispatch shape — differing only in colour token (amber vs violet), edit kind (pathOfDawn vs pathOfDusk), prop name (dawnMode vs duskMode), and action import. The long Tailwind class string that controls the active colour (including aria-pressed and data-[state=on] variants) must be replicated and kept in sync in both files.

**Suggested fix:** Extract a `ModeToggle` primitive that accepts `mode: 'dawn' | 'dusk'`, `active: boolean`, `disabled: boolean`, and `onToggle`. Drive the colour token and label strings from a small config object keyed by mode. `DawnModeToggle` and `DuskModeToggle` become thin wrappers that supply the edit/action dispatch and pass `mode='dawn'|'dusk'`.

### `apps/web/components/character-sheet/mechanics/path-of-dawn-widget.tsx:25-48`
**Structural DRY violation: `DawnModeBadge` and `DuskModeBadge` are near-identical**  
*debt · ⚠ unverified · slice: cs-state*

The two `*ModeBadge` helper functions (path-of-dawn-widget.tsx:25-48, path-of-dusk-widget.tsx:25-48) share identical structure: a conditional className ternary with the same base classes (inline-flex items-center gap-1 rounded-md … px-2 py-0.5 text-sm font-medium), icon swap, and label. They differ only in colour token (bg-amber-500/15 / text-amber-700 vs bg-violet-500/15 / text-violet-700) and the mode label string. Any styling change (padding, font-size, border-radius) must be applied twice.

**Suggested fix:** Co-locate with the ModeToggle finding above. One `ModeStatusBadge` component accepting `mode: 'dawn' | 'dusk'` and `active: boolean` handles both read-only surfaces.

### `apps/web/components/character-sheet/mechanics/widget-registry.tsx:89-92`
**Dead export: `summarizeMechanicState` has zero importers**  
*debt · ⚠ unverified · slice: cs-state*

```ts
export function summarizeMechanicState(state: MechanicState): string {
  const entry = REGISTRY[state.kind] as MechanicWidgetEntry<MechanicKind>
  return entry.summary(state)
}
```

Grep of entire monorepo (apps/web + packages) finds no importer. The registry's `summary` field (and all per-mechanic summary lambdas) exist solely to serve this dead function.

**Suggested fix:** Delete `summarizeMechanicState` and the `summary` field from `MechanicWidgetEntry`/`MechanicWidgetRegistry`. If a mechanic summary surface is added later (e.g. an archetypes-tab info card), re-introduce it at that point with a concrete consumer.

### `apps/web/components/character-sheet/rest-dialog.tsx:56-64`
**RestDialog and LevelUpDialog take the whole HydratedCharacter as a prop instead of reading useCharacter()**  
*conventions, debt · ⚠ unverified · slice: cs-root*

`export function RestDialog({ character, … }: { character: HydratedCharacter; … })` (and identically LevelUpDialog, level-up-dialog.tsx lines 47-55) receive the full hydrated character from header-owner-actions.tsx (lines 252-261), which itself read it via `useCharacter()`. Both dialogs render strictly inside the sheet's CharacterProvider, and every sibling section in this slice (Skills, Vitals, CombatState, Archetypes, SheetHeader, RanksBanner) reads `useCharacter()` directly. CLAUDE.md: "Avoid prop-drilling. `HydratedCharacter` is supplied via `useCharacter()`." Re-plumbing the object by prop creates a second supply path for the same context value and widens both dialogs' signatures for no behavioral gain (the parent re-renders on the same context updates, so there's no staleness benefit either).

**Suggested fix:** Drop the `character` prop from RestDialog and LevelUpDialog and call `const character = useCharacter()` inside each, matching every other sheet section; header-owner-actions then passes only `open`/`onOpenChange`.

### `apps/web/components/character-sheet/rest/partial-rest-form.tsx:14-86`
**Structural DRY violation: `PartialRestForm` and `RespiteForm` are near-identical**  
*debt · ⚠ unverified · slice: cs-state*

diff of the two files shows ~80 lines (state declarations, validateDiceInput calls, submit guard, grid layout, two Input+Label pairs, Button) are identical — differing only in prop names (skillDie/skillDiceRemaining vs hitDie/hitDiceRemaining), element labels ("Skill Dice to spend" / "SP recovered" vs "Hit Dice to spend" / "HP recovered"), and button text. Any bug or styling change (e.g. aria-invalid behaviour, min/max clamping, input type) must be fixed in two places.

**Suggested fix:** Extract a shared `DiceSpendForm` that accepts `diceLabel`, `recoveryLabel`, `diceMax`, `submitLabel`, `onSubmit(diceSpent, recovered)` and `disabled`. Both forms become thin wrappers that supply those strings. The `validateDiceInput` calls and the two-field grid live once.

### `apps/web/components/character-sheet/rest/validate-dice-input.ts:8-16`
**validateDiceInput truncates non-integer numeric strings via parseInt — value submitted differs from value displayed, with no invalid flag**  
*correctness · ✓ verified · slice: cs-state*

`const value = Number.parseInt(raw, 10); const invalid = !Number.isFinite(value) || value < 0 || (max !== undefined && value > max)`. `parseInt` stops at the first non-digit, so legal `type="number"` input strings pass validation while submitting a different number than the user sees: "2.5" → value 2, invalid=false (input still displays 2.5); "1e3" → value 1, invalid=false (browsers accept e-notation in number inputs; the user meant 1000). PartialRestForm/RespiteForm then call `onSubmit(diceSpentParsed, spRecoveredParsed)` with the truncated number — e.g. a player typing an HP roll of "1e1" records 1 HP instead of 10, silently, and the server accepts it because the post-truncation value is a valid integer. The companion test file only exercises clean integers, "", and "abc", so the gap is untested.

**Suggested fix:** Parse with Number(raw) and add an integrality check: `const value = Number(raw); const invalid = !Number.isInteger(value) || value < 0 || (max !== undefined && value > max)`. Number("2.5") → 2.5 and Number("1e3") → 1000, so non-integers are flagged invalid instead of truncated and e-notation parses to what the user sees. Add test cases for "2.5" and "1e3".

**Verifier:** Evidence is quoted verbatim and accurate: validate-dice-input.ts:12-14 uses Number.parseInt, and PartialRestForm/RespiteForm display the raw string (value={diceSpent}) while submitting the truncated diceSpentParsed. For type=number inputs, both "2.5" (valid float) and "1e3"/"1e1" (the HTML5 float grammar includes exponent form) are retained as .value, so parseInt truncates "2.5"→2 and "1e3"→1 with invalid=false — the user sees one number and submits another. I confirmed the server does not catch it: rest.schema reuses the engine's z.int().min(0) schema, and the post-truncation value is a valid non-negative integer, so it passes. No CLAUDE.md pattern sanctions this, the companion test only covers clean integers/""/abc, and the suggested Number(raw)+Number.isInteger fix correctly flags 2.5 and parses 1e3 to what is displayed.

### `apps/web/components/character-sheet/sheet-header.tsx:55-66`
**Portrait rendered as raw <img> (Base UI AvatarImage) downloads the full, un-resized blob (up to 1 MB) for an 80px avatar on the hottest surface**  
*perf · ⚠ unverified · slice: cs-root*

Non-owner branch: `<Avatar className="size-20 rounded-none"><AvatarImage src={character.portraitUrl ?? undefined} ...` — Base UI's AvatarImage renders a plain `<img>`, so the original upload is fetched at full size for an 80px (`size-20`) avatar. Uploads are stored as-is with no resizing (`lib/storage/portrait-upload.ts`: `MAX_PORTRAIT_BYTES = 1 * 1024 * 1024`, `put(...)` of the raw file), so a portrait can be a full 1 MB. The repo already wired the optimization path for exactly these images: `next.config.ts` whitelists `*.public.blob.vercel-storage.com` under `images.remotePatterns` with the comment "Uploaded character portraits (UNN-204)", and `components/my-characters/character-card.tsx` renders the same portraits via `next/image` with `width={64} height={64}`. `/c/{shortId}` is the public, shareable, signed-out-visible page (and `components/combat/watch-sheet-column.tsx` renders this same `SheetHeader` once per owned sheet on the polling watch view), so this is the surface where the unoptimized original costs the most. The owner branch has the identical issue in `editable-portrait.tsx` lines 101-110 (`<AvatarImage src={portraitUrl ?? undefined} ...` inside the dropdown trigger).

**Suggested fix:** Serve the header portrait through `next/image` (the `character-card.tsx` pattern: explicit width/height ≈ 80-160 to cover DPR, `object-cover`, fallback to initials on error), either by composing it into the Avatar primitive via its render prop or by dropping the Avatar primitive for this one slot. Apply to both the NonOwner branch in sheet-header.tsx and the owner trigger in editable-portrait.tsx so the two never show different bytes for the same portrait.

### `apps/web/components/character-sheet/vitals.tsx:34,44`
**HP and SP progress bars are unnamed progressbar roles**  
*a11y · ✓ verified · slice: cs-root*

<Progress value={percent(character.currentHP, character.maxHP)} /> and the SP twin. Base UI's Progress.Root renders role="progressbar" (verified in node_modules/@base-ui/react/esm/progress/root/ProgressRoot.js) and is named only via aria-labelledby from a ProgressLabel child, which is never supplied. The "HP" / "SP" text lives in sibling <span>s outside the widget, so AT users encounter two anonymous "progress bar, N%" widgets with no way to tell which pool each represents from the widget itself (4.1.2 name).

**Suggested fix:** Pass an accessible name through to the root: <Progress aria-label="HP" .../> and <Progress aria-label="SP" .../> (Progress forwards ...props to ProgressPrimitive.Root).

**Verifier:** Evidence is accurately quoted: vitals.tsx:34,44 render <Progress value={...}/> with no naming prop, and "HP"/"SP" live in sibling spans. Base UI's ProgressRoot.js confirms it always emits role="progressbar" and is named only via aria-labelledby from a ProgressLabel child (labelId is undefined when no label child registers); aria-valuetext carries the percent value, not a name. So AT users get two anonymous "progress bar, N%" widgets — a real WCAG 4.1.2 name gap, with no CLAUDE.md convention accepting it. The suggested fix works because the wrapper spreads ...props to Root and Base UI applies elementProps after defaultProps, so aria-label supplies the missing name.

### `apps/web/components/combat/combat-console.tsx:121-144`
**DM console opens one full Ably Realtime client (own WebSocket + token POST) per PC combatant, plus one for the encounter channel**  
*perf · ⚠ unverified · slice: combat-root*

`const pcChannelIds = session.combatants.flatMap(...)` followed by `{pcChannelIds.map(({ characterId, shortId }) => (<RealtimeChannelListener key={shortId} domain="character" shortId={shortId} onPing={(data) => onPcPing(characterId, data)} />))}` mounts one listener per PC combatant, and `useCombatConsole` mounts another for the encounter channel. Each `useRealtimeChannel` instance constructs its own client inside its effect (hooks/use-realtime-channel.ts:125: `const realtime = new Realtime({ authCallback... })`), and each `BaseRealtime` is a separate WebSocket connection with its own `/api/realtime/token` POST, its own keep-alive traffic, its own reconnect lifecycle, and its own slot against Ably's concurrent-connection quota. A 5-PC encounter = 6 sockets and 6 token round-trips from one DM tab (and 6 more POSTs on every token expiry); Ably channels are designed to multiplex over a single connection, and Ably's own guidance flags per-component client creation as an anti-pattern. The JSDoc on RealtimeChannelListener advertises exactly this dynamic-list composition, so the cost scales linearly with party size by design.

**Suggested fix:** Share one Realtime client per page and attach/detach channels on it: lift client creation into a context provider (or module-level lazy singleton keyed by token route availability) and make `useRealtimeChannel`/`RealtimeChannelListener` subscribe a channel on the shared connection. The token route would need to issue a token whose capability covers the requested channels (or use one wildcard-scoped token per surface); connection count then drops from N+1 to 1 regardless of roster size. The fix lands in hooks/use-realtime-channel.ts, but the console's per-PC listener list is the multiplier that makes it worth doing.

### `apps/web/components/combat/combatant-rail-row.tsx:140-165`
**Combatant avatar (PC portrait / enemy initials square) implemented three times with identical logic**  
*debt · ⚠ unverified · slice: combat-root*

Three private functions — `Token` (combatant-rail-row.tsx:140), `HeaderAvatar` (combatant-drawer.tsx:169), `TokenAvatar` (zone-layout.tsx:139) — share the exact same rendering formula: isPc → next/image with avatarSrc; enemy → side-tinted initials span (bg-primary/10 text-primary vs bg-destructive/10 text-destructive). The only difference is pixel size (36/40/20). If the side-color formula changes (e.g. a third side, or neutral-party color) it must be updated in three places.

**Suggested fix:** Create `components/combat/combatant-token.tsx` exporting `CombatantToken({ isPc, portraitUrl, name, id, side, size })`. The three existing private functions become thin call-sites. Size could be a union of the three valid values or just a number. This is the pattern the CLAUDE.md memory already flagged in a prior survey (avatarSrc/initials dup).

### `apps/web/components/combat/combatant-vitals-section.tsx:196-226`
**Enemy vitals controls compose absolute post-state and game-rule clamping client-side instead of delta events clamped in the engine**  
*conventions · ⚠ unverified · slice: combat-root*

`onDecrement={(amount) => onAdjust(id, "currentHP", hp.current - amount)}`, `onIncrement={(amount) => onAdjust(id, "currentHP", Math.min(hp.max, hp.current + amount))}`, `onDecrement={(amount) => onAdjust(id, "maxHP", Math.max(0, hp.max - amount))}`. Two convention violations. (1) CLAUDE.md's owner-mode rule says writes must not build the full post-state from optimistic values in a closure (UNN-226 cautionary tale); the sibling counters section in this same drawer explicitly documents the rule: "Stepper buttons send a **delta** (±1), never an absolute, so back-to-back taps merge on the server instead of overwriting" (combatant-counters-section.tsx:33-35). Here the absolute new HP is computed from the closure's `hp.current`, so a second adjustment whose closure predates the first's optimistic re-render (or whose predecessor's write failed and reverted) silently overwrites instead of merging. (2) The clamping rules are split between layers: the reducer (packages/game/src/engine/encounter/reduce/enemy-vitals.ts:37) floors at 0 and drags current down when max drops, but never caps `currentHP` at `maxHP` — the "can't heal past max" rule exists only in this component's `Math.min(hp.max, ...)`, violating "Never put game logic in the UI layer. The UI should simply render what the game engine provides it." The UI's `Math.max(0, hp.max - amount)` also duplicates the reducer's floor.

**Suggested fix:** Give the engine delta semantics — e.g. `adjustEnemyVitals` variants carrying `{ field, delta }` (or dedicated damage/heal events) with the reducer owning both the 0-floor and the cap-at-max — and have the popover callbacks pass the raw entered amount, exactly as CombatantCountersSection already does.

### `apps/web/components/combat/combatant-vitals-section.tsx:202-208`
**Enemy heal max-HP clamp is a game rule enforced only in the UI layer**  
*conventions · ⚠ unverified · slice: combat-root*

The heal control computes the clamp itself: `onIncrement={(amount) => onAdjust(id, "currentHP", Math.min(hp.max, hp.current + amount))}` — while the damage control delegates the floor to the engine: `onDecrement={(amount) => onAdjust(id, "currentHP", hp.current - amount)}` (the reducer applies `Math.max(0, event.value)`). The engine reducer that owns enemy vitals (packages/game/src/engine/encounter/reduce/enemy-vitals.ts:37-43) floors every field at 0 and clamps `current` to `max` only when *max is lowered* (`statBlock.currentHP = Math.min(statBlock.currentHP, value)` in the `maxHP` case); a direct `currentHP` set is `statBlock.currentHP = value` with no max clamp. So the rule "healing cannot exceed max HP" exists nowhere in the engine — the component is its sole enforcer, split-brained against the 0-floor which lives in the reducer. Any other dispatcher of `adjustEnemyVitals` (the server action applies the same reducer verbatim) can overheal past max. CLAUDE.md: "Never put game logic in the UI layer. The UI should simply render what the game engine provides it."

**Suggested fix:** Move the clamp into `reduceEnemyVitalsEvent`: in the `currentHP` case, clamp to the combatant's effective `maxHP` (for catalog enemies, the inline `maxHP ?? definition maxHP`), mirroring how the 0-floor and the lower-max drag-down already live there. The component then sends `hp.current + amount` symmetrically with the damage path.

### `apps/web/components/combat/combatant-vitals-section.tsx:168-225`
**Enemy vitals controls compose absolute post-state from the optimistic closure value, contradicting the repo's documented UNN-226 lesson**  
*conventions · ⚠ unverified · slice: combat-root*

Every enemy control POSTs an absolute computed from the render-closure `hp`: `onAdjust(id, "currentHP", hp.current - amount)`, `Math.min(hp.max, hp.current + amount)`, `Math.max(0, hp.max - amount)`, `hp.max + amount`. The sibling section in the same drawer documents why this is the banned pattern — combatant-counters-section.tsx:33-35: "Stepper buttons send a **delta** (±1), never an absolute, so back-to-back taps merge on the server instead of overwriting (the UNN-226 lesson)." And the PC half of this very file uses delta-based per-field actions (`damageAction`/`healAction` take `amount`). CLAUDE.md's owner-mode write convention: "do not have each control compose the full post-state from `useOptimistic`'s value in a closure and POST that — back-to-back clicks read a stale outer-scope value, the second write silently overwrites the first." Two rapid damage taps that land before the optimistic re-render both compute from the same `hp.current`, so one is silently lost.

**Suggested fix:** Make the enemy HP adjustments delta-based: either extend `adjustEnemyVitals` (or add a sibling event) to carry a signed delta the reducer applies and clamps, matching `adjustCounter`'s shape, then have the popover pass `±amount` straight through with no client-side arithmetic.

### `apps/web/components/combat/enemies/enemy-catalog-browser.tsx:98-125`
**Commit clears queue entries added during the in-flight save — silent data loss**  
*correctness · ✓ verified · slice: enemies-campaign*

commit() snapshots the queue at click time and, on success, wipes the entire store: `const newCombatants: CombatantSetup[] = queue.queue.flatMap(...)` … `const saved = await addSetupCombatantsAction(...)` … `queue.clear()`. While the action is awaited, every other mutation control stays enabled — EnemyQueueRail only disables Commit/Cancel (`disabled={totalCount === 0 || isPending}` / `disabled={isPending}`; the +/−/X steppers at enemy-queue-rail.tsx:88-114 have no disabled prop), and the master list's per-row "Queue" buttons and the statblock card's add button are likewise live. So if the DM queues another creature during the server round-trip, it is never included in `newCombatants` but `queue.clear()` (line 119) deletes it from localStorage anyway — the staged selection is silently lost, contradicting the queue's stated reload-safe contract. The success toast also reports the click-time `queue.totalCount`, so nothing hints at the dropped entry.

**Suggested fix:** Either disable all queue mutation while `isPending` (pass it to EnemyQueueRail's steppers, EnemyCatalogList's add buttons, and the statblock card), or replace the blanket `queue.clear()` with a targeted decrement of exactly the committed `{enemyKey, count}` pairs so anything staged mid-flight survives.

**Verifier:** All cited facts check out: commit() (enemy-catalog-browser.tsx:98-125) snapshots queue.queue at transition start, awaits the server write, then calls queue.clear() which unconditionally wipes the whole localStorage queue via update(() => []) (use-encounter-enemy-queue.ts:119-121). During the await, every Queue control stays live — the rail's +/−/X steppers (enemy-queue-rail.tsx:88-114), the master-list EnemyRow Queue button (enemy-catalog-list.tsx:196-206), and the statblock card add button (enemy-statblock-card.tsx:52-58) have no disabled prop and EnemyCatalogList isn't even passed isPending. So an enemy queued mid-flight is excluded from newCombatants yet deleted by clear(), and the success toast reports the click-time totalCount — silent loss of staged input, directly contradicting the hook's documented reload-safe contract (use-encounter-enemy-queue.ts:64-70). This is not an accepted project pattern, and both suggested fixes (disable mutation while pending, or targeted decrement of committed pairs) are sensible.

### `apps/web/components/combat/enemies/enemy-statblock-card.tsx:79-105`
**EnemyAvatar hand-rolls an initials avatar and duplicates the shared initials() helper**  
*conventions, debt · ⚠ unverified · slice: enemies-campaign*

```ts
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
}
```

apps/web/lib/ui/initials.ts already exports an initials() helper whose JSDoc declares it the shared initials rule, and the sibling campaign file roster-list.tsx uses it together with the packages/ui Avatar/AvatarFallback primitive for exactly this "initials token" job. EnemyAvatar instead hand-rolls a div plus a near-identical private copy of the helper (differing only in the `.filter(Boolean)` step), violating both the shadcn-first convention ("see if there is a shadcn/ui component that already does what you need") and Code Style #8 on duplicated logic. The two initials implementations can drift independently.

**Suggested fix:** Delete the private initials() and import it from @/lib/ui/initials. Consider rendering the token with Avatar/AvatarFallback (className overrides give the square destructive styling) to match roster-list.tsx; at minimum, the helper reuse is the fix.

### `apps/web/components/combat/enemies/enemy-statblock-card.tsx:78-97`
**`EnemyAvatar` is co-located with `EnemyStatblockCard` but exported to two unrelated sibling files — wrong granularity seam**  
*debt · ⚠ unverified · slice: enemies-campaign*

```ts
export function EnemyAvatar({ name, className }: { ... }) { ... }
// imported by:
//   enemy-catalog-list.tsx: import { EnemyAvatar } from "./enemy-statblock-card"
//   enemy-queue-rail.tsx: import { EnemyAvatar } from "./enemy-statblock-card"
```

`EnemyAvatar` is a pure visual primitive (an initials square) that has nothing to do with a full statblock. `enemy-catalog-list` and `enemy-queue-rail` reach into the statblock-card module purely to get this atom — creating a coupling where adding the list or queue requires the statblock's dependencies to resolve.

**Suggested fix:** Extract `EnemyAvatar` into its own file (e.g. `enemy-avatar.tsx`) in the `enemies/` directory, or co-locate it with the shared `lib/ui/` primitives. All three consumers then import from a neutral location rather than reaching through the statblock-card's file.

### `apps/web/components/combat/import-pcs-panel.tsx:61-72`
**Repeated "Add"/"Added" buttons lack per-character accessible names**  
*a11y · ✓ verified · slice: combat-root*

`<Button size="sm" variant={added ? "secondary" : "outline"} onClick={() => onToggle(character.id)}>{added ? <CheckIcon .../> : <PlusIcon .../>}{added ? "Added" : "Add"}</Button>` — every row's button is named just "Add" or "Added". A screen-reader user navigating by control (Tab or buttons rota) hears an undifferentiated list of "Add" buttons with no character context. Notably the rest of this slice consistently disambiguates (`aria-label={`Remove ${zone.name}`}`, `aria-label={`Draft ${row.name}`}`); this panel is the outlier.

**Suggested fix:** Add `aria-label={added ? `Remove ${character.name} from the roster` : `Add ${character.name} to the roster`}` (or equivalent) to the toggle button.

**Verifier:** The evidence is quoted exactly (import-pcs-panel.tsx:61-72): each row's toggle button's accessible name is just "Add" or "Added" with no character context, so a screen-reader user navigating control-by-control hears an undifferentiated list. The rest of the combat slice consistently disambiguates per-row controls by embedding the entity name — confirmed by grep: zones-panel `Remove ${zone.name}`, turn-order-strip `Draft ${row.name}`, and most tellingly the directly analogous enemy-catalog-list Add/icon button uses `aria-label={`Queue ${row.name}`}`. No aria-labelledby/id wrapper exists to supply context, and CLAUDE.md documents no exception, so this panel is a genuine outlier. I down-rate from a P1 blocker because the buttons carry visible text and remain operable; the cost is degraded SR navigation plus a clear convention deviation, which is P2.

### `apps/web/components/combat/import-pcs-panel.tsx:28-35`
**Shipped feature's empty state renders the dev placeholder stub, showing "Placeholder — built in UNN-298" to the DM**  
*conventions · ⚠ unverified · slice: combat-root*

When the campaign has no placed characters, the built Import-PCs panel returns `<SetupPanelStub title="Import PCs" ticket="UNN-298"> <p>No characters are placed in this campaign yet.</p> </SetupPanelStub>`. `SetupPanelStub` (setup-panels.tsx:39-41) unconditionally renders `Placeholder — built in {ticket}.` before its children, so the DM sees the contradictory pair "Placeholder — built in UNN-298." / "No characters are placed in this campaign yet." for a feature that shipped. This is vestigial scaffolding: setup-panels.tsx's JSDoc still lists four slots (UNN-298/299/300/301) as pending, but this empty state is its only remaining consumer — the stub's name and copy now lie about what is rendered.

**Suggested fix:** Render a plain empty-state section (same border/header chrome as the populated panel) with only the "No characters are placed in this campaign yet." message. If nothing else needs the stub after the inline "Custom enemies are coming soon (UNN-299)" note in encounter-setup.tsx, delete setup-panels.tsx.

### `apps/web/components/combat/player-turn-order.tsx:79-83`
**aria-label on a generic <span> for the 'has acted' checkmark is ignored by AT**  
*a11y · ✓ verified · slice: combat-root*

`<span aria-label="has acted" className="text-muted-foreground">✓</span>` — WAI-ARIA prohibits naming on the generic role, so the label is ignored and screen readers fall back to the raw '✓' glyph (announced inconsistently, e.g. 'check mark' or nothing). The acted state otherwise rides only `opacity-50`. The sibling pattern in watch-enemies-rail.tsx:73-78 has the same reliability gap: `<CheckIcon aria-label="has acted" .../>` renders a bare `<svg aria-label>` without `role="img"` (Phosphor's base sets no role), which is not reliably name-mapped across browsers.

**Suggested fix:** Use visually-hidden text instead: `<span className="sr-only">has acted</span>` next to an `aria-hidden` checkmark — or add `role="img"` so the aria-label participates in name computation.

**Verifier:** Both quotes are exact. Line 80-82 puts aria-label on a plain <span> (generic role), where WAI-ARIA prohibits/ignores naming, so AT falls back to the raw ✓ glyph. I verified Phosphor's SSRBase (dist/ssr) renders a bare <svg> with no role, so the CheckIcon aria-label at lines 74-77 lands on a roleless SVG whose name-mapping is unreliable across browsers — and Phosphor's reliable path (the alt prop → <title>) isn't used. The acted state otherwise rides only on opacity-50, which is not programmatically conveyed; CLAUDE.md documents no exception, and sr-only is already an established pattern in the codebase, so the suggested fix fits convention.

### `apps/web/components/combat/setup-panels.tsx:17-45`
**Vestigial SetupPanelStub ships 'Placeholder — built in UNN-298' copy to users as the Import-PCs empty state**  
*conventions, debt · ⚠ unverified · slice: combat-root*

`<p className="text-sm text-muted-foreground">Placeholder — built in {ticket}.</p>` renders unconditionally, and the component's only remaining consumer is ImportPcsPanel's *shipped* empty state (import-pcs-panel.tsx:29-35): a DM whose campaign has no placed characters sees a panel reading "UNN-298 / Placeholder — built in UNN-298. / No characters are placed in this campaign yet." — but UNN-298 is built; this is not a placeholder. The JSDoc also still lists "Import PCs — UNN-298 / Add enemies — UNN-299 / Sides — UNN-300 / Zones — UNN-301" as stub slots, though all but custom-enemy creation shipped (the Zones and Add-enemies panels in encounter-setup.tsx no longer use the stub). The component's name and copy now lie about the state of the feature, violating the honest-names / leave-it-better conventions.

**Suggested fix:** Replace ImportPcsPanel's empty state with a plain bordered section ("No characters are placed in this campaign yet." without the Placeholder line / ticket chip) and delete SetupPanelStub, or strip the stub down to the one genuinely unbuilt slot (custom enemies, UNN-299) which encounter-setup.tsx currently hand-rolls inline anyway.

### `apps/web/components/combat/turn-order-strip.tsx:92-102`
**Struck acted/fallen chips render names at text-muted-foreground/70 — clear contrast failure**  
*a11y · ✓ verified · slice: combat-root*

`className="... px-2 py-1 text-xs text-muted-foreground/70 line-through"` — muted-foreground (~4.6:1 on background) at 70% alpha composites to roughly 2.6-3:1 at 12px text, below the 4.5:1 minimum for small text. The strikethrough already encodes the acted/fallen *state* redundantly, but reading *who* the chip is requires reading this low-contrast name — and the strip is the DM's primary round-state readout.

**Suggested fix:** Drop the `/70` alpha (plain `text-muted-foreground` plus `line-through` still reads as struck), or use a dedicated dimmed token that keeps >=4.5:1.

**Verifier:** The evidence is quoted verbatim: turn-order-strip.tsx:97 applies `text-muted-foreground/70 line-through` to a `text-xs` (12px, regular-weight) chip that renders the combatant `{row.name}`. Computing WCAG contrast from the real tokens (globals.css: light bg oklch(0.985…), muted-foreground oklch(0.5…); dark bg oklch(0.18…), muted-foreground oklch(0.65…)) gives 3.05:1 in light and 3.44:1 in dark after compositing the 70% alpha over the background — both below the 4.5:1 small-text minimum, while the full-strength token passes at ~5.8:1, proving the `/70` is the sole cause. This is not a sanctioned pattern: CLAUDE.md grants no contrast/alpha exception, and the only other `text-muted-foreground/70` on body text is a separate instance, not a precedent; the codebase's own correct pattern (valor-widget.tsx:61) applies the alpha to the strikethrough `decoration` and keeps the text full-strength, matching the suggested fix. P2 rather than P1 because state is redundantly encoded (strikethrough + side dot) and the name is present-but-hard-to-read, a genuine WCAG 1.4.3 failure on content text without being a full functional blocker.

### `apps/web/components/combat/use-encounter-setup.ts:46-61`
**dispatch() body is character-for-character identical to useCombatConsole's**  
*debt · ⚠ unverified · slice: combat-root*

Both hooks contain:
  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      applyOptimistic(event)
      const result = await applyCombatEvent({ encounterId: encounter.id, expectedVersion: versionRef.current, event })
      if (!result.ok) { toast.error(encounterErrorMessage(result.error)); return }
      versionRef.current = result.value.version
      router.refresh()
    })
  }
And the versionRef sync effect is identical too (useRef(encounter.version) + useEffect sync).

**Suggested fix:** Extract a `makeEncounterDispatch({ encounterId, versionRef, applyOptimistic, startTransition, router })` factory into a shared util (or inline helper in `lib/actions/encounter/`). Each hook calls it once. The hooks themselves stay distinct — setup has no RT machinery; the console adds vitals tracking and endEncounter — so this is extracting a primitive, not merging the hooks.

### `apps/web/components/combat/zone-layout.tsx:85-93`
**Adjacent-zone badges keyed by display name — duplicate zone names produce colliding React keys**  
*correctness · ✓ verified · slice: combat-root*

`{zone.adjacentZoneNames.map((name) => (<Badge key={name} variant="outline">{name}</Badge>))}` keys sibling list items by the zone's display name. Nothing enforces unique zone names: zones-panel.tsx addZone() (lines 47-51) accepts any non-empty trimmed string and mints a fresh id, so two zones named "Tower" are legal; if both border the same zone, this list renders two children with key="Tower" — a React duplicate-key violation (console error, and updates/removals of one badge can be applied to the wrong sibling). Every other list in the slice correctly keys by id; this is the only name-keyed one, and it's reachable by ordinary DM input. ZoneLayout is shared by the DM console and the player watch view, so the collision surfaces on both.

**Suggested fix:** Have the engine's layout shaper expose adjacent zones as {id, name} pairs and key by id; failing that, key by index here (the list is rebuilt from props each render and has no per-item state, so an index key is acceptable) — `adjacentZoneNames.map((name, i) => <Badge key={i}>`.

**Verifier:** Evidence is accurately quoted: zone-layout.tsx:88-92 keys adjacent-zone badges by display name (`key={name}`), and this is the only name-keyed list in the slice (zones, combatants, and zones-panel rows/neighbors all key by id). Both view-shapers (resolve-zone-layout.ts:103, resolve-player-view.ts:46) map de-duplicated adjacency IDs to their `name`, so duplicate zone names yield duplicate strings in `adjacentZoneNames`. The input path enforces no name uniqueness: zones-panel addZone() accepts any non-empty trimmed string and the reduce/zones.ts reducer stores/renames names with no collision check, so two "Tower" zones both bordering a third produce `key="Tower"` twice — a real React duplicate-key violation reachable by ordinary DM input, on both the DM console and player watch view. Severity is P2 rather than P0: the trigger is narrow (two identically-named zones bordering the same zone), the badges are static text with no per-item state, so fallout is a console error plus possible reconciliation glitches rather than data corruption; the suggested id-keyed fix is sensible.

### `apps/web/components/editor/markdown-round-trip.test.ts:17-27`
**Test makeEditor config diverged from MarkdownField — missing Typography extension and wrong heading levels**  
*debt · ⚠ unverified · slice: small-surfaces*

```ts
// test makeEditor:
StarterKit.configure({ heading: { levels: [2, 3] } }),
// No Typography extension
```

```ts
// actual MarkdownField:
StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: {...} }),
Typography,  // ← converts straight quotes to smart quotes, etc.
```

Typography performs smart-quote and ellipsis transforms that can change Markdown output. The test can pass while the real editor silently transforms content differently. The heading level mismatch means h1/h4 round-trips are untested.

**Suggested fix:** Extract a shared makeEditorConfig() (or a shared extensions array) from MarkdownField and import it in the test so both always use identical extension lists. Include Typography and the full heading-levels array.

### `apps/web/components/my-characters/character-card-actions.tsx:63-69`
**Hand-rolled Button-as-Link replicates packages/ui internals instead of the established Button render={<Link/>} composition**  
*conventions · ⚠ unverified · slice: small-surfaces*

<Link href={href} data-slot="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{primaryLabel}</Link> — the established repo pattern for a link styled as a button is composition through the primitive: `<Button render={<Link href={href} />} nativeButton={false} size="sm">` (used in components/campaign/live-encounter-banner.tsx:34, components/combat/combat-console.tsx:160, components/character-sheet/ranks-banner.tsx:88). This site instead hand-stamps `data-slot="button"` — the Button primitive's internal slot marker (packages/ui/src/components/button.tsx:49) — purely so ButtonGroup's internal CSS selectors (`[&>[data-slot]~[data-slot]]:rounded-l-none` in button-group.tsx:14) pick it up. That couples app code to packages/ui's private slot-naming contract: if the primitive renames its slot or ButtonGroup changes its selectors, this link silently loses its grouped styling with no type error. The `cn(...)` wrapper around a single argument is also a no-op pass-through.

**Suggested fix:** Replace the raw Link with the documented composition: `<Button render={<Link href={href} />} nativeButton={false} variant="outline" size="sm">{primaryLabel}</Button>`. Button then emits `data-slot="button"` and the variant classes itself; drop the buttonVariants and cn imports.

### `apps/web/components/my-characters/character-card-actions.tsx:63-69`
**Primary card link announces only "Open"/"Resume", repeated identically across every card**  
*a11y · ✓ verified · slice: small-surfaces*

`<Link href={href} data-slot="button" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>{primaryLabel}</Link>` — the accessible name is just "Open" (or "Resume"), duplicated for every character in the roster grid. A screen-reader links/buttons list reads "Open, Open, Open…" with no way to tell which character each opens (WCAG 2.4.4). The 2.4.4 "context" exception doesn't reliably apply: the enclosing `Item` is a role-less div (not a list item or table cell), so there is no programmatically determined context tying the link to the character name. The component already solves this for its sibling control — the menu trigger two lines down gets `aria-label={`Actions for ${displayName}`}` and the prop doc even says displayName exists "for the dropdown's aria-label" — the primary link just never got the same treatment.

**Suggested fix:** Give the link a per-character name: `aria-label={`${primaryLabel} ${displayName}`}` (displayName is already passed in), keeping the visible text as-is — the visible label remains a prefix of the accessible name, satisfying WCAG 2.5.3.

**Verifier:** The evidence is quoted accurately: at character-card-actions.tsx:63-69 the primary `<Link>` has no aria-label, so its accessible name is exactly the visible text ("Open"/"Resume"), identical for every card in the roster grid. The 2.4.4 programmatic-context exception is genuinely weak here — I confirmed in packages/ui item.tsx that `Item` and `ItemTitle` are role-less divs with no `aria-labelledby` tying the link to the character name; the `ItemGroup` parent is `role="list"` but `Item` is not a `role="listitem"`, so the link isn't even nested in a programmatic list item. The component already solves this exact problem for the sibling dropdown trigger (`aria-label={`Actions for ${displayName}`}`, with `displayName` documented as always-non-empty and passed in), so the suggested fix (`aria-label={`${primaryLabel} ${displayName}`}`) is sensible, reuses existing data, and keeps visible text as a prefix (WCAG 2.5.3). It's a real a11y gap on a secondary surface that degrades screen-reader link-list navigation rather than blocking interaction, so P2.

### `apps/web/components/my-characters/delete-character-dialog.tsx:91-111, 161-190`
**"Already deleted" toast branches are unreachable in the scenario they were written for; the real path throws to the error boundary**  
*correctness · ✓ verified · slice: small-surfaces*

Both confirm handlers branch on `if (result.error === "character-not-found") { toast.error("Character already deleted.") ... }` (lines 102-107 and 175-180). But `deleteCharacterAction` calls `requireOwner(parsed.data.characterId)` before the write, and `requireOwner` (apps/web/lib/auth/viewer-role.ts:61-62) does `const character = await loadCharacterRowById(characterId); if (!character || character.ownerId !== viewerId) forbidden()` — a missing row throws Next's `forbidden()` instead of returning a Result. The write-level `err("character-not-found")` (lib/db/writes/delete-character.ts) is only reachable in the microsecond race between `requireOwner`'s load and the DELETE statement. So in the realistic scenario — the character was already deleted in another tab/session — the awaited action promise rejects inside `startTransition(async () => { const result = await deleteCharacterAction(...) })`, which has no try/catch; the user is bounced to the route error/forbidden boundary mid-dialog rather than seeing the friendly "Character already deleted." toast + list refresh the code intends.

**Suggested fix:** Make the missing-row case a domain result rather than a thrown 403: either have `deleteCharacterAction` check row existence itself and return `err("character-not-found")` before/instead of letting `requireOwner` conflate "gone" with "not yours", or wrap the `await deleteCharacterAction(...)` in try/catch in both handlers and map rejections to the existing not-found/generic toast + `router.refresh()` path.

**Verifier:** Verified the full chain: requireOwner (viewer-role.ts:61-62) loads via loadCharacterRowById which returns null for a missing row, then calls Next's forbidden() (a thrown navigation signal) rather than returning a Result. The write-level err("character-not-found") (delete-character.ts:49) is only reachable in the load→DELETE race window — the write's own JSDoc confirms requireOwner has already loaded the row by the time it runs. Both dialog handlers await deleteCharacterAction inside startTransition(async () => {...}) with no try/catch (lines 92-110, 161-189), so in the realistic "already deleted in another tab" case the forbidden() rejection propagates to the error/forbidden boundary instead of showing the intended "already deleted" toast + router.refresh(). The suggested fix (distinguish missing-row in the action, or try/catch the await and map rejections) is sound; no CLAUDE.md pattern sanctions conflating gone-vs-forbidden here.

### `apps/web/components/my-characters/empty-state.tsx:22-29`
**Empty-state copy claims the Character Builder hasn't shipped while rendering the builder's CTA directly beneath it**  
*conventions · ⚠ unverified · slice: small-surfaces*

<EmptyDescription>The Character Builder is on its way. When it ships, your roster will start filling up here.</EmptyDescription> followed immediately by <EmptyContent><CreateCharacterButton /></EmptyContent>. CreateCharacterButton starts a draft and routes into `/builder/{shortId}/{firstStep}` — the 12-step builder is live (drafts, resume, step badges all exist in this same folder, e.g. character-card.tsx's draft handling). A brand-new user's very first screen tells them the core feature doesn't exist yet while showing the button that launches it. Stale pre-builder copy (UNN-177 era) that was never updated when the builder landed.

**Suggested fix:** Update the description to current reality, e.g. "Create your first character to start your roster." (or similar copy that matches the working CTA below it).

### `apps/web/components/my-characters/empty-state.tsx:22-25`
**Stale copy — builder has shipped but empty state still reads as if it hasn't**  
*debt · ⚠ unverified · slice: small-surfaces*

<EmptyDescription>
  The Character Builder is on its way. When it ships, your roster will
  start filling up here.
</EmptyDescription>

The character builder is fully live (CreateCharacterButton is already embedded in EmptyContent on line 29 of the same file). The description text contradicts the CTA sitting directly beneath it.

**Suggested fix:** Update the description to reflect the shipped state, e.g. 'Create your first character to get started.' Remove the 'on its way' phrasing.

### `apps/web/components/my-characters/signed-out-landing.tsx:1-31`
**Component mislocated in my-characters/ but consumed by campaigns route**  
*debt · ⚠ unverified · slice: small-surfaces*

```ts
// apps/web/app/campaigns/page.tsx line 5:
import { SignedOutLanding } from "@/components/my-characters/signed-out-landing"
```

The component's text ('Sign in to manage your characters. Your roster, sheets, and Sparks all live behind a Google sign-in.') is character-centric, not campaign-neutral. The campaigns route reuses it verbatim even though the context is different. The file belongs in components/shell/ or components/shared/ and the copy should either be generic or accept a prop.

**Suggested fix:** Move to components/shell/signed-out-landing.tsx (or components/shared/) and either (a) make the copy generic ('Sign in to get started') or (b) accept a title/description prop so each route supplies its own framing.

### `apps/web/components/shared/attribute-grid.tsx:32-36`
**formatModifier implemented twice — private copy here vs exported copy in archetype/format.ts**  
*debt · ⚠ unverified · slice: primitives*

shared/attribute-grid.tsx:32: function formatModifier(value: number): string { if (value > 0) return `+${value}`; if (value < 0) return `−${Math.abs(value)}`; return '0' } — identical body to archetype/format.ts:6 which is the published version consumed by archetype-attributes-inline (dead), archetype-attributes-grid, archetype-node-card, and builder/archetype-card.

**Suggested fix:** Have shared/attribute-grid.tsx import formatModifier from @/components/archetype/format, or — better — move formatModifier to a shared formatting utility (e.g., a new shared/format.ts, or export it from shared/attribute-grid.tsx itself) so neither copy has a directional dependency on the other's kit.

### `apps/web/components/shared/skill-card.tsx:6-13`
**Full unified/remark/rehype markdown pipeline ships eagerly in every skill-list route's client bundle for popover-only content**  
*perf · ⚠ unverified · slice: primitives*

skill-card.tsx statically imports the markdown renderers: `import { AttackRollTable } from "./attack-roll-table"` and `import { SkillText } from "./skill-text"`. skill-text.tsx line 1: `import ReactMarkdown from "react-markdown"` + `remark-gfm`; attack-roll-table.tsx imports SideEffectBadge, whose prose.tsx pulls `react-markdown`, `remark-gfm`, `rehype-sanitize`, and `hast-util-sanitize` (`defaultSchema`). The chain is rooted in skill-row.tsx (`"use client"`, line 1), which renders SkillCard only inside `<PopoverContent>` — and the packages/ui Popover wrapper (packages/ui/src/components/popover.tsx) uses Base UI `Popover.Portal` without `keepMounted`, so the card body is unmounted until the user clicks a row. Net effect: the entire unified/micromark/mdast/hast dependency graph (react-markdown 10 + remark-gfm + rehype-sanitize, tens of kB gzipped, hundreds of kB to parse/eval) is in the initial client JS of every route that renders a skill list, purely for click-to-open popover bodies. This includes the two hot surfaces: the polling watch view `/c/encounter/[shortId]` (watch-sheet-column.tsx imports `Skills` from character-sheet/skills.tsx, which imports SkillRow; I verified no other markdown consumer is eager on that route — watch-enemies-rail.tsx renders only badges/VitalBar) and the public sheet `/c/{shortId}`.

**Suggested fix:** Split the markdown renderer out of the eager chunk: either `next/dynamic`/`React.lazy` the popover card bodies (SkillCard, IntrinsicAttackCard) so they load on first popover open, or — broader win since enemy-statblock.tsx also uses Prose eagerly on the console — lazy-load the ReactMarkdown core inside SkillText/Prose with the raw string as the loading fallback. Either keeps the watch view's and public sheet's initial JS free of the unified/remark/rehype graph.

### `apps/web/components/shell/account-menu.tsx:88-95`
**Private initialsFor duplicates canonical lib/ui/initials.ts#initials**  
*debt · ⚠ unverified · slice: small-surfaces*

```ts
function initialsFor(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("")
}
```

This is byte-for-byte identical to `lib/ui/initials.ts#initials`, which is already imported by combat components (zone-layout, combatant-drawer, combatant-rail-row) and character-sheet/sheet-header. The canonical util even has a JSDoc saying it is 'shared by the read-only header avatar and the owner-mode editable portrait.'

**Suggested fix:** Replace the private function with `import { initials } from '@/lib/ui/initials'` and call `initials(user.name ?? user.email ?? '?')` at line 38.

### `apps/web/hooks/use-encounter-snapshot.ts:86-99, 114-137`
**Out-of-order snapshot responses can regress the watch view to older data (no version guard / request sequencing on application)**  
*correctness · ✓ verified · slice: hooks-lib*

Both fetch paths apply whatever response lands, unconditionally:

```ts
  function refetch() {
    fetcherRef.current(shortId).then((next) => {
      if (unmountedRef.current) return
      versionRef.current = next.version
      setSnapshot(next)
      ...
```

and the poll interval does the same (`versionRef.current = next.version; setSnapshot(next)`).

`versionRef` is only consulted to decide whether to *start* a ping-triggered refetch (`version <= versionRef.current` drop in onPing), never when *applying* a response. Concurrent fetches are easy to produce: ping v6 arrives → refetch A in flight; ping v7 arrives before A resolves (7 > versionRef which is still old) → refetch B; or an `onReconnect` refetch overlapping a ping refetch; or in polling mode a response slower than the 1500ms interval overlapping the next tick's. If the newer response (v7) resolves first and the older one (v6) second, `setSnapshot(v6)` overwrites the newer state and `versionRef.current` regresses to 6. In polling mode the next tick repairs it (~1.5s flicker of stale HP/conditions); in realtime mode the hook then idles — the watch view shows the older snapshot until the *next* DM write produces a ping, which may be minutes. This is the exact transport the player watch view (UNN-322/323/324) relies on for live HP/ailments.

**Suggested fix:** Guard application, not just initiation: in both `.then` handlers, drop a response whose `next.version < versionRef.current` (still `setStale(false)` since the fetch itself succeeded), or keep a monotonically increasing request id in a ref and only apply the response from the latest request. The version-compare variant is two lines and matches the guard `mergePingedVersions` already uses on the character side.

**Verifier:** Quotes are exact: both fetch resolutions (use-encounter-snapshot.ts:91-92 and 123-124) unconditionally do `versionRef.current = next.version; setSnapshot(next)`, and versionRef is only consulted at line 107 to gate ping-triggered *initiation*, never response *application*. `version` is a numeric monotonic encounter token (player-snapshot.ts:109), and concurrent in-flight fetches are easily produced (overlapping pings v6/v7, onReconnect overlapping a ping refetch, or a poll response slower than the 1500ms tick) with no request sequencing — so a later-resolving older response overwrites newer state and regresses versionRef. This is not an accepted pattern: the sibling character transport in the same epic guards with `if (version > ref.current)` in mergePingedVersions and its JSDoc relies on refs never regressing; the proposed fix simply mirrors that guard. Severity P2 rather than P1 because the regression is recovery-bounded — polling self-heals in ~1.5s and realtime heals on the next DM write — but it is a genuine user-visible stale-data window on the live watch view.

### `apps/web/hooks/use-encounter-snapshot.ts:114-137`
**Poll loop keeps hitting the DB-backed snapshot route while the tab is hidden**  
*perf · ⚠ unverified · slice: hooks-lib*

The polling effect runs solely off `[shortId, realtimeAvailable, snapshot.status]`:

```ts
useEffect(() => {
  if (snapshot.status === "ended" || realtimeAvailable) return
  ...
  const intervalId = setInterval(() => { fetcherRef.current(shortId)... }, POLL_INTERVAL_MS)
```

There is no `visibilitychange`/`document.hidden` handling anywhere in apps/web (repo-wide grep confirms zero hits), so a backgrounded watch tab keeps fetching `/api/encounter/{shortId}/snapshot` — a Neon-backed route — every 1.5s. Chrome's normal background throttling (≥1s clamp) doesn't slow a 1.5s interval at all, and intensive throttling (once/min) only kicks in after ~5 minutes hidden — that's ~200 wasted DB-backed requests per player per backgrounded stretch, multiplied by every player at the table who flips to their character-sheet tab (the documented multi-tab flow). The ended-state stop is handled well; the hidden-state isn't.

**Suggested fix:** In the polling effect, skip the tick while `document.visibilityState === "hidden"` and add a `visibilitychange` listener that triggers one immediate refetch on return to visible (so the player sees a fresh battlefield instantly instead of waiting up to 1.5s). Same listener can gate the ping-triggered `refetch` if desired, though the realtime path is cheap enough to leave alone.

### `apps/web/hooks/use-own-combat-event.ts:38-53`
**Concurrent dispatches share a stale version token — a second condition toggle fired while the first is in flight is rejected as stale and lost**  
*correctness · ✓ verified · slice: hooks-lib*

`dispatch` reads `versionRef.current` at call time and only bumps it after the round-trip resolves (`versionRef.current = result.value.version` at line 49). Two toggles in quick succession (e.g. applying two ailments back-to-back, faster than the server round-trip) both read the same pre-bump token; `applyOwnCombatEvent` persists via `saveEncounterSession(encounter.id, next, expectedVersion)` (lib/actions/encounter/own-events.ts:67), so the second write is rejected and `toast.error(encounterErrorMessage(result.error))` fires — the player's second edit is silently dropped with an error toast for what was a perfectly ordinary interaction. Unlike the sheet's click-writes, there is no `dispatchCharacterWriteWithRetry`-style silent stale-retry and no save-queue serialization here. The hook's own JSDoc oversells the ref: "a rapid second toggle reads the freshly-bumped token instead of a stale render frame, so it isn't spuriously rejected as `stale`" — true only when the second toggle comes *after* the first response; in-flight concurrency still collides. The sole consumer doesn't prevent it either: `PlayerCombatStateControl` only dims (`className={cn(pending && "opacity-60")}`, components/combat/player-combat-state-control.tsx:44) — the controls stay clickable while pending.

**Suggested fix:** Serialize dispatches through a promise chain (the saveQueueRef pattern from useDebouncedAutoSave) so a second event reads the freshly-bumped token after the first resolves, or add a one-shot silent stale-retry (refetch the snapshot version, re-dispatch) mirroring dispatchCharacterWriteWithRetry. At minimum, gate the consumer's controls on `pending` (disabled, not just opacity).

**Verifier:** The mechanism is real and accurately quoted: `dispatch` reads `versionRef.current` (use-own-combat-event.ts:42) and only bumps it post-resolve (line 49); React's `startTransition` does not serialize its async callbacks, so two toggles fired before the first round-trip resolves both send the same `expectedVersion`. The second hits `saveEncounterSession`'s version guard (writes/encounter.ts:99-114), returns `err("stale")`, and the hook drops the edit with `toast.error("This encounter changed elsewhere. Reload and try again.")` for an ordinary fast double-toggle; the consumer only dims via `opacity-60` and leaves controls clickable. It is not a documented/accepted pattern — CLAUDE.md's UNN-226 guidance explicitly warns against back-to-back writes silently overwriting, and the JSDoc's claim that the prop-synced ref protects rapid toggles is overstated (it only covers post-resolve frames, not in-flight concurrency). Severity is P2 rather than P1: the bug is real and user-visible but the trigger window is narrow (two toggles within one sub-second round-trip), nothing is corrupted, it's recoverable, and the identical exposure exists in the DM console (`useCombatConsole`), so it's a low-frequency shared correctness gap; the suggested fixes (serialize dispatches, or simplest: gate controls on `pending` with `disabled`) are sound.

### `apps/web/hooks/use-realtime-channel.ts:110-163`
**Dynamic import('ably/modular') is unguarded inside the fire-and-forget IIFE — a chunk-load failure is an unhandled promise rejection and never reports unavailability**  
*correctness · ✓ verified · slice: hooks-lib*

    void (async () => {
      const first = await fetchRealtimeToken(domain, shortId).catch(() => null)
      ...
      const {
        BaseRealtime: Realtime,
        FetchRequest,
        WebSocketTransport,
      } = await import("ably/modular")

The first token fetch is `.catch(() => null)`-guarded and the channel `subscribe()` has its own `.catch`, but the awaited dynamic import (and the `new Realtime(...)` construction after it) has no handler, and the IIFE result is `void`-discarded. A failed lazy chunk load — exactly the flaky-network condition this degradation-first hook is designed around — rejects unhandled (console error, window 'unhandledrejection'), and `onAvailabilityChange(false)` is never fired for this failure mode, unlike the token-unavailable path two lines above which reports it explicitly. Consumers happen to default to unavailable so the poll fallback survives, but the explicit contract ("Reports whether the realtime path is currently delivering") is silently skipped.

**Suggested fix:** Wrap the IIFE body (from the import onward) in try/catch — on catch, if not cancelled, `console.warn` and `onAvailabilityChangeRef.current?.(false)` — or append `.catch(...)` to the IIFE instead of `void`-ing it.

**Verifier:** Evidence is accurately quoted: at use-realtime-channel.ts:110-163 the `void (async () => {...})()` IIFE guards the first token fetch with `.catch(() => null)` (firing onAvailabilityChange(false) on null, line 113) and guards channel subscribe with `.catch` (lines 159-162), but the `await import("ably/modular")` (line 121) and `new Realtime(...)` (line 125) have no handler and the IIFE is void-discarded — so a chunk-load failure rejects unhandled (no global unhandledrejection handler exists in the app) and onAvailabilityChange(false) is never fired, violating the hook's documented contract that it "Reports whether the realtime path is currently delivering: false when... unavailable." This asymmetry vs the token-unavailable path two lines above is real and not an accepted pattern in the ADR or CLAUDE.md; the try/catch fix mirrors the existing token-failure branch. Severity is P2, not a user-visible bug: the sole consumer (use-encounter-snapshot.ts:66) defaults realtimeAvailable to false so the poll fallback survives regardless — the concrete harm is the unhandled rejection plus the silently-skipped availability contract.

### `apps/web/lib/commands/registry.test.ts:15-20`
**vi.mock factory for adjust-pools omits recoverSPAction, which vitals.ts imports — the mocked module surface has drifted from the real one**  
*correctness, conventions, debt · ✓ verified · slice: hooks-lib*

vi.mock("@/lib/actions/adjust-pools", () => ({
  damageAction: vi.fn(),
  healAction: vi.fn(),
  spendSPAction: vi.fn(),
  consumePrismaAction: vi.fn(),
}))

lib/commands/vitals.ts imports five actions: `consumePrismaAction, damageAction, healAction, recoverSPAction, spendSPAction`. The factory replaces the whole module, so `recoverSPAction` is bound to `undefined` in the test environment. It passes today only because `resolveCommands` never invokes executors, but the test added the "vitals.recover-sp" command's registry entry without anyone noticing the mock gap — any future assertion that runs that command's action (the natural next test) would call `undefined(...)` and fail confusingly, and the drift shows the factory list isn't checked against the real export surface.

**Suggested fix:** Add `recoverSPAction: vi.fn()` to the factory; consider `vi.mock("@/lib/actions/adjust-pools", { spy: true })` or importing the real module type to keep the factory exhaustive (`satisfies typeof import("@/lib/actions/adjust-pools")`).

**Verifier:** Confirmed against source: the vi.mock factory (registry.test.ts:15-20) stubs only damageAction, healAction, spendSPAction, consumePrismaAction, but vitals.ts (lines 1-7) imports five actions including recoverSPAction, which the real adjust-pools.ts genuinely exports (line 103). The factory fully replaces the module, so recoverSPAction is bound to undefined in the test env; it passes only because resolveCommands (registry.ts) builds descriptors without ever invoking the action callbacks. This is a real mock-drift debt — not user-visible and not a CLAUDE.md-sanctioned pattern — and the suggested fix (add the missing stub, or make the factory exhaustive via satisfies typeof import / spy:true) is sound.

### `components/character-sheet/archetypes/archetype-detail.tsx:1-66`
**Three ArchetypeDetail variants exist across sheet / atlas / builder with structural duplication**  
*debt · ⚠ unverified · slice: cs-surfaces*

Three near-identical files compose the same six building blocks (ArchetypeAttributesGrid, ArchetypeAffinitiesChart, ArchetypeTalents, ArchetypeMechanicProse, ArchetypeRankedSkills, Synthesis Skill block) in the same order:

1. `components/character-sheet/archetypes/archetype-detail.tsx` — uses pre-resolved `ArchetypeEntry` (entry.ranks, entry.synthesis), adds `InheritanceSlots`.
2. `components/character-sheet/archetypes/atlas/archetype-detail-panel.tsx` (PanelBody, lines 92–215) — calls `previewArchetypeSkills()` itself, adds Prerequisites/Mastery/Slots/Path triple + action footer; Synthesis shows a locked-badge fallback when rank unmet.
3. `components/builder/movements/corpus/archetype-detail.tsx` — also calls `previewArchetypeSkills()`, same six sections but always renders Synthesis as SkillRow (no locked-badge fallback), no InheritanceSlots.

Variants 2 and 3 share the same data source (`previewArchetypeSkills`) and diverge only in the Synthesis fallback and the atlas-only framing. If the Synthesis-fallback behavior is ever added to the builder variant (a natural extension) it will be re-coded a third time.

**Suggested fix:** Extract the shared six-section body into a `ArchetypeDetailBody` component in `components/archetype/` that accepts `ranks`, `synthesis`, `currentRank`, `attributes`. The builder and atlas-panel variants own their framing (prerequisites, footer, inline-expand shell) and call this body. The sheet variant (`archetype-detail.tsx`) already delegates to the shared kit and only adds `InheritanceSlots`; it can stay or also use the body. The Synthesis locked-badge vs. SkillRow divergence is a single `lockedFallback` prop.

### `components/character-sheet/archetypes/atlas/lineage-atlas.tsx:7-12`
**filterAtlasLineagesToUnlocked and getAtlasRecommendations called directly from @workspace/game/engine, bypassing lib/game-engine.ts composition root**  
*debt · ⚠ unverified · slice: cs-surfaces*

```ts
import {
  filterAtlasLineagesToUnlocked,
  getAtlasRecommendations,
  type AtlasLineage,
  type AtlasNode,
} from "@workspace/game/engine"
```
`buildLineageAtlas` is correctly exposed via `lib/game-engine.ts` (line 28 of that file), but `filterAtlasLineagesToUnlocked` and `getAtlasRecommendations` are not. `getAtlasRecommendations` receives `view`, `pathChoice`, and `level` — three separate values that LineageAtlas reads from character and passes inline. These are game-engine computations performed in the UI layer without going through the composition root.

**Suggested fix:** Expose `filterAtlasLineagesToUnlocked` and `getAtlasRecommendations` via `lib/game-engine.ts` alongside `buildLineageAtlas`. Note: both are pure functions with no GameData dependency, so they can be re-exported as-is rather than curried. Alternatively, if the preference is to keep stateless helpers importable directly from the layer barrel (a pattern the codebase does use in components/shared/), document that distinction explicitly.

## P3 (110)

### `apps/web/app/builder/[shortId]/[step]/page.tsx:71-73`
**Inline comment explaining why PersonaStep receives props from the Server Component**  
*debt · ⚠ unverified · slice: routes*

Lines 71–73: `// Finalize must honor every gate, not just persona's name. Computed here (Server Component) and passed down so PersonaStep need not be a client component — see its JSDoc for the hydration reason.` This is an architecture note that belongs in the JSDoc of `PersonaStep` (where the JSDocs already exist) rather than inline at the call site.

**Suggested fix:** Remove the inline comment; the `PersonaStep` JSDoc already documents this decision. The call site reads fine without it: `<PersonaStep canFinalize={failures.length === 0} disabledReason={failures[0]?.reason} />`.

### `apps/web/app/builder/[shortId]/[step]/page.tsx:56-83`
**AnimusStep is a one-liner pass-through wrapper with no added value**  
*debt · ⚠ unverified · slice: routes*

`components/builder/movements/animus/index.tsx` line 13: `return <WriterPane />`. The wrapper adds no props, no context, no logic — it re-exports `WriterPane` under a different name for no benefit. This was also flagged in the prior builder survey (MEMORY: 'vestigial AnimusStep'). `renderMovementBody` could call `<WriterPane />` directly for the `animus` case.

**Suggested fix:** In `renderMovementBody`, replace `return <AnimusStep />` with `return <WriterPane />` (import `WriterPane` directly) and delete `AnimusStep`. The `animus/index.tsx` file can export `WriterPane` re-export if external consumers exist, or be removed entirely.

### `apps/web/app/c/[shortId]/page.tsx:106-110`
**Draft-redirect pattern duplicated across two character-sheet pages without a shared helper**  
*debt · ⚠ unverified · slice: routes*

In `app/c/[shortId]/page.tsx` lines 106–110: `if (character.status === 'draft') { if (role === 'owner') { redirect('/builder/...') } return <DraftInProgressDialog /> }`. In `app/c/[shortId]/archetypes/atlas/page.tsx` lines 44–49: same check but owner redirects to builder and non-owner redirects to `/c/${shortId}` (different outcome). The pattern is near-identical (same status check, same owner redirect) but the non-owner path differs, so it cannot be trivially extracted without noting the distinction.

**Suggested fix:** Extract `redirectDraftOwner(character, role, shortId)` that handles only the owner→builder redirect, then let each page handle its non-owner case. Captures the shared owner-redirect formula without merging the different non-owner outcomes.

### `apps/web/app/c/[shortId]/page.tsx:64-65, 102-105`
**Two inline comment blocks in generateMetadata and the page body**  
*debt · ⚠ unverified · slice: routes*

Lines 64–65: `// Drafts never get a real page rendered — give crawlers a neutral title...`. Lines 102–105: `// Drafts (UNN-204) are scoped to their owner. The owner shouldn't be staring at a half-built sheet...`. Both explain logic that could be expressed by extracting named helpers like `draftMetadata()` and `handleDraftAccess(character, role, shortId)`.

**Suggested fix:** Extract the draft-metadata logic into a named helper (`draftSafeMetadata`) and the access-control block into a function (`guardDraftAccess`) so the intent is self-evident from the call site.

### `apps/web/app/c/encounter/[shortId]/page.tsx:52-61`
**Watch page serially awaits auth() before starting the snapshot load it does not depend on**  
*perf · ⚠ unverified · slice: routes*

```ts
const session = await auth()
const viewerId = session?.user?.id
```

```ts
const [snapshot, ownedSheets] = await Promise.all([
  getSnapshot(shortId),
  viewerId ? loadOwnedEncounterSheets(shortId, viewerId) : Promise.resolve([]),
])
```

Only `loadOwnedEncounterSheets` needs `viewerId`; `getSnapshot(shortId)` is fully independent, yet it does not start until the auth DB roundtrip resolves. This delays first paint of the public watch view — the page players and spectators open at the table — by one full session lookup, including for signed-out spectators who gain nothing from the wait.

**Suggested fix:** Start both eagerly: const snapshotPromise = getSnapshot(shortId); const session = await auth(); const [snapshot, ownedSheets] = await Promise.all([snapshotPromise, viewerId ? loadOwnedEncounterSheets(shortId, viewerId) : []]).

### `apps/web/app/campaigns/[shortId]/page.tsx:82-98`
**Campaign page stacks three serial roundtrips (campaign → auth → membership) where the first two are independent**  
*perf · ⚠ unverified · slice: routes*

```ts
const campaign = await getCampaign(shortId)
if (!campaign) notFound()
```

```ts
const session = await auth()
const viewerId = session?.user?.id
if (!viewerId) notFound()
...
if (await isCampaignMember(campaign.id, viewerId)) {
```

`getCampaign(shortId)` and `auth()` have no dependency on each other but run sequentially; for the member path `isCampaignMember` adds a third serial wave before any rendering starts (the DmManageView/MemberOverview data loads are correctly Promise.all'd afterwards). That is up to three stacked Neon/auth roundtrips of pure latency on every visit to the campaign hub.

**Suggested fix:** const [campaign, session] = await Promise.all([getCampaign(shortId), auth()]) — generateMetadata still shares the cached campaign read. The membership check genuinely depends on both, so it stays serial, but the waterfall shrinks from three waves to two.

### `apps/web/app/campaigns/[shortId]/page.tsx:43-47, 116, 180`
**activeEncounters helper function is a local private function that could logically live in lib/db/queries/load-encounter**  
*debt · ⚠ unverified · slice: routes*

`function activeEncounters(encounters: EncounterSummary[])` (lines 43–47) filters encounters where `status !== 'ended'` and projects `{shortId, status}`. This is a data-shaping helper operating on `EncounterSummary[]` (a type from `lib/db/queries/load-encounter`). Per convention, per-tab data shaping belongs next to the data. Low severity since it's small and only used here.

**Suggested fix:** Move `activeEncounters` to `lib/db/queries/load-encounter.ts` alongside `EncounterSummary`. Alternatively, keep it local — the convention applies most strongly to large inline `.filter().map()` chains, and this is a one-liner; flagging as Low confidence.

### `apps/web/app/combat/[shortId]/encounter-access.ts:20-33`
**getEncounterForDM awaits auth() and the encounter load serially though they are independent — on the per-combat-event refresh path**  
*perf · ⚠ unverified · slice: routes*

```ts
const session = await auth()
const viewerId = session?.user?.id
if (!viewerId) return null
```

```ts
const encounter = await loadEncounterRowByShortId(shortId)
```

`auth()` (database session strategy — a DB read) and `loadEncounterRowByShortId(shortId)` share no data dependency, yet run back-to-back, followed by a third serial `loadCampaignRowById`. The dominant caller is the live combat console, which re-runs this whole chain via router.refresh() on every combat event and realtime ping, so the three stacked roundtrips are paid per action during play, plus once more in generateMetadata-sharing on first load.

**Suggested fix:** Kick off both independent reads before awaiting: const [session, encounter] = await Promise.all([auth(), loadEncounterRowByShortId(shortId)]), then run the DM check. (Trade-off: signed-out hits now pay the encounter query — acceptable since the route is DM-only and its hot callers are always authenticated.) The campaign read must stay dependent, but see the duplicate-load finding for collapsing it.

### `apps/web/app/combat/[shortId]/page.tsx:49-52`
**`campaign?.shortId ?? ""` papers over an impossible-null with a silently broken back link**  
*conventions · ⚠ unverified · slice: routes*

```
// getEncounterForDM already authorized the viewer against this campaign, so the
// row exists; resolve its public shortId for the "← Campaign" back link.
const campaign = await loadCampaignRowById(encounter.campaignId)
const campaignShortId = campaign?.shortId ?? ""
```
The comment asserts the row exists — and the schema proves it: `encounters.campaignId` is `.notNull().references(() => campaigns.id, { onDelete: "cascade" })` (lib/db/schema/encounter.ts:29-31), so an encounter cannot outlive its campaign. The `?? ""` fallback therefore never legitimately fires, and if it ever did (data corruption, loader bug) it would silently feed `campaignShortId=""` into EncounterSetup/CombatConsole/EncounterEndedStub, rendering a back link to `/campaigns/` — a lying value instead of a loud failure. CLAUDE.md Code Style item 8 names exactly this move ("a type cast that papers over a real mismatch... a special-case branch") as the thing to stop on; getEncounterForDM in the same directory shows the established pattern (return null → notFound).

**Suggested fix:** Fail loudly instead of defaulting: `if (!campaign) notFound()` after the load (mirroring the encounter guard two lines up), then pass `campaign.shortId` as a guaranteed string. Alternatively have getEncounterForDM return the (already-loaded, React-cached) campaign row alongside the encounter so the page never re-derives it nullable.

### `apps/web/app/combat/[shortId]/page.tsx:49-50, 59-61, 92-93, 111-112`
**Four inline comment blocks violate the 'avoid inline comments' convention**  
*debt · ⚠ unverified · slice: routes*

Lines 49–50: `// getEncounterForDM already authorized...`. Lines 59–61: `// The start-combat dialog suggests the higher-Agility first side...`. Lines 92–93: `// The rail/drawer read identity + vitals...`. Lines 111–112: `// The realtime channel key per PC (UNN-373)...`. CLAUDE.md §3: 'Avoid inline comments. If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions.'

**Suggested fix:** Extract the non-obvious computations into named helpers (e.g., `buildPcInitiativeStats`, `buildPcDetailById`, `buildPcShortIdIndex`) so the switch branches read as a sequence of named steps without explanatory prose.

### `apps/web/app/combat/[shortId]/page.tsx:88-123`
**Live branch builds pcShortIdById as a second pass over already-filtered data, adding a redundant filter call**  
*debt · ⚠ unverified · slice: routes*

Line 100: `.filter((c) => c !== null).map(c => [...])` for `pcDetailById`. Line 113–114: `hydrated.filter((c) => c !== null).map((c) => [c.id, c.shortId])` for `pcShortIdById`. Both iterate the same `hydrated` array, filtering nulls twice. If `buildPcDetailById` were extracted (as suggested above), `pcShortIdById` could be derived from `Object.keys(pcDetailById).map(id => [id, pcDetailById[id].shortId])` without a second filter pass.

**Suggested fix:** After extracting `buildPcDetailById`, derive `pcShortIdById` from the returned map: `Object.fromEntries(Object.entries(pcDetailById).map(([id, detail]) => [id, detail.shortId]))`. Eliminates the second filter pass and the redundant `hydrated` re-scan.

### `apps/web/components/archetype/archetype-ranked-skills.tsx:31-37`
**Rank-bucket grouping of engine-shaped RankedSkill[] is built inline in the component**  
*conventions · ⚠ unverified · slice: primitives*

```ts
const grouped = new Map<number, RankedSkill[]>()
for (const ranked of ranks) {
  const bucket = grouped.get(ranked.rank) ?? []
  bucket.push(ranked)
  grouped.set(ranked.rank, bucket)
}
const sortedRanks = [...grouped.keys()].sort((a, b) => a - b)
```

This turns the engine's flat `RankedSkill[]` (shaped by `resolveArchetypeRankedSkills` in packages/game/src/engine/archetypes/utils.ts) into the per-rank render shape inside the component, against CLAUDE.md's "the inline ... blocks that turn hydrated state into the shape a section renders should be a pure helper in `packages/game/src/engine/<domain>/` — the tab root calls one helper and focuses on layout." The component gets the unlock decision right (it delegates to the engine's `hasUnlockedRank` at line 45) but keeps the data-shaping half local; every Archetype detail surface (live sheet, Atlas, builder drawer) renders through this one component, so the grouping is de facto the canonical rank-display shape and belongs beside `resolveArchetypeRankedSkills`.

**Suggested fix:** Move the grouping into a pure helper (e.g. `groupSkillsByRank(ranks: RankedSkill[]): { rank: number; skills: RankedSkill[] }[]`, sorted ascending) in packages/game/src/engine/archetypes/utils.ts next to resolveArchetypeRankedSkills, and have ArchetypeRankedSkills map over its result.

### `apps/web/components/builder/builder-shell.tsx:198-212`
**Continue click serializes a bookkeeping Server Action ahead of navigation — two round-trips per step advance**  
*perf · ⚠ unverified · slice: builder*

`startTransition(async () => { const result = await setBuilderStepAction({...}); if (!result.ok && result.error !== "stale") {...return} router.push(...) })`. `setBuilderStepAction` does an owner check, a DB write, and `revalidateCharacter` (lib/actions/character-identity.ts:85-102) before `router.push` even starts, and the revalidate invalidates the very layout the push then refetches — so every advance through the wizard costs a full action RTT plus a fresh full-layout RSC fetch, strictly sequential. The await buys nothing visible: the action only records the resume position (`builderStep`), and the destination's ProgressDots render identically whether `highestVisitedStepIndex` is the pre- or post-bump value (the new step renders as `aria-current` regardless, and earlier dots stay visited). The only behavior the await preserves is aborting navigation on a non-stale failure, a rare case.

**Suggested fix:** Issue `router.push` immediately and run `setBuilderStepAction` concurrently (fire it inside the same transition without awaiting before the push, surfacing failure via toast only). If abort-on-failure is considered load-bearing, keep the current shape but note the latency is a deliberate tradeoff in the JSDoc.

### `apps/web/components/builder/builder-shell.tsx:269-278`
**Visited-step progress dots are 8px (size-2) click targets with 12px gaps — below any reasonable target size, failing WCAG 2.5.8's spacing exception**  
*a11y · ✓ verified · slice: builder*

`<Link href={...} aria-label={label} className="block size-2 rounded-full bg-muted-foreground/60 ..." />` — an 8×8px anchor, with `gap-3` (12px) between dots putting target centers 20px apart, so the 24px-circle spacing exception of WCAG 2.5.8 (AA) also fails. These dots are the only single-click way to jump back more than one movement. Mitigation: the footer Back link offers an equivalent (multi-click) path, which is why this is P3 rather than P2, but on touch the dots are effectively unusable.

**Suggested fix:** Keep the 8px visual dot but grow the hit area: wrap the dot in a padded link (`p-2 -m-2` or an absolutely-positioned ::after expanding the target to ≥24px).

**Verifier:** Evidence is accurately quoted: lines 269-278 render the visited dot as a `<Link>` with `className="block size-2 rounded-full bg-muted-foreground/60 ..."` — exactly an 8×8px anchor with no padding or pseudo-element to enlarge the hit area — inside an `<ol>` with `gap-3` (12px), so adjacent target centers sit 20px apart. That is well under WCAG 2.5.8's 24px minimum and also fails its spacing exception (24px circles, radius 12px, overlap when centers are only 20px apart). Nothing in CLAUDE.md sanctions undersized tap targets, the dots are the only single-click multi-step back path (the footer BackLink only steps back one movement), and the suggested padded-link / ::after fix is the standard remediation that preserves the 8px visual — so the P3 severity (real a11y/touch polish gap with a multi-click alternative) holds.

### `apps/web/components/builder/builder-steps.ts:31-34`
**framingLine: string | null type is a lie — the null branch can never fire**  
*debt · ⚠ unverified · slice: builder*

The JSDoc on line 33-34 says 'null for movements that intentionally render without one (Movement 4 per ADR-002)'. But all four BUILDER_STEPS entries have non-null framingLine strings (lines 42, 48, 54, 60). The test (builder-steps.test.ts:31-32) explicitly asserts none are null. The null-conditional guards in builder-shell.tsx:99 and writer-sidebar.tsx:89 (`{step.framingLine ? ... : null}`) can therefore never render the null branch. The type unnecessarily widens the union.

**Suggested fix:** Change `framingLine: string | null` to `framingLine: string` (remove null from the union). Remove or update the stale JSDoc. Drop the null-conditional guards in the two render sites. If a step without a framing line is ever added, the type error will surface it.

### `apps/web/components/builder/movements/animus/document-editor.tsx:103-106`
**Inline comment in document-editor.tsx explaining the missing isEmpty guard**  
*debt · ⚠ unverified · slice: builder*

Lines 103-106: a 4-line comment explaining why there is no `isEmpty` guard on the title save. This is a 'why I chose NOT to do X' comment — typically a sign that the code shape itself should express the intent (e.g. the hook accepting an explicit `allowEmpty: true` flag, or a named `saveWhenEmpty` variant).

**Suggested fix:** Low urgency given it's a single comment. If useBuilderAutoSave gains an `allowEmpty` option (which would make empty-save behaviour opt-in and self-documenting), this comment becomes unnecessary.

### `apps/web/components/builder/movements/animus/identity-trait-messages.tsx:26-69`
**Identity-trait display labels defined in the builder instead of lib/ui/labels.ts; the same five labels are independently hardcoded on the sheet**  
*conventions · ⚠ unverified · slice: builder*

```
export const IDENTITY_TRAIT_MESSAGES: Record<IdentityTraitField, IdentityTraitMessages> = {
  personality: { label: "Personality Traits", ... },
  hope: { label: "Hopes", ... },
```
CLAUDE.md Code Conventions: "Display labels live in apps/web/lib/ui/labels.ts. Any Record<X, string> map that turns a domain key into a human-readable string ... goes there — don't redefine inline, even for a one-off consumer." `IdentityTraitField` is a domain key (lib/db/writes/identity-traits.ts), and the cost is already realized: components/character-sheet/explore/identity.tsx:31-38 hardcodes the same five strings ("Personality Traits", "Hopes", "Dreams", "Fears", "Secrets") a second time with no shared source, so renaming a facet means hunting two files. (The file is also `.tsx` with no JSX — should be `.ts`.)

**Suggested fix:** Extract `IDENTITY_TRAIT_LABELS: Record<IdentityTraitField, string>` into apps/web/lib/ui/labels.ts; have IDENTITY_TRAIT_MESSAGES (which can keep the builder-specific description/placeholder copy) and explore/identity.tsx both read from it. Rename the file to identity-trait-messages.ts.

### `apps/web/components/builder/movements/animus/index.tsx:1-14`
**AnimusStep is a vestigial one-liner wrapper around WriterPane**  
*debt · ⚠ unverified · slice: builder*

The entire file: `export function AnimusStep() { return <WriterPane /> }`. This adds an indirection layer with no behaviour, no prop transformation, and no named-surface value — the CLAUDE.md convention explicitly says delete pass-through wrappers. The other three movement index.tsx files all compose multiple sub-components, justifying their existence. AnimusStep does not.

**Suggested fix:** Delete movements/animus/index.tsx. Have app/builder/[shortId]/[step]/page.tsx import WriterPane directly from `@/components/builder/movements/animus/writer-pane`.

### `apps/web/components/builder/movements/animus/writer-pane.tsx:99-103`
**Inline comment block in ActiveDocument explaining editable vs fixed title logic**  
*debt · ⚠ unverified · slice: builder*

Lines 99-103: a 5-line inline comment block ('Editable titles (Knives / Chains) carry their own value from the DB…') explaining what `displayedTitle` does. This is the kind of explanation that should live in the variable name or extracted function rather than a comment. Convention violation: 'avoid inline comments — if your code needs a comment to be understood, try refactoring it by extracting variables or creating functions'.

**Suggested fix:** The comment explains that `title ?? ref.label` resolves to either the editable DB title or the fixed section label. Rename the variable to `resolvedTitle` or wrap the expression in a named function `resolveDisplayTitle(title, ref)` whose name carries the intent. Drop the comment.

### `apps/web/components/builder/movements/animus/writer-sidebar.tsx:3`
**Mixed Phosphor entry points within the slice duplicate icon modules in the client bundle**  
*perf · ⚠ unverified · slice: builder*

`import { PlusIcon, TrashIcon } from "@phosphor-icons/react"` here (and `LockIcon` from the same root entry in movements/ortus/talents-picker.tsx:3), while the rest of the slice imports from `@phosphor-icons/react/dist/ssr` (builder-shell.tsx:3, corpus/archetype-card.tsx:3, persona/portrait-area.tsx:3, persona/finalize-button.tsx:3). The root entry and the `/dist/ssr` entry are two distinct module trees (the root icons are context-wrapped "use client" components; the ssr ones inline their weights), so icons pulled from both end up as separate modules in the client graph — `TrashIcon` is concretely bundled twice (root-entry copy via writer-sidebar, ssr copy via portrait-area), plus a duplicated icon base. Next's `optimizePackageImports` rewrites the barrels but does not unify the two entry trees.

**Suggested fix:** Standardize the slice (and ideally the app) on one Phosphor entry point — `@phosphor-icons/react/dist/ssr`, which the majority of the slice already uses — by switching writer-sidebar.tsx and talents-picker.tsx imports, eliminating the duplicate `TrashIcon`/base modules.

### `apps/web/components/builder/movements/corpus/archetype-grid.tsx:63`
**"Someone else updated this character" stale message string repeated verbatim in 4 builder components**  
*debt · ⚠ unverified · slice: builder*

The string 'Someone else updated this character — refresh to see the latest.' appears in archetype-grid.tsx:63, path-bar.tsx:64, virtues-control.tsx:86, and talents-picker.tsx:93. These are all the stale-conflict messages for optimistic writes in the builder. Not centralized; if the UX copy changes (e.g. adding a Refresh button) all 4 need updating.

**Suggested fix:** Centralize as a named constant `BUILDER_STALE_MESSAGE` in use-builder-draft.tsx (where the `write` function is defined) and use it as the default in the hook, so individual call sites can omit the `messages.stale` field entirely. Confidence: Medium — very low cost, and the hook already has a default fallback.

### `apps/web/components/builder/movements/ortus/virtues-control.tsx:47-72`
**14 inline comment lines explaining the previousAllocation/draft state pattern violate the no-inline-comments convention**  
*debt · ⚠ unverified · slice: builder*

Lines 47-66 contain four separate inline comment blocks explaining why `allocation` identity is stable, why `useState` rather than `useOptimistic` is used, and why the `previousAllocation` comparison avoids a useEffect. The convention is 'avoid inline comments — if your code needs a comment to be understood, try refactoring'. This pattern — a 'store information from previous renders' sync — could be extracted into a named hook (e.g., `useStableServerSync`) whose name conveys the intent.

**Suggested fix:** Extract the `draft`/`previousAllocation` synchronisation into a named utility hook (`useStableServerSync<T>(serverValue: T): [T, Dispatch<T>]`) whose signature makes the intent self-documenting. Drop the inline comments. Confidence: Medium — the CLAUDE.md convention is explicit, but two hooks (useState×2 + a 3-line idiom) is a borderline extraction.

### `apps/web/components/builder/movements/persona/name-field.tsx:61-68`
**Enter/Escape keyboard handler triplicated across name-field, pronouns-field, and narrative-pair — and duplicated again in the character sheet**  
*debt · ⚠ unverified · slice: builder*

Identical 8-line `onKeyDown` handler (preventDefault+blur on Enter, preventDefault+revert+blur on Escape) appears in: name-field.tsx:61-68, pronouns-field.tsx:55-62, and narrative-pair.tsx SingleLineField:108-116. The same pattern also appears in sheet-side components (editable-character-name.tsx:67-72, editable-detail-field.tsx:70-75). The repo-wide convention discourages premature abstraction, but this is a pure event-handler function with zero local state dependency — it could be a shared utility. Drift risk: if the Enter/Escape semantics change (e.g. adding Tab-to-next-field), every copy needs to change.

**Suggested fix:** Extract a `makeAutoSaveKeyHandler({ revert, blur })` utility that returns the onKeyDown function. Place it in the auto-save hook or a shared input-utils module. All 5 call sites become one import. Confidence: Medium — the convention cautions against premature abstraction, but this is a 3-5× repetition of a pure utility function, not a component composition.

### `apps/web/components/builder/movements/persona/portrait-area.tsx:93-97`
**Portrait renders the raw Vercel Blob (up to 1MB) into a 160px circle via plain <img> — no next/image optimization**  
*perf · ⚠ unverified · slice: builder*

`<Avatar className="size-40"><AvatarImage src={portraitUrl ?? undefined} alt="" />` — `AvatarImage` is Base UI's `AvatarPrimitive.Image`, a plain `<img>` with no `srcset`/`sizes`/format negotiation (packages/ui/src/components/avatar.tsx:28-39). Upload validation allows files up to `MAX_PORTRAIT_BYTES` (1MB, enforced at line 52), and the blob URL is served as-is, so a returning player downloads up to ~1MB of image bytes to paint a 160px circle; `next/image` with `width={160}` would serve a ~10-20KB optimized variant (the app already configures `images` in next.config.ts). This matches the sheet's `editable-portrait.tsx` pattern, so it is a repo-wide decision rather than a one-off — but the byte cost is real and the builder's persona step is where the full-size blob first ships.

**Suggested fix:** Render the portrait through `next/image` (e.g. `<AvatarImage render={<Image width={160} height={160} .../>}` or replace the Avatar internals for portrait surfaces) so the blob is resized/re-encoded by the image optimizer; apply the same change to the sheet's portrait surfaces in one pass if accepted.

### `apps/web/components/c/draft-in-progress-dialog.tsx:1-48`
**components/c/ folder is absent from CLAUDE.md's Repo Structure section**  
*conventions · ⚠ unverified · slice: small-surfaces*

This file lives in apps/web/components/c/ — a top-level components folder — but CLAUDE.md's apps/web tree enumerates only builder/, shell/, character-sheet/, archetype/, shared/, editor/, combat/, campaign/, and my-characters/. CLAUDE.md's Habits section is explicit: "When you create new folders, add them to this document's Repo Structure section. Ensuring this section is up-to-date allows future Claude instances to know where relevant code is without having to dig through the repo." A single-file folder named after a route segment (`c/`) is exactly the kind of thing a future session won't find without that index entry.

**Suggested fix:** Either add `components/c/` (route-companion dialogs for /c/{shortId}, currently the draft-in-progress interstitial) to CLAUDE.md's Repo Structure, or fold the one file into an existing documented folder (components/character-sheet/ is the natural home for a public-sheet interstitial) and delete c/.

### `apps/web/components/campaign/join-link-card.tsx:53-66`
**Un-tracked setTimeout for the copied indicator — overlapping timers revert the checkmark early**  
*correctness · ✓ verified · slice: enemies-campaign*

`setCopied(true); toast.success("Join link copied."); setTimeout(() => setCopied(false), 2000)` — the timer id is never stored, cleared, or reset. Copying twice in quick succession leaves the first timer running: it fires ~2s after the *first* click and flips `copied` to false, so the second copy's checkmark can revert after a fraction of its intended 2s (e.g. click at t=0 and t=1.8s → second checkmark shows for 200ms). There is also no unmount cleanup (a no-op setState in React 19, so harmless, but the orphaned timer is what enables the overlap).

**Suggested fix:** Keep the timeout id in a ref; clearTimeout the previous one before setting a new timer in onCopy, and clear it in a useEffect cleanup on unmount.

**Verifier:** The evidence is quoted verbatim (lines 60-62): setCopied(true) followed by an un-captured setTimeout, with no ref, no clearTimeout, no unmount cleanup. The Copy button is not disabled during the copied window, so rapid double-clicks schedule independent timers and the earlier one flips copied to false ~200ms after the second click, reverting the checkmark early — a real bug, accurately analyzed. It is not an accepted project pattern (this is the only copy-indicator in the codebase, nothing in CLAUDE.md sanctions it), and the suggested ref-based fix is the standard, sensible correction. Severity is P3: it only affects a cosmetic checkmark on a low-frequency action; the clipboard write and the toast both fire correctly every time, so no data or functional correctness is lost.

### `apps/web/components/character-sheet/add-item-dialog.tsx:96-139`
**AddItemRow hand-rolls the item-row layout the packages/ui Item primitive family already provides**  
*conventions · ⚠ unverified · slice: cs-root*

AddItemRow renders `<li className="flex items-center justify-between gap-3 rounded-md border border-border p-3"><div className="min-w-0"><p className="text-sm font-medium">{item.name}</p><p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p></div><div className="flex shrink-0 items-center gap-2">…</div></li>` — a bespoke rebuild of the name + description + trailing-actions row that the slice's own inventory-row.tsx (and skills.tsx) compose from `Item`/`ItemContent`/`ItemTitle`/`ItemDescription`/`ItemActions` (`@workspace/ui/components/item`, which has a built-in `variant="outline"` for exactly this bordered look). CLAUDE.md Habits: "When building UI components, see if there is a shadcn/ui component that already does what you need"; the user's recorded preference is shadcn-first. The hand-rolled version means add-item rows and inventory rows drift in typography/spacing independently.

**Suggested fix:** Recompose AddItemRow from the Item primitives: `<Item variant="outline"><ItemContent><ItemTitle>{item.name}</ItemTitle><ItemDescription>{item.description}</ItemDescription></ItemContent><ItemActions>…quantity Input + Add Button…</ItemActions></Item>` inside an `ItemGroup`, matching inventory-row.tsx.

### `apps/web/components/character-sheet/add-item-dialog.tsx:133-135`
**Every catalog row's button is named just "Add" — identical names across a long list**  
*a11y · ✓ verified · slice: cs-root*

<Button size="sm" onClick={add}>Add</Button> rendered once per catalog item (one dialog can list dozens across Weapons/Armor/Accessories/Consumables). All buttons share the accessible name "Add"; users navigating the dialog via a controls/elements list (or by B-key jumping between buttons) cannot tell which item each adds without backtracking into browse mode. The ancestor <li> provides programmatic context (H81-style), so this is a usability degradation rather than a hard failure.

**Suggested fix:** Name each button per item: <Button size="sm" onClick={add} aria-label={`Add ${item.name}`}>Add</Button> (visible text "Add" remains contained in the name, satisfying 2.5.3).

**Verifier:** The evidence is accurately quoted: lines 133-135 render `<Button size="sm" onClick={add}>Add</Button>` inside `AddItemRow`, which is instantiated once per catalog item across four groups (lines 78-84), so a single dialog yields many buttons all sharing the accessible name "Add". The issue is real and is reinforced by the file's own precedent — the quantity Input on line 123 already uses `aria-label={`${item.name} quantity`}`, so per-item naming is established here yet the button omits it. The ancestor `<li>` carries the item name programmatically, so a linear screen-reader read still conveys context; the degradation is real only when navigating via a controls/elements list or jumping button-to-button, making this a non-blocking usability issue rather than a hard failure. The suggested fix (`aria-label={`Add ${item.name}`}`) is sensible and keeps visible text "Add" within the accessible name per WCAG 2.5.3.

### `apps/web/components/character-sheet/archetypes.tsx:36-37`
**Inline comment explains a data flow decision that should be named or extracted**  
*debt · ⚠ unverified · slice: cs-root*

```ts
// The Active card is the single source of attributes for every Skill popover
// beneath it. Read once at the top, pass down — leaves stay context-free.
const { attributes } = character
```

The comment explains *why* attributes is extracted here. Per CLAUDE.md, extracting into a named constant or function is preferred over prose explanation.

**Suggested fix:** The comment itself is the documentation — it could move into the JSDoc on the Archetypes function. The const extraction already communicates the intent adequately once you know the convention. Alternatively, rename to `const archetypeAttributes = character.attributes` to make the downstream role clearer.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-detail-panel.tsx:217-261`
**PrerequisitesSection re-derives per-prerequisite met/unmet state and resolves display names in the component instead of an engine helper**  
*conventions · ⚠ unverified · slice: cs-surfaces*

The component diffs the archetype's full prerequisite list against the engine's unmet list by building composite string keys: `const unmetKeys = new Set(state.kind === "locked" ? state.unmetPrerequisites.map((prereq) => `${prereq.archetype}:${prereq.rank}`) : [])` then `const unmet = unmetKeys.has(`${prereq.archetype}:${prereq.rank}`)` — and resolves each prerequisite's display name with a direct catalog call: `const name = getArchetype(prereq.archetype)?.name ?? prereq.archetype`. This is hydrated-state-to-render-shape shaping that CLAUDE.md places in `packages/game/src/engine/<domain>/` ("the tab root calls one helper and focuses on layout"); the engine already owns the met/unmet rule (`unmetPrerequisites` / `atlasNodeState` in packages/game/src/engine/archetypes/atlas.ts) so the component is re-encoding the join with a stringly-typed key. The `?? prereq.archetype` fallback also renders a raw domain slug (e.g. "iron-vanguard") as user-facing text if a prerequisite key ever misses the catalog.

**Suggested fix:** Add a small engine shaper in packages/game/src/engine/archetypes/atlas.ts (deps-first over Pick<GameData, "getArchetype">) that returns the panel's render shape — e.g. `prerequisiteDisplay(archetype, state): { name, rank, met }[]` — bind it in apps/web/lib/game-engine.ts, and have PrerequisitesSection map over the result.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-detail-panel.tsx:61-108, 189-211`
**Plain HydratedCharacter fields (attributes, pathChoice, savedRanks) prop-drilled through the panel into components that already consume the character context**  
*conventions · ⚠ unverified · slice: cs-surfaces*

LineageAtlas passes `savedRanks={view.savedRanks}` (which buildLineageAtlas sets verbatim from `character.savedArchetypeRanks`), `attributes={character.attributes}`, and `pathChoice={character.pathChoice}` into ArchetypeDetailPanel, which forwards all three through PanelBody; `savedRanks` continues a third hop into ArchetypeActionButton (and separately LineageAtlas → RecommendationSlots → RecommendationCard → ArchetypeActionButton). Every component in the chain renders under the route's CharacterProvider (app/c/[shortId]/archetypes/atlas/page.tsx wraps `<LineageAtlas />` in `<CharacterProvider>`), and ArchetypeActionButton already calls `useCharacterWrite()` — so the drilled `savedRanks` is the same optimistic `useCharacter().savedArchetypeRanks` available one hook away. CLAUDE.md Code Conventions: "Avoid prop-drilling. `HydratedCharacter` is supplied via `useCharacter()`. When you feel like you're prop drilling, stop and consider if a Context or another approach would be better." (The drilling into the context-neutral components/archetype kit leaves is fine — this is about the sheet-feature intermediaries that could read context themselves.)

**Suggested fix:** Have PanelBody and ArchetypeActionButton read attributes/pathChoice/savedArchetypeRanks from useCharacter() directly and drop those props from ArchetypeDetailPanel, RecommendationSlots, and RecommendationCard signatures; keep props only at the boundary into the context-neutral components/archetype kit.

### `apps/web/components/character-sheet/archetypes/atlas/archetype-node-card.tsx:26 (also archetype-detail-panel.tsx:133, ranks-header.tsx:51)`
**Decorative Phosphor icons not hidden from AT in three spots, against the slice's own convention**  
*a11y · ✓ verified · slice: cs-surfaces*

StateBadge renders `<LockSimpleIcon weight="bold" /> Locked` with no `aria-hidden`; the same unhidden `<LockSimpleIcon weight="bold" /> Locked` appears in the detail panel's header badge (archetype-detail-panel.tsx:133), and `<PathIcon />` sits unhidden inside the Path badge (ranks-header.tsx:51). Phosphor's IconBase renders a bare `<svg>` with no role/aria-hidden unless given `alt` (verified in @phosphor-icons/react dist/lib/IconBase.es.js), so these can surface as unnamed graphics in some screen readers. Every other icon in this slice (PrerequisitesSection's LockSimpleIcon, WarningIcon, SparkleIcon, XIcon, PlusIcon, ArrowFatLineUpIcon, lineage icons) carries explicit `aria-hidden`.

**Suggested fix:** Add `aria-hidden` to the three icons (the adjacent badge text already carries the meaning).

**Verifier:** All three citations are accurate: archetype-node-card.tsx:26 and archetype-detail-panel.tsx:133 render `<LockSimpleIcon weight="bold" /> Locked` and ranks-header.tsx:51 renders `<PathIcon />`, none with aria-hidden. The slice's own convention is consistent — every other Phosphor icon (atlas-sidebar, recommendation-slots, lineage-atlas, the PrerequisitesSection LockSimpleIcon, ArrowFatLineUpIcon, and the lineage Icons via wrapping spans) is hidden from AT — and I confirmed via node_modules/@phosphor-icons/react/dist/lib/IconBase.es.js that the icon emits a bare svg with no role/aria-hidden absent an alt prop. CLAUDE.md documents no exception, and the suggested fix (add aria-hidden, since adjacent badge text carries the meaning) is correct and matches the slice. Severity is P3: these are decorative icons beside text labels, so no information is lost; the only effect is a possibly-redundant unnamed-graphic announcement that is browser/AT-dependent.

### `apps/web/components/character-sheet/archetypes/atlas/lineage-atlas.tsx:52-70, 146-160`
**Atlas view selection helpers (selected-node lookup, default-lineage fallback) live in the component file instead of engine/archetypes/atlas.ts beside their sibling selectors**  
*conventions · ⚠ unverified · slice: cs-surfaces*

`findNode` is a pure nested traversal of the engine view model — `for (const lineage of lineages) { for (const column of lineage.columns) { const node = column.nodes.find((entry) => entry.archetype.key === archetypeKey) ... } }` — and the useState initializer encodes a domain default-pick rule: `view.originLineage ?? view.lineages.find((entry) => entry.progress.total > 0)?.lineage ?? view.lineages[0]!.lineage` (origin lineage, else first lineage with any archetypes, else first). CLAUDE.md: "Per-tab data shaping lives next to the data, not in the component... should be a pure helper in packages/game/src/engine/<domain>/ — the tab root calls one helper and focuses on layout." The engine module already hosts the sibling selectors this would sit beside (`filterAtlasLineagesToUnlocked`, `isAtlasNodeUnlocked` in packages/game/src/engine/archetypes/atlas.ts), so these two helpers spread knowledge of the AtlasLineage→columns→nodes structure into the UI layer where the engine could change it without the type system pointing here.

**Suggested fix:** Move both into packages/game/src/engine/archetypes/atlas.ts as pure exported selectors (e.g. `findAtlasNode(lineages, archetypeKey)` and `defaultAtlasLineage(view)`), with co-located unit tests; the component keeps only useState/layout.

### `apps/web/components/character-sheet/archetypes/atlas/lineage-atlas.tsx:84-102`
**getAtlasRecommendations computed for non-owner/public viewers because JSX props under OwnerOnly evaluate eagerly**  
*perf · ⚠ unverified · slice: cs-surfaces*

`<OwnerOnly> <RanksHeader ... /> <RecommendationSlots recommendations={getAtlasRecommendations( view, character.pathChoice, character.level )} ... />` — JSX prop expressions are evaluated when the parent (`LineageAtlas`) renders, not when the child renders. `OwnerOnly` (components/shell/viewer-role.tsx) returns `null` for non-owners, which discards the *element*, but `getAtlasRecommendations(view, ...)` has already run. The Atlas is an explicitly public, signed-out-visible surface (per the route JSDoc in app/c/[shortId]/archetypes/atlas/page.tsx), so every non-owner view executes the full recommendation pass (flatMap over all 12 lineages' nodes plus two filter+sorts in packages/game/src/engine/archetypes/atlas.ts:327-399) per character-identity change, and the result is guaranteed to be thrown away. The React Compiler memoizes the call keyed on (view, pathChoice, level) so it doesn't rerun on selection clicks, but it cannot skip work whose result is discarded by a child returning null. Cost today is small (the catalog is small), so this is hygiene rather than a hot-path issue.

**Suggested fix:** Gate the computation on role rather than relying on OwnerOnly to discard it: e.g. `const isOwner = useViewerRole() === "owner"` in LineageAtlas and `{isOwner && (<>...owner strip...</>)}`, or move the `getAtlasRecommendations` call inside an owner-only wrapper component so it only executes when that component actually renders.

### `apps/web/components/character-sheet/archetypes/atlas/lineage-tree.tsx:112-156`
**Unconditional setPaths(new array) guarantees redundant commits: a double-commit on every mount/lineage switch and a re-render per ResizeObserver tick even when connector geometry is unchanged**  
*perf · ⚠ unverified · slice: cs-surfaces*

`const [paths, setPaths] = useState<string[]>([])` ... `recompute` ends with `setPaths(next)` where `next` is always a freshly built array, with no equality check. Two consequences: (1) on mount (and on every Lineage switch, since `recompute`'s `[lineage]` dep recreates the observer), `useLayoutEffect` calls `recompute()` directly *and then* `observer.observe(container)` — ResizeObserver fires an initial callback on observe per spec — so `recompute` runs a second time with identical results and the fresh-array `setPaths` forces a second commit of `TreeColumns`; (2) during a window resize, the observed `containerRef` (`overflow-x-auto`, width tracks the grid's `1fr` column) changes size continuously, firing `recompute` per tick — but the measured `trackRef` element is `min-w-max` with fixed `w-56` columns, so the card positions and therefore the computed path strings are typically *identical* across horizontal resizes; every tick still does a full `getBoundingClientRect` sweep of all nodes plus a state-set re-render that changes nothing. The per-tick measurement is necessary to detect change, but the re-render is pure waste.

**Suggested fix:** Bail out when nothing changed before setting state, e.g. compare the new paths to the current ones (`setPaths(prev => prev.length === next.length && prev.every((p, i) => p === next[i]) ? prev : next)`), or store the joined string and compare. This removes the guaranteed extra commit on mount/lineage switch and all no-op re-renders during resize.

### `apps/web/components/character-sheet/combat-state.tsx:39-46`
**Clear-button eligibility predicate ("has clearable combat state") hand-derived in the component**  
*conventions · ⚠ unverified · slice: cs-root*

`const hasState = character.ailments.length > 0 || conditions.attack !== "neutral" || conditions.defense !== "neutral" || conditions.hitEvasion !== "neutral" || conditions.charged || conditions.concentrating` — this enumerates exactly the slices the engine's clear-combat-state mutation resets (ailments + the three Battle Condition axes + the two flags, deliberately excluding Exhaustion/Prisma) and gates `ClearCombatStateButton` (`disabled={pending || !hasState}` in combat-state/clear-combat-state-button.tsx line 30). CLAUDE.md lens: eligibility decisions computed in components instead of provided by the engine. The reset set is owned by `packages/game/src/engine/character/reduce/combat-state.ts`; if that mutation's scope ever changes (e.g. also clearing a future tracked condition), this UI predicate drifts and the button wrongly stays disabled while clearable state exists.

**Suggested fix:** Export a pure `hasClearableCombatState({ ailments, battleConditions })` from packages/game/src/engine/character/reduce/combat-state.ts (co-located with the clear mutation so the two cannot drift) and call it here; the `?? DEFAULT_BATTLE_CONDITIONS` defaulting folds into the helper.

### `apps/web/components/character-sheet/combat-state/ailment-list.tsx:29-35`
**aria-label on non-interactive generic elements is ignored/prohibited by ARIA — the intended announcements never happen**  
*a11y · ✓ verified · slice: cs-state*

`<p aria-label="No ailment" className="text-sm text-muted-foreground">—</p>`. `aria-label` is prohibited on the paragraph/generic roles and most AT ignores it there, so screen readers announce the bare em dash (or nothing), not "No ailment". The same dead-label pattern recurs across the slice: party-composition-row.tsx:31-35 (`<p aria-label="No party composition">—</p>`), perfection-widget.tsx:36-41 (`<div aria-label={`Perfection rank ...`}>` around the big letter), valor-widget.tsx:30-32 (`<span aria-label="Current Valor">Valor</span>`), and path-of-dawn-widget.tsx:27-33 / path-of-dusk-widget.tsx:27-33 where the span's aria-label ("Dawn Mode off") additionally contradicts its visible text ("Inactive").

**Suggested fix:** For the em-dash empty states, use visible or sr-only text (`<span className="sr-only">No ailment</span>` alongside the dash). For the rank letter and mode badges, drop the aria-label and let the real text content carry the meaning (add adjacent sr-only context if needed).

**Verifier:** The two primary-path quotes (ailment-list.tsx:29-35, party-composition-row.tsx:31-35) are verbatim accurate, and the ARIA premise is correct: `aria-label` is prohibited (not mapped) on role `paragraph` (`<p>`) and `generic` (`<div>`/`<span>` with no role), so AT support is unreliable and these elements have no precedent role here. The genuinely real instances are the two em-dash empty states, where a screen reader gets only "—" with no spoken context — a small but real information loss; CLAUDE.md documents no exemption for this. The widget cases are much weaker than claimed: perfection/valor/dawn/dusk all render visible text that already carries meaning (the rank letter, "Valor", "Inactive"), so nothing is "never announced" there — the labels are merely dead/redundant, and 4 of the 6 cited files were given the wrong directory (mechanics/, not combat-state/). Net: a real but low-impact a11y/polish issue, sr-only-text fix direction is sensible.

### `apps/web/components/character-sheet/combat-state/condition-value.tsx:7-10`
**Hardcoded "Neutral" literal where BATTLE_CONDITION_LABELS.neutral is already imported in the same file**  
*conventions, debt · ⚠ unverified · slice: cs-state*

`if (state === "neutral") { return <span className="text-muted-foreground">Neutral</span> }` — the string is inlined even though the file imports `BATTLE_CONDITION_LABELS` from @/lib/ui/labels and uses it three lines later for increased/decreased (`{BATTLE_CONDITION_LABELS[state]}`). labels.ts defines `neutral: "Neutral"` (line 315), and the sibling renderer `AxisValueDisplay` in battle-condition-axis.tsx correctly uses `BATTLE_CONDITION_LABELS.neutral` for the same state. CLAUDE.md: "Display labels live in apps/web/lib/ui/labels.ts... don't redefine inline, even for a one-off consumer." If the label is ever reworded, the public read-only sheet and the owner Select will drift.

**Suggested fix:** Replace the literal with `BATTLE_CONDITION_LABELS.neutral`.

### `apps/web/components/character-sheet/combat-state/party-composition-row.tsx:20-24`
**Inline entries/filter/sort shaping plus a type cast in the component instead of a pure engine helper**  
*debt, conventions · ⚠ unverified · slice: cs-state*

`const entries = Object.entries(composition ?? {}).filter(([, count]) => typeof count === "number" && count > 0).sort(([a], [b]) => a.localeCompare(b)) as [Lineage, number][]` — this is exactly the shape CLAUDE.md's convention targets: "The inline .filter().map() blocks that turn hydrated state into the shape a section renders should be a pure helper in packages/game/src/engine/<domain>/ — the tab root calls one helper and focuses on layout." The trailing `as [Lineage, number][]` also papers over Object.entries' key-widening, which CLAUDE.md rule 8 calls out ("a type cast that papers over a real mismatch"). Mitigating context: the block carries `TODO(UNN-192)` marking the whole sub-block temporary scaffolding until the initiative tracker owns party composition, so the cost is bounded — but the cast and shaping are live code until then.

**Suggested fix:** If UNN-192 is not imminent, extract a `resolvePartyComposition(composition: PartyComposition | null): { lineage: Lineage; count: number }[]` pure helper in packages/game/src/engine (typed without the cast) and have the row render its output; otherwise fold this into the UNN-192 removal.

### `apps/web/components/character-sheet/command-palette.tsx:1-154`
**Desktop-only, rarely-opened command palette ships cmdk + registry in the critical sheet bundle for every viewer, including mobile and signed-out visitors**  
*perf · ⚠ unverified · slice: cs-root*

`import { Command, CommandDialog, ... } from "@workspace/ui/components/command"` — that module statically imports the `cmdk` package — and the component is mounted unconditionally at the top of `app/c/[shortId]/page.tsx` (line 118) for every viewer of the public sheet. The component itself documents it is "a desktop-only power-user accelerant" and "Suppressed on touch viewports" (`if (isMobile) return null`, line 85) — but `useIsMobile()` starts `undefined → false`, so even on phones the full dialog tree mounts for the first client render before nulling out, and the bundle bytes (cmdk + `lib/commands/registry` + providers) are downloaded and parsed by 100% of visitors for an affordance only opened via ⌘K. This is the textbook `next/dynamic` candidate: a self-contained, closed-by-default widget behind a keyboard chord.

**Suggested fix:** Split the ⌘K listener (a few lines, no heavy imports) from the dialog body and load the body with `next/dynamic(() => import("./command-palette-body"), { ssr: false })` on first open (or on idle). Mobile then never pays for it at all and desktop pays on first ⌘K instead of first paint.

### `apps/web/components/character-sheet/explore/virtues.tsx:224-235`
**aria-label "Add a Spark" does not contain the visible label "Add Spark" (WCAG 2.5.3 label-in-name)**  
*a11y · ✓ verified · slice: cs-surfaces*

`<Button size="sm" variant="outline" disabled={disabled} aria-label="Add a Spark"><SparkleIcon weight="bold" aria-hidden />Add Spark</Button>` — the aria-label overrides the visible text but the visible string "Add Spark" is not a substring of "Add a Spark", so voice-control users saying the visible label may fail to activate it. The aria-label is redundant anyway since the button has visible text.

**Suggested fix:** Remove the aria-label (the visible text names the button). The identical-text aria-labels on "Rank up a Virtue" (virtues.tsx:279) and "Add Talent" (talents.tsx:188) are harmless but equally droppable.

**Verifier:** Evidence is accurately quoted: virtues.tsx:230 sets aria-label="Add a Spark" on a Button whose only visible text is "Add Spark" (the SparkleIcon is aria-hidden), and Button spreads {...props} so the aria-label lands on the rendered native button. "Add Spark" is not a contiguous substring of "Add a Spark", so this genuinely violates WCAG 2.5.3 Label in Name and can break voice-control activation by visible label. No CLAUDE.md convention sanctions redundant aria-labels on already-labeled buttons; the sibling aria-labels at virtues.tsx:279 and talents.tsx:188 match their visible text exactly and are correctly flagged as harmless. The suggested fix (drop the aria-label so the visible text is the accessible name) is correct and minimal.

### `apps/web/components/character-sheet/header-owner-actions.tsx:74-75`
**Inline implementation comments violate CLAUDE.md 'Avoid inline comments' convention**  
*debt · ⚠ unverified · slice: cs-root*

```ts
// Two write surfaces so HP/SP (vitals) and Victories (progression) keep
// independent `pending` — a Victories click shouldn't disable Adjust HP.
const pools = useCharacterWrite()
const victories = useCharacterWrite()
```

Also lines 139-143 (JSX block comment explaining the inline affordance) and 184 (collapsed affordance comment). CLAUDE.md: 'Avoid inline comments. If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions.'

**Suggested fix:** For the two-write-surface explanation: extract named constants `const poolsWrite = useCharacterWrite()` and `const victoriesWrite = useCharacterWrite()` — the names document the intent without needing a comment. The JSX block comments can be removed; the ButtonGroup's aria-label and the conditional div's responsive class already describe the two branches.

### `apps/web/components/character-sheet/header-owner-actions.tsx:82`
**optimisticVictories is a misleadingly named alias for character.victories**  
*debt · ⚠ unverified · slice: cs-root*

```ts
const optimisticVictories = character.victories
```

character from useCharacter() is already the optimistic hydrated character — every field on it is optimistic. The alias implies separate tracking (like a local useState) but simply renames one field with a redundant qualifier. It's used in 4 places where `character.victories` would be equally readable and more accurate.

**Suggested fix:** Remove the alias and use `character.victories` directly at all 4 call sites. If the intent is to emphasise it's the optimistic value, a code comment on useCharacter() in the hook file is a better place to document that all returned fields are optimistic.

### `apps/web/components/character-sheet/inventory-quantity-stepper.tsx:29-31`
**Inline comment explaining render-phase state sync pattern**  
*debt · ⚠ unverified · slice: cs-root*

```ts
// Re-sync the editable draft whenever the committed value changes (a +/- tap
// or the optimistic frame settling) — React's render-phase pattern for
// adjusting state to a prop, avoiding a cascading-render effect.
const [lastValue, setLastValue] = useState(value)
if (value !== lastValue) { ... }
```

The render-phase update is non-obvious and warrants documentation, but CLAUDE.md points toward extraction rather than inline comments.

**Suggested fix:** Extract a helper function `syncDraftToCommitted(value, lastValue, setLastValue, setDraft)` so the function name carries the intent, or move the explanation into the file's JSDoc. Low urgency — the pattern is correctly implemented.

### `apps/web/components/character-sheet/inventory.tsx:146-148,181-183`
**Group headings jump to <h3> with no <h2> ancestor on the Inventory tab**  
*a11y · ✓ verified · slice: cs-root*

<h3 className="text-xs font-semibold ...">{group.heading}</h3> — the card titles above them (CardTitle in packages/ui/src/components/card.tsx line 47) render as <div>s, so on the Inventory tab the heading outline goes h1 (character name) → h3 ("Weapons"/"Armor"/"Consumables") with no h2. add-item-dialog.tsx line 74 has the same h3-under-DialogTitle pattern (fine there, DialogTitle is an h2), but on the page surface the skipped level makes the SR heading outline imply these groups are subsections of a missing section.

**Suggested fix:** Use h2 for the group headings (visual style is class-driven, unaffected), or render the card's "Inventory"/"Equipped" titles as real h2s via CardTitle's render/asChild escape hatch so the h3s nest correctly.

**Verifier:** Verified exact quotes: inventory.tsx:146-148 and 181-183 render group labels as <h3>, and CardTitle (card.tsx:47) is a plain <div data-slot="card-title">, not a heading — so "Equipped"/"Inventory" card titles are absent from the heading tree. Since the only other heading on the sheet surface is the character-name <h1> (sheet-header.tsx:77) and the Inventory tab renders in a TabsContent panel on that same page with no aria-level override, the outline genuinely skips from h1 to h3 with no h2 (WCAG 1.3.1 heading-order). The primary suggested fix (use <h2>, class-driven visual unchanged) is sound; the secondary suggestion is slightly off (CardTitle has no render/asChild prop — it's a bare div), but the fix direction holds. It's a real but minor semantic/screen-reader-navigation defect, not a blocker, and the same h3-under-div-title pattern recurs sheet-wide (identity/background), so it's an accepted-by-habit but undocumented inconsistency rather than an inventory-only slip — polish severity.

### `apps/web/components/character-sheet/mechanics/knight/valor-stepper.tsx:18-54`
**Structural near-duplicate: `ValorStepper` and `ExhaustionStepper` share identical ±button layout**  
*debt · ⚠ unverified · slice: cs-state*

diff of valor-stepper.tsx vs combat-state/exhaustion-stepper.tsx shows the same `div.flex.items-center.gap-1` container, the same two `Button type=button variant=outline size=icon-xs` with `MinusIcon`/`PlusIcon`, the same `pending || value <= 0` / `pending || value >= MAX` disabled gate. They differ only in aria-labels, clamp constants, and write edit kind. ExhaustionStepper additionally self-reads `exhaustion` from `useCharacter()` while `ValorStepper` receives `value` as a prop.

**Suggested fix:** Low confidence — CLAUDE.md explicitly cautions against premature abstraction. The two steppers serve different domains and differ at the read-source seam. Flag for awareness; merge only if a third stepper appears (Perfection already uses a custom layout with a reset button, so the pattern has not generalised cleanly).

### `apps/web/components/character-sheet/mechanics/mage/stain-slot.tsx:109-128`
**Hand-rolled aria-pressed toggle buttons for the element picker where the packages/ui Toggle/ToggleGroup primitive is the established pattern**  
*conventions · ⚠ unverified · slice: cs-state*

The element swatch grid is raw `<button type="button" aria-label={...} aria-pressed={element === token} onClick={...}>` with manually-assembled pressed styling (`element === token ? "ring-2 ring-foreground..." : "hover:brightness-105"`). packages/ui ships both toggle.tsx and toggle-group.tsx, and this very slice already uses `Toggle` for the identical press-state-row gesture (ailment-editor.tsx's DownedRow/AilmentRow and flag-row.tsx's owner toggles). The shadcn-first convention (CLAUDE.md Habits: "see if there is a shadcn/ui component that already does what you need") plus the user's recorded shadcn-first preference make this a hand-rolled re-implementation of an available primitive — including hand-maintaining the pressed a11y state the primitive provides for free (with Base UI's keyboard behavior).

**Suggested fix:** Render the five swatches as a single-select ToggleGroup (or per-element Toggle) from @workspace/ui, passing the existing STAIN_TILE_CLASSES styling via className and pressed-state variants; keep the choose() close-and-write behavior in onValueChange/onPressedChange.

### `apps/web/components/character-sheet/mechanics/perfection-widget.tsx:31-32`
**Vestigial `displayRank` alias adds indirection without value**  
*debt · ⚠ unverified · slice: cs-state*

Lines 31-32:
`const displayRank = state.rank`
Then `displayRank` is used everywhere. It is simply `state.rank` aliased to a new name. The JSDoc describes a past design intent ("optimistic rank re-derived from the character") but the current implementation reads directly off the prop — the alias is a hollow remnant. Convention: no vestigial indirection.

**Suggested fix:** Delete the `displayRank` alias and use `state.rank` directly at each call site (4 occurrences in the same function).

### `apps/web/components/character-sheet/mechanics/warlock/dusk-mode-toggle.tsx:12`
**JSDoc says "Healer's Path of Dusk" — should be "Warlock's"**  
*debt · ⚠ unverified · slice: cs-state*

Line 12: `* Owner-mode Dusk Mode toggle for the Healer's Path of Dusk.` — copy-pasted from dawn-mode-toggle.tsx and the class noun was not updated. The Warlock owns Path of Dusk, not the Healer.

**Suggested fix:** Change to "Warlock's Path of Dusk".

### `apps/web/components/character-sheet/mechanics/warrior/perfection-controls.tsx:19, 57-58`
**Perfection clamp bound re-derived in the UI from a display-labels array instead of importing the engine's PERFECTION_MAX_RANK**  
*conventions · ⚠ unverified · slice: cs-state*

`const MAX_RANK = PERFECTION_RANK_LABELS.length - 1` derives the game's rank ceiling from the length of a display-label array. The engine already owns this constant: packages/game/src/foundation/mechanics/schema.ts line 76 exports `PERFECTION_MAX_RANK = 4` (reachable via the @workspace/game/foundation barrel), and its JSDoc explicitly warns the labels array "must stay in lockstep" with it — i.e. the labels array is the derived artifact, not the source. Sibling controls in this same slice do it right: exhaustion-stepper.tsx imports MAX_EXHAUSTION_LEVEL from the engine and valor-stepper.tsx imports VALOR_MAX from foundation. A rule-value (the clamp gate on the +/- buttons) computed from presentation data is game logic leaking into the UI layer.

**Suggested fix:** Import PERFECTION_MAX_RANK from @workspace/game/foundation and use it for the atMax gate; drop the local MAX_RANK derivation.

### `apps/web/components/character-sheet/mechanics/widget-registry.tsx:18-31`
**Registry JSDoc directs contributors to a module path that no longer exists (lib/game/mechanics/)**  
*conventions · ⚠ unverified · slice: cs-state*

"adding a new mechanic is one entry here plus the per-mechanic module under [lib/game/mechanics/](../../../lib/game/mechanics/)" and "the per-mechanic modules in `lib/game/` deliberately stay React-free" — apps/web/lib/game was removed in the engine-reorg; mechanics now live in packages/game/src/engine/mechanics (confirmed: the directory does not exist, and CLAUDE.md documents the extraction). This is the doc that tells a future contributor where the other half of "adding a new mechanic" lives, so the dead link actively misdirects the registry's primary extension workflow. CLAUDE.md rule 3 mandates documentation; documentation that points at deleted paths is worse than none.

**Suggested fix:** Update both references to packages/game/src/engine/mechanics/ (and re-check the relative markdown link, which can't resolve across the package boundary — a plain path in prose is fine).

### `apps/web/components/character-sheet/owner-controls-slot.tsx:18-26`
**aria-label on a generic <div> is prohibited ARIA and inert**  
*a11y · ✓ verified · slice: cs-root*

<div data-testid="owner-controls-slot" aria-label="Owner controls" className="flex flex-wrap items-center gap-2"> — per the ARIA spec, aria-label is prohibited on elements with an implicit generic role; browsers/AT ignore it (and axe flags it as "aria-prohibited-attr"). The label the author intended ("Owner controls") is never exposed. Inside it, HeaderOwnerActions already renders a ButtonGroup with role="group" aria-label="Owner actions", so the div's label is also redundant.

**Suggested fix:** Either remove the aria-label (the inner ButtonGroup already provides the group semantics) or add role="group" to the div if a named container is genuinely wanted.

**Verifier:** Evidence is verbatim-accurate: owner-controls-slot.tsx:18-26 is a bare <div> with data-testid, aria-label="Owner controls", and className but no role, so it carries the implicit generic role where ARIA prohibits aria-label (browsers/AT ignore it; axe flags aria-prohibited-attr), meaning the intended label is never exposed. The redundancy claim also checks out for md+: the inner HeaderOwnerActions renders a ButtonGroup that is a <div role="group" aria-label="Owner actions"> (confirmed in packages/ui/src/components/button-group.tsx:31 and header-owner-actions.tsx:143). This is not an accepted pattern — every other aria-label in the character-sheet directory sits on an interactive element (input, Button, ComboboxTrigger) where it's valid, only this slot misuses it on a generic div, and CLAUDE.md documents no exception. The label was already inert so no user is harmed today; it's a dead, prohibited attribute — polish, not a blocker.

### `apps/web/components/character-sheet/rest-dialog.tsx:73-81`
**Shared Result shape re-spelled as an inline union instead of reusing the Result utility**  
*conventions · ⚠ unverified · slice: cs-root*

The `dispatch` helper types its action as `Promise<{ ok: true; value: { version: number } } | { ok: false; error: TError | "stale" }>` — a structural re-declaration of the foundation `Result` type that CLAUDE.md says to reuse ("Reuse existing `Result` utility where appropriate"). The sibling slice file editable-detail-field.tsx (line 3) already imports `type Result` from `@workspace/game/foundation` and writes the equivalent as `Promise<Result<{ value: string; version: number }, string>>`, so the established spelling exists one file over.

**Suggested fix:** Import `Result` from `@workspace/game/foundation` and declare the action as `(expectedVersion: number) => Promise<Result<{ version: number }, TError | "stale">>`.

### `apps/web/components/character-sheet/rest/partial-rest-form.tsx:51-83`
**Rest-form validation errors have no text: color-only invalid ring plus a silently disabled submit**  
*a11y · ✓ verified · slice: cs-state*

`<Input id="partial-skill-dice" ... aria-invalid={diceInvalid || undefined} />` and `<Button onClick={submit} disabled={disabled || diceInvalid || spInvalid}>`. When the user types more dice than `skillDiceRemaining`, the only feedback is the `aria-invalid` destructive ring (color alone) and the submit button disabling with no stated reason — there is no visible error message and no `aria-describedby` pointing at one, failing WCAG 3.3.1 (errors must be described in text). A screen reader hears "invalid entry" but not why; a sighted user just sees a button that won't click. Identical structure in respite-form.tsx:52-84.

**Suggested fix:** Render a small error line (e.g. `Only ${skillDiceRemaining} Skill Dice remaining`) when invalid, wired to the input via `aria-describedby`; same for respite-form.tsx. validateDiceInput already centralizes the rule, so the message can derive from the same max.

**Verifier:** The evidence is exactly quoted: both partial-rest-form.tsx (51-83) and respite-form.tsx (52-84) wire only aria-invalid={...||undefined} (color-only destructive ring) with no aria-describedby, no role="alert" error line, and a submit button disabled with no stated reason. I traced the full chain (forms, DiceReadout, RestDialog parent) and confirmed no inline error text exists; the parent's toast only fires on a server round-trip, which is unreachable for the over-cap case because submit is disabled client-side. This is a genuine WCAG 3.3.1 gap not sanctioned by any CLAUDE.md pattern, and the suggested fix (error line + aria-describedby deriving from validateDiceInput) is sensible. Severity is P3, not a blocker: max={skillDiceRemaining} is set on the number input and the remaining-dice count is shown in the adjacent readout two lines up, so the form stays operable and the constraint is visible — just not programmatically associated as an error.

### `apps/web/components/character-sheet/sheet-tabs.tsx:29-33`
**SheetTabsProps exported interface has no external consumers**  
*debt · ⚠ unverified · slice: cs-root*

```ts
export interface SheetTabsProps {
  combat: ReactNode
  explore: ReactNode
  inventory: ReactNode
  archetypes: ReactNode
}
```

Grep confirms zero imports of SheetTabsProps outside sheet-tabs.tsx. The exported interface adds public surface with no benefit.

**Suggested fix:** Remove the `export` from the interface declaration, or inline the prop shape directly into the SheetTabs function signature.

### `apps/web/components/character-sheet/skills.tsx:40-42`
**Inline .filter() partition of hydrated skills in the tab component instead of an engine helper**  
*conventions · ⚠ unverified · slice: cs-root*

`const sorted = sortSkillsByKind(character.skills); const regular = sorted.filter((entry) => !entry.isSynthesis); const synthesis = sorted.filter((entry) => entry.isSynthesis)` — hydrated state is shaped into the two sections this tab renders directly in the component. CLAUDE.md Code Conventions: "Per-tab data shaping lives next to the data, not in the component. The inline .filter().map() blocks that turn hydrated state into the shape a section renders should be a pure helper in packages/game/src/engine/<domain>/ … the tab root calls one helper and focuses on layout." The natural home already exists — `packages/game/src/engine/skills/utils.ts` owns `sortSkillsByKind` — and this is the only place in apps/web that partitions on `isSynthesis`, so the section-defining rule (what counts as the Synthesis section) currently lives in the UI layer.

**Suggested fix:** Add a pure `partitionSkillsForSheet(skills)` (or `sortAndPartitionSkills`) returning `{ regular, synthesis }` to packages/game/src/engine/skills/utils.ts (with a unit test beside sortSkillsByKind's), and have Skills() call that one helper.

### `apps/web/components/character-sheet/victories-controls.tsx:102-109`
**Redundant aria-label on Victories trigger strips the count and mismatches the visible label**  
*a11y · ✓ verified · slice: cs-root*

<Button size="sm" variant="outline" aria-label="Victories"><TrophyIcon .../>Victories ({victories}/{VICTORIES_PER_LEVEL})</Button> — the button already has a complete text label; the aria-label overrides it, so screen readers announce "Victories" without the (3/7) progress the sighted user sees on the same control. The visible text "Victories (3/7)" is also not contained in the accessible name (WCAG 2.5.3). The count is recoverable from the header's read-only Victories line, so impact is informational rather than blocking.

**Suggested fix:** Delete the aria-label and let the button's content name it — the content-derived name ("Victories (3/7)") is strictly better.

**Verifier:** Evidence is accurately quoted (victories-controls.tsx:102-109): the PopoverTrigger's Button has aria-label="Victories" while its visible content is "Victories ({victories}/{VICTORIES_PER_LEVEL})" with an aria-hidden TrophyIcon. The aria-label overrides the content-derived accessible name, so screen readers announce "Victories" without the (3/7) progress, and the visible string isn't a substring of the accessible name — a genuine WCAG 2.5.3 (Label in Name) issue, not a documented project pattern (CLAUDE.md has no aria-label convention). The suggested fix is sound: there is no icon-only or behavioral need for the override, and the content-derived name strictly improves on it. Impact is informational, not blocking — the count is also rendered read-only in the header (sheet-header.tsx:97-99) — so this is polish-level.

### `apps/web/components/character-sheet/victories-controls.tsx:30-79`
**VictoriesActions exported despite being an internal sub-component with no external consumers**  
*debt · ⚠ unverified · slice: cs-root*

```ts
export function VictoriesActions({ ... }) {
  ...
}
```

Grep across all of apps/web finds zero imports of VictoriesActions outside victories-controls.tsx itself. Only VictoriesPopover and VictoriesDialog are the public API — both consume VictoriesActions internally. The export is unused public surface.

**Suggested fix:** Remove the `export` keyword from VictoriesActions. It is only a composition helper for the two exported container variants.

### `apps/web/components/combat/combat-console.tsx:82-84`
**fallenPcNames derived with inline .filter().map() in the console root instead of by the roster view-shaper**  
*conventions · ⚠ unverified · slice: combat-root*

`const fallenPcNames = roster.players.filter((row) => row.isFallen).map((row) => row.name)` — the engine's `buildRosterView` (packages/game/src/engine/encounter/roster-view.ts) already owns per-row `isFallen` and the enemy rollup counts (`downedEnemyCount`); the one remaining roster-derived list (the names the EndCombatDialog reminder renders) is shaped in the component, contrary to "the tab root calls one helper and focuses on layout" and the no-inline-shaping convention.

**Suggested fix:** Have RosterView carry `fallenPcNames` (computed in roster-view.ts alongside downedEnemyCount) and pass it straight to EndCombatDialog.

### `apps/web/components/combat/combat-console.tsx:59-64, 145-147`
**campaignShortId typed as required string but actually an empty-string sentinel, re-guarded by truthiness in three components**  
*conventions · ⚠ unverified · slice: combat-root*

Prop declared `campaignShortId: string` yet rendered as `{campaignShortId ? <CampaignBackLink campaignShortId={campaignShortId} /> : null}`; the same required-type-plus-truthiness-guard pair repeats in encounter-setup.tsx:64,161-163 and ended-stub.tsx:16,20-22. The source is app/combat/[shortId]/page.tsx:52 `const campaignShortId = campaign?.shortId ?? ""`, which collapses maybe-absent into `""`. The type lies about the value's domain (per the honest-names/types convention): every consumer must rediscover the empty-string convention, and if the campaign join is in fact guaranteed (encounters carry a required campaignId), all three guards are dead branches.

**Suggested fix:** Type the prop honestly as `campaignShortId: string | null` (passing `campaign?.shortId ?? null` from the page) so the guards are self-documenting — or, if the campaign is guaranteed by the FK, drop the sentinel and the three conditionals.

### `apps/web/components/combat/combat-console.tsx:78-93, 244-246`
**Console re-runs the full view-shaping pipeline (enemy statblock hydration + four view builders) on every render, including pure UI-state flips like opening/closing the drawer or end-of-turn modal**  
*perf · ⚠ unverified · slice: combat-root*

`const enemyStatblockById = resolveCatalogEnemyStatblocks(session.combatants)`, `const view = buildConsoleView(session, pcDetailById, enemyStatblockById)`, `const roster = buildRosterView(...)`, `combatantDetail(...)` (when the drawer is open), and inline-in-JSX `<ZoneLayout view={resolveZoneLayout(session, pcDetailById, enemyStatblockById)} />` all execute on every render of CombatConsole with no memoization. Renders are triggered not just by session changes but by the two local UI states — `setSelectedCombatantId` (every rail-row tap and drawer close) and `setModalOpen` (every End-turn beat) — neither of which changes any input to these functions. `resolveCatalogEnemyStatblocks` is not a plain projection: per unique enemy it re-hydrates skills through `hydrateEnemySkills` (catalog `getSkill` lookups, `attackRollEffectsFromSkills`, `skillAttackRollContext` + `resolveAttackRollFrom` per skill, statblock.ts:95-105 / hydrate-enemy-skills.ts:25-48). The engine doc itself says the map is meant to be "built once per render at the assembly boundary" — here it's rebuilt 5 times over per interaction beat (open drawer, dispatch optimistic, commit, refresh, close).

**Suggested fix:** Wrap the pipeline in `useMemo`: `enemyStatblockById` keyed on `session.combatants`, and `view`/`roster`/zone-layout keyed on `[session, pcDetailById, enemyStatblockById]`; derive `selectedDetail` in a memo keyed on those plus `selectedCombatantId`. Combatant counts are small so this is not user-visible today, but it's the console's hot loop and the memo boundaries are already obvious one-liners.

### `apps/web/components/combat/combat-console.tsx:121-122`
**Inline comment in CombatConsole (convention violation: no inline comments)**  
*debt · ⚠ unverified · slice: combat-root*

```ts
  // One realtime listener per PC combatant in the (optimistic) session, keyed
  // by shortId — adding or removing a PC mounts/unmounts its channel (UNN-373).
  const pcChannelIds = session.combatants.flatMap(...)
```

This comment explains a non-obvious pattern. Per CLAUDE.md §3 ('Avoid inline comments — if code needs a comment, refactor'), extract the flatMap into a named function: `pcCombatantChannels(session.combatants, pcShortIdById)`.

**Suggested fix:** Extract to `function pcCombatantChannels(combatants, pcShortIdById): { characterId, shortId }[]` — the function name replaces the comment.

### `apps/web/components/combat/combat-console.tsx:82-84`
**Fallen-PC names projected via inline .filter().map() instead of the engine roster view that owns sibling derivations**  
*conventions · ⚠ unverified · slice: combat-root*

`const fallenPcNames = roster.players.filter((row) => row.isFallen).map((row) => row.name)` shapes the engine's RosterView into EndCombatDialog's render input inside the component. The engine's roster-view.ts already owns this family of rollups — it computes `downedEnemyCount: enemies.filter((row) => row.isDowned).length` (packages/game/src/engine/encounter/roster-view.ts:377) as part of `buildRosterView`. CLAUDE.md: inline `.filter().map()` blocks that turn hydrated state into a section's render shape belong in a pure engine helper, not the component.

**Suggested fix:** Add `fallenPlayerNames: string[]` to RosterView in roster-view.ts (beside `downedEnemyCount`), or a small exported selector there, and pass `roster.fallenPlayerNames` to EndCombatDialog.

### `apps/web/components/combat/combatant-rail-row.tsx:67-73`
**Active-counter derivation re-implemented inline in JSX, duplicated with the counters section**  
*conventions · ⚠ unverified · slice: combat-root*

`{COUNTER_KEYS.filter((key) => (row.counters[key] ?? 0) > 0).map((key) => (<Badge ...>{COUNTER_STATUS_LABELS[key]} ×{row.counters[key]}</Badge>))}` inside the render, and combatant-counters-section.tsx:48-49 re-derives the same predicate (`const active = COUNTER_KEYS.filter((key) => (counters[key] ?? 0) > 0); const addable = COUNTER_KEYS.filter((key) => (counters[key] ?? 0) === 0)`). "Which counters are active on this combatant" is hydrated-state shaping computed independently in two components from the raw `Record<CounterKey, number>`, instead of the engine view-shapers (which already produce RailRow/CombatantDetail) exposing it once.

**Suggested fix:** Expose an `activeCounters: { key, count }[]` (and the addable complement where needed) from the encounter view-shapers in packages/game/src/engine/encounter/, and render those lists directly in both components.

### `apps/web/components/combat/combatant-rail-row.tsx:96-98`
**Engagement status labels re-encoded inline instead of using ENGAGEMENT_STATUS_LABELS**  
*conventions · ⚠ unverified · slice: combat-root*

`{row.engagement.status === "engaged" ? "Engaged" : "Free"}` hardcodes the exact strings of `ENGAGEMENT_STATUS_LABELS` (apps/web/lib/ui/labels.ts:370-373: `{ free: "Free", engaged: "Engaged" }`), which the sibling combat components engagement-control.tsx and combatant-engagement-section.tsx already import. CLAUDE.md: display label maps turning a domain key into a human-readable string live in labels.ts — "don't redefine inline, even for a one-off consumer." Relatedly, the domain-state word "Downed" is hardcoded twice (this file lines 63-66 and combatant-rail.tsx:49) rather than sourced from the ailment catalog name / a label.

**Suggested fix:** Render `ENGAGEMENT_STATUS_LABELS[row.engagement.status]` here; source the Downed badge/rollup text from `getAilment("downed")?.name` or a shared label so a rename happens in one place.

### `apps/web/components/combat/combatant-rail-row.tsx:96-98`
**Inline "Engaged"/"Free" strings duplicate the existing ENGAGEMENT_STATUS_LABELS map**  
*conventions · ⚠ unverified · slice: combat-root*

`<Badge variant="outline">{row.engagement.status === "engaged" ? "Engaged" : "Free"}</Badge>` re-spells the domain-key→string mapping that already exists in apps/web/lib/ui/labels.ts:370-373 (`ENGAGEMENT_STATUS_LABELS: Record<Engagement["status"], string> = { free: "Free", engaged: "Engaged" }`) and is used by the slice's own engagement-control.tsx and combatant-engagement-section.tsx. CLAUDE.md: "Display labels live in apps/web/lib/ui/labels.ts... don't redefine inline, even for a one-off consumer." If the label copy ever changes, the rail row silently diverges from the drawer and setup row. (The hardcoded "Downed" badge at lines 62-66 is a smaller adjacent instance — the canonical name lives on the ailment catalog entry used by watch-enemies-rail.tsx.)

**Suggested fix:** Replace the ternary with `ENGAGEMENT_STATUS_LABELS[row.engagement.status]` (already imported pattern in this folder).

### `apps/web/components/combat/combatant-setup-row.tsx:27-29`
**Stale JSDoc describes the removed Save-button persistence model (also in import-pcs-panel.tsx)**  
*conventions · ⚠ unverified · slice: combat-root*

The doc says "Placement and engagement mutate the shell's in-progress `CombatantSetup[]` and persist on Save / Start", and import-pcs-panel.tsx:14-16 says "Adding/removing only mutates the shell's in-progress `CombatantSetup[]` — no DB write per toggle (the roster persists on Save / Start, UNN-302)". Both are false since UNN-347 (commit 22cdb53, "optimistic writes, drop the Save button"): every toggle/placement now dispatches an event through `applyCombatEvent` and persists immediately — the shell's own JSDoc in encounter-setup.tsx:40-42 states "There is **no Save button**: the roster is always persisted". CLAUDE.md requires documentation to be written and kept honest ("always write documentation"; "names must not lie" extends to docs that assert the opposite of the write path's behavior) — a contributor reading these two files will reason about a batching model that no longer exists.

**Suggested fix:** Update both JSDocs to describe the per-interaction optimistic persistence (each toggle dispatches addCombatant/removeCombatant, placement dispatches moveCombatant, all persisted immediately via applyCombatEvent).

### `apps/web/components/combat/combatant-vitals-section.tsx:72-82`
**poolErrorMessage defined inside the component, diverging from the established lib/actions error-message home and near-duplicating its copy**  
*conventions · ⚠ unverified · slice: combat-root*

`function poolErrorMessage(error: AdjustPoolActionError): string { switch (error) { case "stale": return "This character changed elsewhere — reload and try again." ... } }` lives in the drawer section component. The established pattern for action-error→user-message maps is a module next to the action: `encounterErrorMessage` in apps/web/lib/actions/encounter/error-message.ts, which both use-combat-console.ts and use-encounter-setup.ts import. That module already contains the sibling string "This encounter changed elsewhere. Reload and try again." — so the same stale-write message now exists twice with drifted punctuation (em-dash vs period). The pools actions (lib/actions/adjust-pools.ts) have other consumers (sheet header actions, command palette), so the next surface that surfaces these errors will re-map them.

**Suggested fix:** Move the map to apps/web/lib/actions/adjust-pools/error-message.ts (or alongside adjust-pools.schema.ts), mirroring lib/actions/encounter/error-message.ts, and import it here.

### `apps/web/components/combat/conditions-controls.tsx:44-48`
**Battle-condition flag vocabulary enumerated in the UI layer instead of foundation**  
*conventions · ⚠ unverified · slice: combat-root*

`const FLAG_KEYS: readonly BattleConditionFlagKey[] = ["charged", "concentrating"]` — the component imports `BATTLE_CONDITION_AXIS_KEYS` from @workspace/game/foundation three lines up (the axis vocabulary is foundation-owned, per the layering doc: "fixed vocabulary (LINEAGES, VIRTUE_KEYS, DAMAGE_TYPES)"), but the flag-key array has no foundation export (foundation/character/character-edit.ts:10 defines only the type), so the UI hand-enumerates the closed union. A third flag added to `BattleConditionFlagKey` would typecheck while this control silently fails to render it; apps/web/components/character-sheet/combat-state/flag-row.tsx independently re-enumerates the same pair, confirming the missing primitive.

**Suggested fix:** Export `BATTLE_CONDITION_FLAG_KEYS` from foundation next to BATTLE_CONDITION_AXIS_KEYS (derived so it stays in sync with the union, e.g. `satisfies readonly BattleConditionFlagKey[]` over an exhaustive tuple) and import it here and in flag-row.tsx.

### `apps/web/components/combat/conditions-controls.tsx:44-48`
**Battle-condition flag vocabulary hand-enumerated in the component instead of exported from foundation**  
*conventions · ⚠ unverified · slice: combat-root*

`const FLAG_KEYS: readonly BattleConditionFlagKey[] = ["charged", "concentrating"]` re-enumerates a closed foundation union (packages/game/src/foundation/character/character-edit.ts:10: `export type BattleConditionFlagKey = "charged" | "concentrating"`) right beside an import of the axis twin `BATTLE_CONDITION_AXIS_KEYS` from `@workspace/game/foundation` — the established home for fixed vocabulary per CLAUDE.md ("foundation/ — types, Zod schemas, fixed vocabulary (LINEAGES, VIRTUE_KEYS, DAMAGE_TYPES)"). The same list is independently re-enumerated in apps/web/components/character-sheet/combat-state/flag-row.tsx:12-16. A flag added to the union won't surface in either editor — the readonly array doesn't require exhaustiveness, so the omission is silent.

**Suggested fix:** Export `BATTLE_CONDITION_FLAG_KEYS` from foundation next to `BATTLE_CONDITION_AXIS_KEYS` (deriving the type from the array, as the axis keys presumably do) and consume it in both conditions-controls.tsx and flag-row.tsx.

### `apps/web/components/combat/encounter-setup.tsx:127-136`
**Engagement dispatch ternary duplicated between setup shell and live engagement section**  
*debt · ⚠ unverified · slice: combat-root*

encounter-setup.tsx (lines 128-135):
  engagement.status === "engaged"
    ? { kind: "setEngagement", combatantId, targetCombatantIds: engagement.targetCombatantIds }
    : { kind: "clearEngagement", combatantId }
Identical structure in combatant-engagement-section.tsx (lines 33-38). Both map an `Engagement` to a `CombatEvent`.

**Suggested fix:** Per repo rules, two similar-looking blocks are NOT automatically a DRY violation. Confidence: Low — the repo explicitly says to resist premature abstraction, and these are 4 lines in two files that are genuinely different contexts (setup vs live). Flag only: if a third site emerges, extract `engagementToCombatEvent(combatantId, engagement): CombatEvent`.

### `apps/web/components/combat/encounter-watch.tsx:100-105`
**Watch battlefield shapes the snapshot into the enemies-rail render shape inline instead of via an engine helper**  
*conventions · ⚠ unverified · slice: combat-root*

`const enemies = snapshot.combatants.filter((combatant) => combatant.side === "enemies")` and `const zoneNameById = new Map(snapshot.zones.map((zone) => [zone.id, zone.name]))`, with WatchEnemiesRail then completing the join per enemy (`zoneNameById.get(enemy.zoneId) ?? null`, watch-enemies-rail.tsx:43). CLAUDE.md: "Per-tab data shaping lives next to the data, not in the component. The inline .filter().map() blocks that turn hydrated state into the shape a section renders should be a pure helper in packages/game/src/engine/<domain>/". The zone-map half of this very component already follows the rule (`resolvePlayerZoneLayout(snapshot)` from engine/encounter/resolve-player-view.ts); the enemies-rail half re-derives side filtering and zone-name resolution in the component.

**Suggested fix:** Add a `resolveWatchEnemies(snapshot)` peer next to resolvePlayerZoneLayout in packages/game/src/engine/encounter/ returning enemy rows with `zoneName` already resolved; Battlefield calls it and WatchEnemiesRail drops the Map prop.

### `apps/web/components/combat/encounter-watch.tsx:100-105`
**Battlefield shapes the enemies-rail data inline (.filter + zone-name Map) where the engine view-shaper convention applies**  
*conventions · ⚠ unverified · slice: combat-root*

`const enemies = snapshot.combatants.filter((combatant) => combatant.side === "enemies")` and `const zoneNameById = new Map(snapshot.zones.map((zone) => [zone.id, zone.name]))` shape the redacted snapshot into WatchEnemiesRail's render inputs inside the component, and the per-card zone resolution happens in JSX (`zoneNameById.get(enemy.zoneId) ?? null`, line 43 of watch-enemies-rail.tsx). The engine's own peer file for this exact surface states the convention being violated — packages/game/src/engine/encounter/resolve-player-view.ts:15-16: "Pure — recomputed on every poll, no `.filter().map()` in the component (CLAUDE.md convention)" — and already builds the identical `nameById` map internally (line 41). CLAUDE.md: per-surface data shaping "should be a pure helper in packages/game/src/engine/<domain>/ — the tab root calls one helper and focuses on layout."

**Suggested fix:** Add a `resolvePlayerEnemiesRail(snapshot)` helper next to `resolvePlayerZoneLayout` in packages/game/src/engine/encounter/ returning each enemy with its resolved zone name; Battlefield calls it and passes rows to WatchEnemiesRail, dropping the Map prop.

### `apps/web/components/combat/encounter-watch.tsx:139-156`
**'Reconnecting…' degraded-connection hint is not announced to assistive tech**  
*a11y · ✓ verified · slice: combat-root*

StatusPill renders `{stale ? <span className="text-xs">Reconnecting…</span> : null}` inside a plain `<span>` with no `role="status"`/`aria-live`. `stale` flips when a poll/realtime update fails, meaning everything on screen (HP bars, turn order, conditions) may be outdated — exactly the moment a screen-reader user should be told the data is stale. The hint appears and disappears silently, so an SR user keeps trusting a frozen snapshot with no indication anything is wrong.

**Suggested fix:** Give the stale hint `role="status"` (implicit aria-live polite), e.g. `<span role="status" className="text-xs">Reconnecting…</span>`, so the transition into the degraded state is announced once. Render the element persistently and toggle its text content (empty ↔ 'Reconnecting…') if Base-UI-free mount/unmount announcements prove unreliable.

**Verifier:** The evidence is accurately quoted: line 150 of encounter-watch.tsx renders the "Reconnecting…" hint as a bare `<span className="text-xs">` with no role/aria-live, and use-encounter-snapshot.ts confirms `stale` flips on a failed poll/realtime fetch while the frozen last-good snapshot stays on screen. It is a genuine a11y gap — the degraded-connection state is conveyed visually only, mounting/unmounting silently — and not an accepted project pattern (ranks-banner.tsx already uses `role="status"`, so live regions are an established primitive here). The suggested `role="status"` fix is sensible and purely presentational. I downgrade to P3 because this is a read-only public watch surface, the hint is by design a subtle secondary indicator, the content is never blanked, and `stale` self-clears on the next ~1.5s tick — a missing courtesy announcement, not an a11y blocker.

### `apps/web/components/combat/ended-stub.tsx:16`
**campaignShortId typed `string` but treated as truthy sentinel for empty string**  
*debt · ⚠ unverified · slice: combat-root*

  campaignShortId: string
  ...
  {campaignShortId ? <CampaignBackLink campaignShortId={campaignShortId} /> : null}
The caller (app/combat/[shortId]/page.tsx line 52) passes `campaign?.shortId ?? ""`. The empty string `""` is the sentinel for 'no campaign', but the prop is typed `string`, not `string | ""` or `string | null`. Same pattern in combat-console.tsx and encounter-setup.tsx. The type lies about the domain — `""` has a specific meaning here.

**Suggested fix:** Change the prop type to `string | null` in all three layout roots and pass `campaign?.shortId ?? null` from the page. This makes the null case explicit and removes the truthiness guard on a non-nullable type. Confidence: Medium — the current approach works, but the type misleads future readers.

### `apps/web/components/combat/enemies/enemy-catalog-browser.tsx:84-89`
**Committed-roster side counts computed with inline .filter().length in the component instead of an engine helper**  
*conventions · ⚠ unverified · slice: enemies-campaign*

```ts
const committedPlayers = existingCombatants.filter(
  (combatant) => combatant.side === "players"
).length
const committedEnemies = existingCombatants.filter(
  (combatant) => combatant.side === "enemies"
).length
```

CLAUDE.md Code Conventions: "Per-tab data shaping lives next to the data, not in the component. The inline .filter().map() blocks that turn hydrated state into the shape a section renders should be a pure helper in packages/game/src/engine/<domain>/ — the tab root calls one helper and focuses on layout." This surface's other shaping for the same screen (filterEnemyCatalogRows, groupEnemyRowsByLevel, enemyFamilyCounts) was correctly placed in packages/game/src/engine/enemies/catalog-rows.ts, but the per-side tally of the persisted CombatantSetup[] roster was left inline in the surface root; the engine's encounter domain (roster-view.ts already splits rows by side) is where a setupSideCounts-style helper belongs.

**Suggested fix:** Add a small pure helper in packages/game/src/engine/encounter/ (e.g. setupSideCounts(combatants: CombatantSetup[]): { players: number; enemies: number }) and call it from the browser root; encounter-watch.tsx's similar inline filter could share it.

### `apps/web/components/combat/enemies/enemy-catalog-browser.tsx:64-76`
**Static catalog derivations and the selected statblock recomputed on every render — per keystroke, the whole detail pane re-derives and re-parses**  
*perf · ⚠ unverified · slice: enemies-campaign*

`const rows = buildEnemyCatalogRows()` (line 64), `enemyFamilyCounts(rows)` (line 71), and `statblockFromEnemy(selectedDefinition)` (lines 74-76) all run in the render body with no memoization. `search` state lives in this component, so every keystroke re-runs them: `rows` and `familyCounts` are pure functions of the hardcoded catalog and never change, and `statblockFromEnemy` re-hydrates the selected enemy's skills (attack-roll context + effect resolution per skill, see engine/enemies/hydrate-enemy-skills.ts) even though the selection didn't change. The fresh `statblock` object identity also forces `EnemyStatblockCard` → `EnemyStatblock` to fully re-render each keystroke, including the `Prose` Markdown re-parse of `abilities`. Cheap at today's tens of catalog entries, but this is the surface whose own comment (enemy-catalog-list.tsx) anticipates growing "into the hundreds the AC anticipates", and the group sort (`groupEnemyRowsByLevel`'s per-group `localeCompare` sorts) scales with it.

**Suggested fix:** Hoist the static work out of the render path: compute `rows` at module scope (or `useMemo(..., [])`) and `familyCounts` with `useMemo(..., [rows])`; memoize the selected statblock with `useMemo(() => selectedDefinition ? statblockFromEnemy(selectedDefinition) : null, [selectedKey])`. The filter/group pair legitimately re-runs per keystroke and can stay as-is.

### `apps/web/components/combat/enemies/enemy-catalog-list.tsx:126-150`
**FamilyChip hand-rolls an exclusive-select toggle group with Button + aria-pressed where packages/ui ToggleGroup is the established primitive**  
*conventions · ⚠ unverified · slice: enemies-campaign*

```ts
function FamilyChip({ label, count, active, onClick }: {...}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      aria-pressed={active}
    >
```

The family filter (lines 68-84) is a single-select exclusive group ("All" + one chip per ENEMY_FAMILIES entry). packages/ui ships toggle-group.tsx, and the in-repo precedent for exactly this interaction is apps/web/components/combat/side-toggle.tsx, which wraps Base UI's single-select ToggleGroup ("Base UI's ToggleGroup is single-select by default, so this is a true segmented toggle"). CLAUDE.md Habits: "When building UI components, see if there is a shadcn/ui component that already does what you need." Hand-rolling forfeits the group's roving-focus/keyboard semantics Base UI provides and duplicates active-state styling logic the primitive already owns.

**Suggested fix:** Render the family filter as a ToggleGroup with a ToggleGroupItem per family (counts as item children), value=[family ?? "all"], mapping an empty/"all" selection to onFamilyChange(null) — mirroring side-toggle.tsx.

### `apps/web/components/combat/enemies/enemy-catalog-list.tsx:184-194`
**Row HP stat is icon-only: screen readers hear a bare number**  
*a11y · ✓ verified · slice: enemies-campaign*

`<span className="flex items-center gap-0.5"><HeartIcon className="size-3" /> {row.maxHP}</span>` — the HeartIcon (plain SVG, no aria-hidden/title by default) is the only thing identifying the number as max HP, so the row reads as "Goblin L1 12" to AT (WCAG 1.1.1). Mitigating: the full statblock in the detail pane does label HP textually ("max HP"), so the list value is supplementary rather than sole-source.

**Suggested fix:** Add an sr-only suffix (`<span className="sr-only">max HP</span>`) or `aria-label={`${row.maxHP} max HP`}` on the span, and `aria-hidden` on the icon. Consider expanding "L{row.level}" to sr-friendly "Level {row.level}" via sr-only text at the same time.

**Verifier:** Verified against source: line 187 is `<HeartIcon className="size-3" /> {row.maxHP}` with no `alt`/`aria-hidden`, and the Phosphor SSRBase (node_modules) confirms the icon emits a bare `<svg>` with no default `aria-hidden` and no `<title>` unless `alt` is passed — so AT reads the value as a label-less "12". This is a real WCAG 1.1.1 gap and an outlier against the codebase's own convention: every sibling (combatant-vitals-section, header-owner-actions, statblock-card) labels HP textually ("HP"/"max HP") and marks the heart icon `aria-hidden`. The suggested fix (sr-only "max HP" suffix + `aria-hidden` on the icon) is sensible and matches the established pattern. Severity is low because, as the finder notes, the value is supplementary — the detail pane (enemy-statblock-card.tsx:64-66) labels HP fully — so it's non-blocking polish rather than an a11y blocker.

### `apps/web/components/combat/enemies/enemy-catalog-list.tsx:101-105, 145-147`
**Count text at 70% opacity on tinted backgrounds is a clear contrast failure**  
*a11y · ✓ verified · slice: enemies-campaign*

Level-group headers render the row count as `<span className="font-normal text-muted-foreground/70">{group.rows.length}</span>` on a `bg-muted` sticky header; FamilyChip renders its count as `<span className={cn(active ? "opacity-70" : "text-muted-foreground")}>` on the active chip's primary background. In the light theme, `--muted-foreground` is oklch(0.5 0.012 270) on `--muted` oklch(0.955 0.006 80) — already roughly the 4.5:1 borderline at full opacity; compositing at 70% alpha lands the text near oklch L≈0.64 on L≈0.955, well under 4.5:1 (and under 3:1 for this small, normal-weight text). These are supplementary counts (the rows themselves are listed below), which is why this is polish rather than a blocker — but the failure itself is unambiguous.

**Suggested fix:** Drop the alpha/opacity modifiers: use plain `text-muted-foreground` on bg-muted for the group count, and `text-primary-foreground/90` (or no opacity) for the active chip count.

**Verifier:** Quotes are verbatim-accurate and the token values are exactly right. The group-count case (lines 103-105) is a genuine WCAG fail: I computed `text-muted-foreground/70` composited over `bg-muted` at 2.9:1 for small normal-weight text — below 4.5:1 and even below the 3:1 floor. The finder's full-alpha baseline ("borderline 4.5:1") is imprecise (actually 5.27:1), and the second cited location (active FamilyChip, lines 145-147) is NOT a failure (6.45:1 light / 4.93:1 dark, both pass) — but one real failure remains, it's not a documented pattern, and the fix is sensible. P3 because the failing element is a supplementary, decorative count duplicated by the rows listed directly below, matching the finder's own "polish not blocker" framing.

### `apps/web/components/combat/enemies/enemy-queue-rail.tsx:23-27`
**`QueuedEnemyItem` is exported but has no external importers — unnecessary public surface**  
*debt · ⚠ unverified · slice: enemies-campaign*

```ts
export interface QueuedEnemyItem {
  enemyKey: string
  name: string
  count: number
}
```

A grep of the entire `apps/web` tree finds zero importers outside this file. The interface is only used in the `items: QueuedEnemyItem[]` prop signature of `EnemyQueueRail` in the same file.

**Suggested fix:** Remove the `export` keyword. If the parent `EnemyCatalogBrowser` ever needs to type the shaped items array, it can derive the type from the prop signature or inline it.

### `apps/web/components/combat/start-combat-dialog.tsx:73`
**Inline comment in StartCombatDialog (convention violation)**  
*debt · ⚠ unverified · slice: combat-root*

```ts
    if (next) {
      // Reset to the current roster's suggestion each time the dialog opens.
      setAdvantage("neutral")
      setNeutralFirstSide(comparison.suggested ?? "players")
    }
```

**Suggested fix:** Extract the reset block to a named function `resetToRosterSuggestion()` and call it from the `if (next)` branch. The function name makes the intent self-documenting.

### `apps/web/components/combat/turn-order-strip.tsx:91-92`
**Two inline comments in TurnOrderStrip render branch (convention violation)**  
*debt · ⚠ unverified · slice: combat-root*

```ts
  // Acted or Fallen → a struck, greyed chip.
  if (isStruck(row)) { ... }
  // Still to act but not shown individually (the other side's pending, or
  // this side's picks during an active turn) → folded into "+N to act".
  return null
```

The branches are labeled by comments rather than by code structure.

**Suggested fix:** The three render branches (candidate, boxed, struck, folded) are already derived by `isCandidate`, `isBoxed`, `isStruck`. The first comment is redundant (isStruck already documents it). The second could become a JSDoc on a named helper: `function foldedIntoCounter(row)` or simply invert the guard. Remove the comments.

### `apps/web/components/combat/zone-layout.tsx:85-93`
**Adjacent-zone badges keyed by zone name — duplicate zone names produce duplicate React keys**  
*correctness · ✓ verified · slice: combat-root*

`{zone.adjacentZoneNames.map((name) => (<Badge key={name} variant="outline">{name}</Badge>))}` — keyed by display name. Zone names are free-text with no uniqueness check (zones-panel.tsx `addZone` accepts any non-empty trimmed string, and the engine ids zones by uuid), so a DM who names two zones "Corridor" and borders both to the same zone yields two children with key "Corridor": React logs the duplicate-key error and may drop/mis-reconcile one badge. This component renders on both the DM console and the public watch view.

**Suggested fix:** Carry the adjacent zones' ids through the view model (e.g. `adjacentZones: { id, name }[]` in `ZoneLayoutEntry`) and key by id; or as a minimal fix key by `\`${zone.id}:${index}\`` since the list is rebuilt from the view each render and never reorders in place.

**Verifier:** Verified end-to-end: the quote is accurate (zone-layout.tsx:88-91), zone names are free-text with no uniqueness guard (zones-panel.tsx addZone/renameZone only reject empty/unchanged), zones are uuid-keyed so duplicate names are permissible, and resolve-zone-layout.ts drops ids by mapping adjacent Zone objects to .name with no de-dup — so two same-named neighbors yield two Badges with the same key. Keying free-text by display name is not an accepted pattern (surrounding code keys by id; other non-id keys are closed unions that can't collide), and the suggested fix (carry ids in the view model, key by id) is correct and convention-aligned. It's a genuine but narrow edge case: triggers only when a DM deliberately names two zones identically and borders both to a third; the only user-visible artifact is a dev-console warning plus a possibly-mislabeled/dropped cosmetic "Borders" badge with no data loss, so it is polish-level rather than a material correctness bug.

### `apps/web/components/combat/zones-panel.tsx:105-107`
**Neighbor-name derivation re-implemented inline in the component, duplicating the engine's adjacentZoneNames shaping**  
*conventions · ⚠ unverified · slice: combat-root*

`const neighborNames = (adjacency[zone.id] ?? []).map((id) => zones[id]?.name).filter((name) => name !== undefined)` derives the "Borders X, Y" display list inside the render loop. The engine already owns this exact derivation for the same data — resolve-player-view.ts:46-49 (and resolve-zone-layout.ts) compute `adjacentZoneNames: (snapshot.adjacency[zone.id] ?? []).flatMap((id) => ...)` per zone. CLAUDE.md's shaping convention ("Per-tab data shaping lives next to the data, not in the component") plus the duplicate-logic warning in Code Style §8 both point at a shared helper; today a rename of the unresolved-id policy must be made in three places.

**Suggested fix:** Expose a small pure helper in packages/game/src/engine/encounter/ (e.g. reuse/extract the `adjacentZoneNames` projection from the zone-layout shapers, keyed by zoneId) and call it from ZonesPanel instead of re-deriving inline.

### `apps/web/components/editor/markdown-field.tsx:63-66, 102-106, 136-141, 143-145`
**Four inline comment blocks violate the no-inline-comments convention**  
*debt · ⚠ unverified · slice: small-surfaces*

```ts
// Stash the latest callbacks in refs so the Tiptap editor — which is a
// long-lived JS object, not a React effect — always invokes the current
// version without us having to re-create the editor on every render.
// Assigning the refs in an effect keeps render pure.
```

```ts
// Mirror the shadcn Textarea's content-area metrics ...
// (class string comment block at lines 102–106)
```

```ts
// Outer wrapper mirrors the shadcn Textarea's surface — same border, ...
// (class string comment block at lines 136–141, 143–145)
```

Claude.md Code Style rule 3: 'Avoid inline comments. If your code needs a comment to be understood, try refactoring it.' Four distinct blocks in one file.

**Suggested fix:** Lines 63–66: extract the callback-ref pattern into a named helper (e.g. useLatestRef) — the comment becomes unnecessary. Lines 102–106 and 136–145: extract the className strings into named constants (e.g. EDITOR_SURFACE_CLASS, EDITOR_WRAPPER_CLASS) with JSDoc explaining the rationale.

### `apps/web/components/shared/affinity-grid.tsx:40-44`
**aria-label on a generic <span> (prohibited ARIA) — Neutral affinity value may not be announced**  
*a11y · ✓ verified · slice: primitives*

`<span className="text-muted-foreground" aria-label="Neutral">—</span>` — WAI-ARIA 1.2 prohibits `aria-label` on elements with an implicit `generic` role, so exposure is inconsistent across browser/AT pairs (Firefox+NVDA ignore it); where ignored, the Neutral cell's value reads as "em dash" or nothing after the damage-type label. The code clearly intends the value to be accessible (the label was added deliberately), but the mechanism chosen is unreliable.

**Suggested fix:** Use text that is reliably exposed: `<span aria-hidden="true">—</span><span className="sr-only">Neutral</span>`, or keep the single span and give it `role="img"` so the aria-label becomes valid.

**Verifier:** Evidence is accurately quoted (lines 40-44 verified). The ARIA point is correct: a bare <span> has the implicit `generic` role, and WAI-ARIA 1.2 prohibits `aria-label` there ("name from author" unsupported), so exposure is genuinely inconsistent across browser/AT pairs — where ignored, the <dd> falls back to the em-dash text. No documented project pattern sanctions this; the only other aria-labels in scope sit on interactive elements where they're valid, and the suggested fix (role="img" or an sr-only span) matches a pattern already used elsewhere in the codebase. Severity is low, though: this is a read-only chart, each value's <dd> is paired with a <dt> damage-type label that is always announced, and the failure mode is merely an unclear/unannounced "Neutral" secondary value (not a wrong value), so it is real polish rather than a blocker.

### `apps/web/components/shared/cast-button.tsx:57-59`
**Inline code comment inside function body (CLAUDE.md §3 violation)**  
*debt · ⚠ unverified · slice: primitives*

// Affordability routes through the shared `canAfford` primitive // (UNN-231) so the disabled state can never drift from `applyResolvedCost` // (server engine) or the optimistic reducer. — This explains why canAfford is used, which is load-bearing rationale but belongs in the JSDoc on the function, not inline.

**Suggested fix:** Move the explanation into the existing JSDoc block above CastButton, or into a JSDoc on the canAfford call site. The CLAUDE.md rule is: 'Avoid inline comments. If your code needs a comment to be understood, try refactoring it … however, always write documentation (e.g. JSDocs).'

### `apps/web/components/shared/origin-lineage-indicator.tsx:1`
**Shared presentational component imports phosphor's client-only CSR entry, silently pinning the archetype rendering kit to client trees**  
*perf · ⚠ unverified · slice: primitives*

`import { CompassIcon } from "@phosphor-icons/react"` — the package's root entry resolves to dist/csr/Compass.es.js, whose IconBase (dist/lib/IconBase.es.js) calls `e.useContext(h)` at render, and the package ships no "use client" banner anywhere in dist (verified by grep). origin-lineage-indicator.tsx itself has no "use client" and is consumed by archetype-detail-header.tsx, whose JSDoc advertises it as the decoupled header "every surface that opens a full Archetype view renders". Today every consumer happens to sit under a client boundary so it works, but the moment any surface composes ArchetypeDetailHeader (or this indicator) from a true RSC, React throws on the context read — and meanwhile the otherwise server-renderable kit can never be server-rendered. The repo already has the established fix pattern: 20+ files (e.g. components/combat/watch-enemies-rail.tsx line 3) import from `@phosphor-icons/react/dist/ssr`, the context-free entry.

**Suggested fix:** Change the import to `@phosphor-icons/react/dist/ssr` (renders identical SVG, no IconContext read). One-line change; keeps components/shared and the archetype kit RSC-compatible per their stated 'presentational only, no surface coupling' contract.

### `apps/web/components/shared/origin-lineage-indicator.tsx:5-8`
**Decorative CompassIcon not hidden from assistive technology**  
*a11y · ✓ verified · slice: primitives*

`<CompassIcon className="size-4" weight="bold" />` next to the text "Origin Lineage" — @phosphor-icons/react renders a bare `<svg>` with no `aria-hidden` or `role` by default (verified in node_modules/@phosphor-icons/react/dist/lib/SSRBase.es.js: only `alt` adds a `<title>`, nothing hides it), so some SR/browser combos announce an unlabeled image before the text. The codebase's established convention is to pass `aria-hidden` to decorative Phosphor icons (e.g. `<HeartIcon weight="fill" aria-hidden />` in components/character-sheet/header-owner-actions.tsx); this file misses it.

**Suggested fix:** Add `aria-hidden` to the CompassIcon: `<CompassIcon className="size-4" weight="bold" aria-hidden />`.

**Verifier:** The evidence is accurately quoted: origin-lineage-indicator.tsx:5-8 renders `<CompassIcon className="size-4" weight="bold" />` immediately before the text "Origin Lineage", with no aria-hidden/role, and Phosphor icons render a bare <svg> with no default hiding. Both call sites (archetype-detail-header.tsx:47 and lineage-tree.tsx:82) render it inline with no parent wrapper that hides it, so it can be announced as an unlabeled graphic. The aria-hidden-on-decorative-icons convention is genuinely established (78+ same-line occurrences across components, including the cited header-owner-actions.tsx exemplar) and CLAUDE.md documents no contrary rule, so the file is an isolated miss; the suggested one-token fix matches the established idiom. It is a real but minor a11y polish issue — a redundant decorative-icon announcement, not a blocker.

### `apps/web/components/shared/prose.tsx:54-59`
**Inline code comment block inside JSX className cn() (CLAUDE.md §3 violation)**  
*debt · ⚠ unverified · slice: primitives*

// Strip Tailwind Typography's default backtick decorations around // inline `<code>` elements ... — a 6-line comment block embedded inside a cn() call inside JSX. The cn() call is a value expression, making this comment particularly hard to relocate without restructuring, but it's still an inline comment per the convention.

**Suggested fix:** Extract the two class strings into named constants (e.g., INLINE_CODE_STRIP_CLASSES and INLINE_CODE_CHIP_CLASSES) and document the intent in those constant declarations via JSDoc or a descriptive name. The surrounding JSDoc already documents the three-layer XSS defense; this should extend that or live alongside it.

### `apps/web/components/shared/skill-cost-badge.tsx:20-36`
**SkillCostBadge silently drops the className prop whenever a cost is present, defeating the cost-column alignment it documents**  
*correctness · ✓ verified · slice: primitives*

The null-cost branch applies it — `<Badge variant="outline" className={cn("text-muted-foreground", className)}>` — but the costed branch does not: `return (<Badge variant={cost.kind}>{cost.amount} {COST_KIND_LABELS[cost.kind]}</Badge>)`. The component's own JSDoc says the em-dash fallback exists "to keep the cost column visually aligned", and the main caller relies on the prop for exactly that: skill-row.tsx:93 renders `<SkillCostBadge cost={skill.resolvedCost} className="w-full" />` inside `<ItemActions className="w-16 justify-center">`. Because Badge's base classes include `w-fit`, costed badges render at intrinsic width while no-cost badges stretch `w-full` — inconsistent chip widths within the same w-16 column, and an accepted prop that is silently a no-op on the common path.

**Suggested fix:** Apply the prop on both branches: `return (<Badge variant={cost.kind} className={className}>…)` (cn not required since Badge already merges). Verify the Skills list column alignment afterwards.

**Verifier:** The evidence is accurately quoted: the no-cost branch applies cn("text-muted-foreground", className) (skill-cost-badge.tsx:25) while the costed branch renders <Badge variant={cost.kind}> with no className at all (line 32), silently dropping the prop. Badge's base classes include w-fit (badge.tsx:8), so the caller's className="w-full" (skill-row.tsx:93) takes effect only on the no-cost em-dash chip; costed chips stay intrinsic width. Both branches are live — passive skills carry resolvedCost: null (skills/utils.ts:90), so em-dash and costed chips genuinely coexist in the same w-16 column, and the JSDoc documents the alignment intent the dropped prop defeats. This is a real prop-contract defect not sanctioned by any CLAUDE.md convention, and the suggested fix is sensible; but because ItemActions uses justify-center both chips center within the column, so the user-visible effect is cosmetic chip-width/background inconsistency rather than broken alignment — polish-tier.

### `apps/web/hooks/use-builder-draft.tsx:76-79`
**Inline comment explains React Compiler memoization decision — CLAUDE.md §3 violation**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
// No manual `useMemo` — React Compiler (UNN-241) memoizes this inline value
// on its stable inputs (`character.id` + the stable refs), so the write
// context stays referentially stable across draft-only changes and
// write-only consumers don't re-render.
```

This is exactly the class of comment CLAUDE.md §3 flags: an explanation of a technique choice that could be a JSDoc note instead.

**Suggested fix:** Add a JSDocs note on `BuilderDraftProvider` covering the memoization assumption, then delete the inline block.

### `apps/web/hooks/use-character-token-ref.ts:24-26`
**Unconditional prop-sync can regress the version ref below the latest known token, contradicting mergePingedVersions' documented invariant**  
*correctness · ✓ verified · slice: hooks-lib*

`useEffect(() => { ref.current = token }, [token])` overwrites the ref whenever the prop changes — without the forward-only compare the codebase uses elsewhere (use-own-combat-event.ts:32-36: `if (snapshotVersion > versionRef.current)`; character-version-sync.ts:52: `if (version > ref.current)`). The write pipeline bumps the ref ahead of React (`dispatchCharacterWriteWithRetry` mutates it on success), so a later-committing but older RSC payload regresses it: write A resolves (ref=5), write B resolves (ref=6), then A's revalidation payload commits prop 4→5 and the effect sets ref back to 5; the next save dispatches expectedVersion=5 against a v6 row, gets "stale", and burns a refetch+retry round-trip. character-version-sync.ts:39-40 explicitly asserts the opposite — "versions are monotonic so the prop-sync can't regress them" — but server-side monotonicity doesn't prevent a stale prop committing after the ref advanced. Impact is bounded (the silent retry heals it; a user-facing "Couldn't sync" needs a second concurrent conflict on top), which is why this is polish-tier, but the fix is one comparison and removes a class of spurious stale round-trips.

**Suggested fix:** Make the sync forward-only, matching the hook's siblings: guard with a comparison before assigning (the hook is generic over T but every consumer passes a number version token — either narrow it to number or accept an optional `isFresher` comparator defaulting to `>`). Also correct the "can't regress" claim in mergePingedVersions' JSDoc if the guard isn't added.

**Verifier:** The evidence is accurately quoted: useCharacterTokenRef (lines 24-26) syncs unconditionally (ref.current = token), while three siblings guard forward-only — character-version-sync.ts:52 (version > ref.current), use-own-combat-event.ts:33, and even the same-file use-combat-console.ts pcVitalsVersions map (lines 74-79, with explicit JSDoc that a bumped token mustn't regress). The write pipeline does bump the ref ahead of React on success (dispatch-character-write.ts:61/71/75), and because revalidateCharacter uses revalidatePath (carrying the current DB version at render time, not a frozen per-write snapshot), a stale v5 RSC payload can commit after the ref reached v6, costing a spurious stale→refetch→retry round-trip. It is real and diverges from the codebase's own guarded convention, but it is correctly self-classified as polish: dispatchCharacterWriteWithRetry refetches and retries on "stale", so no data is lost or corrupted — worst case is one wasted round-trip, and the "contradicts mergePingedVersions' documented invariant" framing is overstated since that JSDoc justifies the merge's own forward-only guard, not the unguarded hook.

### `apps/web/hooks/use-character.tsx:133-136`
**Inline comment on `applyRemoteVersions` — CLAUDE.md §3 violation**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
// The shared remote-change handler (UNN-372): both transports — the Ably
// ping and the UNN-203 cross-tab broadcast — funnel here, so a tab whose
// refs are already current (the writer itself, or a tab the other transport
// reached first) skips the redundant refresh.
```

This is the fourth occurrence of this explanation across the file + character-version-sync.ts. The content belongs in the JSDoc of `applyRemoteVersions` or in `character-version-sync.ts`'s module-level doc.

**Suggested fix:** Convert `applyRemoteVersions` from an arrow function nested in `CharacterProvider` to a named function with a JSDoc, or lift the explanation into the `CharacterProvider` JSDoc block.

### `apps/web/hooks/use-debounced-auto-save.ts:186-201`
**Default save-failure toast copy duplicated across the three write primitives, and it has already drifted**  
*conventions · ⚠ unverified · slice: hooks-lib*

use-debounced-auto-save.ts:189 hard-codes `toast.error("Couldn't sync — refresh to see the latest changes.")`, while the two click-write primitives hard-code a different phrasing of the same message: use-character.tsx:267 and use-builder-draft.tsx:216 both use `"Couldn't sync — refresh to see the latest."`. The generic fallback `"Couldn't save. Try again."` is likewise repeated verbatim in all three files (use-debounced-auto-save.ts:191 and 201, use-character.tsx:268, use-builder-draft.tsx:217). CLAUDE.md's display-copy convention exists precisely "so phrasing cannot drift between sheet sections" — and the drift has already materialized: the same stale-write failure shows one wording when it comes from a debounced text field and another when it comes from a click control on the same sheet.

**Suggested fix:** Extract the two default toast strings into shared constants (e.g. STALE_WRITE_TOAST / SAVE_FAILED_TOAST in apps/web/lib/ui/labels.ts, alongside the other canonical UI copy like FALLEN_RECOVER_REMINDER) and import them in use-debounced-auto-save.ts, use-character.tsx, and use-builder-draft.tsx, picking one phrasing for the stale message.

### `apps/web/hooks/use-debounced-auto-save.ts:194-208`
**Inline comment blocks explain catch semantics and queue safety — CLAUDE.md §3 violation**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
// `save` threw (network drop, server crash, auth interrupt) or our
// own error branch threw. Roll back, surface a generic toast, and
// let the queue keep flowing. Throws aren't routed through `onError`
// because that's typed `TError` — expected failures should return
// `Result.err`, not throw.
...
// Safety net: even if the inner try/catch itself somehow rejects ...
```

CLAUDE.md §3: 'Avoid inline comments. If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions.'

**Suggested fix:** Extract the catch body into a named function (`handleSaveThrownError`) and the queue-safety `.catch(() => {})` into a named helper or rename the queued promise variable to express its invariant, removing the need for the comment. The JSDoc above the function can absorb the invariant explanation.

### `apps/web/hooks/use-debounced-auto-save.ts:249-254`
**Inline comment explains `useEffectEvent` motivation — CLAUDE.md §3 violation**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
// useEffectEvent (React 19.2) sees the latest props/state without being
// listed in deps — lets the prop-sync effect fire on serverValue change
// only, and lets the unmount cleanup read fresh `value`, `isEmpty`,
// `isEqual`, and `performSave` without re-running every render. The version
// token is *not* synced here...
```

This explanation belongs in the function's JSDoc or in the variable names, not as an inline block.

**Suggested fix:** Move the `useEffectEvent` rationale into the JSDoc for `useDebouncedAutoSave`. The two effect event variables already have clear names (`syncFromServer`, `flushOnUnmount`); the comment adds no refactoring leverage.

### `apps/web/hooks/use-encounter-snapshot.ts:76-77`
**Inline comment explains unmount guard — CLAUDE.md §3 violation**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
// The same don't-set-state-after-unmount guard the polling effect carries,
// for the ping/reconnect-triggered fetches below.
```

The unmountedRef idiom is well-known and the comment does not aid refactoring. The cross-reference to 'the polling effect' is internal navigation, not a design decision.

**Suggested fix:** Delete the comment. If the idiom needs explanation in this codebase, put it in a JSDoc on `useEncounterSnapshot` describing the two teardown scopes (`unmountedRef` for ping callbacks, `cancelled` for the interval).

### `apps/web/hooks/use-encounter-snapshot.ts:86-99`
**Polling interval duplicates fetch-then-catch shape of `refetch()` with a different guard strategy**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
// refetch() (lines 86-99):
function refetch() {
  fetcherRef.current(shortId)
    .then((next) => { if (unmountedRef.current) return; ... setSnapshot(next); setStale(false) })
    .catch(() => { if (unmountedRef.current) return; setStale(true) })
}
// setInterval callback (lines 118-131) — identical shape, but uses `cancelled` instead:
setInterval(() => {
  fetcherRef.current(shortId)
    .then((next) => { if (cancelled) return; ... setSnapshot(next); setStale(false) })
    .catch(() => { if (cancelled) return; setStale(true) })
}, POLL_INTERVAL_MS)
```

The teardown guards differ deliberately (`unmountedRef` for component lifetime vs `cancelled` for interval lifetime), so refetch() cannot simply be called from the interval. However, the three-line inner logic (setSnapshot/setStale/versionRef) is verbatim repeated. Confidence: Medium — the guard difference is intentional but the inner body is structural duplication.

**Suggested fix:** Extract a helper `applyFetchResult(next: EncounterSnapshot)` and `applyFetchError()` for the shared setSnapshot/setStale/versionRef.current writes. Callers wrap them in their own guard (`if (unmountedRef.current) return` vs `if (cancelled) return`), removing the body duplication while keeping the teardown logic explicit.

### `apps/web/hooks/use-own-combat-event.ts:38-54`
**router.refresh() after every condition toggle re-runs the watch route's full server loaders for data the toggle didn't change**  
*perf · ⚠ unverified · slice: hooks-lib*

```ts
versionRef.current = result.value.version
// Reconcile the left column's own character data (e.g. a co-edited vital);
// the overlay itself arrives via the snapshot refetch the ping triggers.
router.refresh()
```

A player's ailment/battle-condition toggle writes only the encounter session overlay — never a character row — yet every successful dispatch triggers a full RSC refresh of `/c/encounter/[shortId]`, re-running `loadEncounterSnapshot` plus `loadOwnedEncounterSheets` (full character hydration: archetype/skill/inventory joins) and re-shipping the RSC payload, *on top of* the ping-triggered snapshot refetch that actually delivers the overlay change. The stated reconciliation target (a co-edited vital on the character row) is already covered when realtime is healthy: each owned sheet in the left column mounts its own `CharacterProvider`, whose character-domain Ably subscription and BroadcastChannel funnel (use-character.tsx:141-150) `router.refresh()` precisely when a character version actually advances. So in the healthy path this refresh is pure duplication — two server round-trips per click on the hot watch surface; it only earns its keep in the no-realtime degraded mode.

**Suggested fix:** Drop the unconditional refresh and rely on the per-character version sync for row co-edits; if the degraded (no-realtime) mode still needs a safety net, gate the refresh on realtime being unavailable (expose availability from the snapshot hook) rather than paying it on every toggle. The comment documents intent, so confirm with the UNN-322/324 author before changing.

### `apps/web/hooks/use-own-combat-event.ts:31-36`
**Monotonically-advancing versionRef pattern in `useOwnCombatEvent` rolls its own ref+effect instead of using `useCharacterTokenRef`**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
const versionRef = useRef(snapshotVersion)
useEffect(() => {
  if (snapshotVersion > versionRef.current) {
    versionRef.current = snapshotVersion
  }
}, [snapshotVersion])
```

`useCharacterTokenRef` in the same hooks/ directory does `ref.current = token` unconditionally on every prop change. `useOwnCombatEvent` intentionally diverges: it only advances the version (never regresses), because the snapshot can lag behind the just-written value after a successful dispatch. This is a purposeful variant, not a missed reuse. Confidence: Low — flagging so the caller can confirm the intentional divergence is documented.

**Suggested fix:** Add a JSDocs note on the versionRef block explaining the monotonic advance invariant and why `useCharacterTokenRef` is not used here, so future readers don't 'fix' it to the simpler form and introduce a regression.

### `apps/web/lib/ui/format-currency.ts:12-14`
**`formatNumber` is exported but has no external consumer**  
*debt · ⚠ unverified · slice: hooks-lib*

```ts
export function formatNumber(value: number): string {
  return GROUPING.format(value)
}
```

Grep across all of apps/web confirms the only consumer is `formatCurrency` in the same file. The export is public API with no current caller.

**Suggested fix:** Make `formatNumber` unexported (remove `export`). If a future consumer needs grouped-number-without-gp formatting, re-export it then. Keeping it exported creates a false promise of shared utility.

### `apps/web/lib/ui/labels.ts:321-361`
**Three label maps are untyped `as const` objects despite existing foundation domain-key types, unlike every sibling map in the file**  
*conventions · ⚠ unverified · slice: hooks-lib*

`export const BATTLE_CONDITION_AXIS_LABELS = { attack: ..., defense: ..., hitEvasion: ... } as const`, `BATTLE_CONDITION_FLAG_LABELS = { charged: ..., concentrating: ... } as const`, and `ACTION_ECONOMY_LABELS = { move: ..., standard: ..., reaction: ... } as const` are the only domain-key label maps in the file not annotated with their key vocabulary, even though the types exist and are exported from foundation: `BattleConditionAxisKey` (packages/game/src/foundation/character/state.ts:67), the flags as `Exclude<BattleConditionKey, BattleConditionAxisKey>` (state.ts:52), and `ActionEconomyAction` (packages/game/src/foundation/encounter/session-event.ts:188). CLAUDE.md defines these maps as `Record<X, string>` over the domain key, and the file's ~20 sibling maps (ATTRIBUTE_LABELS, COMBAT_SIDE_LABELS, ENGAGEMENT_STATUS_LABELS, etc.) all annotate. Untyped, a key added to the foundation vocabulary no longer fails at the map's definition site — the error surfaces later, scattered across consumer index sites.

**Suggested fix:** Annotate the three maps with their domain key types: `Record<BattleConditionAxisKey, string>`, `Record<Exclude<BattleConditionKey, BattleConditionAxisKey>, string>` (or add an exported flag-key subset in foundation), and `Record<ActionEconomyAction, string>`, matching every other map in the file.

### `components/character-sheet/archetypes/atlas/archetype-action-button.tsx:112-144`
**Actionable return wraps TooltipButton + AlertDialog in a layout div that leaks into callers**  
*debt · ⚠ unverified · slice: cs-surfaces*

```tsx
return (
  <div className="flex flex-col items-end gap-1">
    <TooltipButton ... />
    <AlertDialog ...>...</AlertDialog>
  </div>
)
```
The `AlertDialog` portals out of the DOM so the div's layout role is only to satisfy JSX's single-root requirement, but the `flex flex-col items-end gap-1` wrapper alters the sizing context for any parent that places this component in a flex row (both call sites do: the panel footer's `flex items-center gap-2`, and RecommendationSlots' card). The `className` prop is forwarded to `TooltipButton` not to the wrapper div, so callers cannot override the wrapper's layout.

**Suggested fix:** Replace the wrapping div with a React Fragment (`<>...</>`). `AlertDialog` does not need a DOM parent — it renders via a portal regardless. If the `flex flex-col items-end gap-1` was intentional for some tooltip offset, document it; otherwise it is vestigial from a prior design iteration.

### `components/character-sheet/archetypes/atlas/archetype-node-card.tsx:78-83`
**Dashed-border icon box span duplicated verbatim across three atlas files**  
*debt · ⚠ unverified · slice: cs-surfaces*

Identical class string `grid size-9 shrink-0 place-items-center border border-dashed bg-muted text-muted-foreground` (with `aria-hidden` and lineage Icon child) appears in:

- `archetype-node-card.tsx` line 80 (size-9)
- `recommendation-slots.tsx` line 83 (size-9)
- `lineage-tree.tsx` line 77 (size-12, hidden, sm:grid)

All three render a square muted dashed-border box with a centered icon — the same visual element at two sizes.

**Suggested fix:** Add a `LineageIconBox` component to `components/archetype/` (or `lib/ui/`) accepting `lineage`, `size` (sm/md), and optional `className`. The three call sites become one-liners. Low urgency per CLAUDE.md 'resist premature abstraction' — flag for the next time a fourth occurrence appears.

### `components/character-sheet/archetypes/atlas/lineage-tree.tsx:122-124`
**Inline comment explaining SVG measurement coordinate system (violates CLAUDE.md 'avoid inline comments')**  
*debt · ⚠ unverified · slice: cs-surfaces*

```ts
// Measure against the full-width track (the `min-w-max` element the svg also
// spans), not the clipped scroll viewport, so connectors past the fold on a
// narrow screen still draw.
const origin = track.getBoundingClientRect()
```
CLAUDE.md rule: 'Avoid inline comments.'

**Suggested fix:** Extract the measurement line into a named helper `getTrackOrigin(trackRef)` or rename the variable `trackOrigin` and the element ref to something that communicates 'full-width unclipped'. The comment becomes the variable name.

### `components/character-sheet/archetypes/inheritance-slots.tsx:59-63`
**Multi-line inline comment explaining memoization/performance rationale (violates CLAUDE.md 'avoid inline comments')**  
*debt · ⚠ unverified · slice: cs-surfaces*

```ts
// Resolve the picker's source groups once for the whole block — every slot
// shares them. A Paragon-tier Archetype has 6 slots, and the resolution
// re-hydrates every other Archetype's Skills, so doing it per-SlotPicker
// would repeat that work 6× (one call site, memoized by the React Compiler).
// Owner-only: a read-only viewer never renders a picker, so it pays nothing.
```
CLAUDE.md rule: 'Avoid inline comments. If your code needs a comment to be understood, try refactoring it by extracting variables or creating functions.'

**Suggested fix:** Extract the `sourceGroups` derivation into a named function `resolveSourceGroupsForOwner(character, entry, isOwner)` that self-documents its 'once for the whole block, owner-only' intent. The function can return an empty array for the non-owner path, making the guard visible in the name.

### `components/character-sheet/atlas/archetype-node-card.tsx:56-58`
**LINEAGE_DISPLAY → LINEAGE_ICONS two-step repeated in four atlas components**  
*debt · ⚠ unverified · slice: cs-surfaces*

All four atlas components contain identical two-line lookups:
```ts
const display = LINEAGE_DISPLAY[x.lineage]  // or entry.lineage
const Icon = LINEAGE_ICONS[display.icon]
```
Files: `atlas-sidebar.tsx:31-32`, `archetype-node-card.tsx:57-58`, `recommendation-slots.tsx:76-77`, `lineage-tree.tsx:70-71`. No shared helper exists. If `LINEAGE_DISPLAY` is ever restructured to fold the icon key, all four must be updated.

**Suggested fix:** Add a `useLineageIcon(lineage: string): ComponentType` helper in `lib/ui/lineage-icons.ts` (or a `getLineageIcon` pure function). The two-step becomes a one-liner. The `display.label` and `display.description` are only needed in two of the four files, so this refactor stays narrow.

### `components/character-sheet/explore/virtues.tsx:79-81`
**Stale toast message overridden in three write calls with a non-default string, creating a silent divergence from the hook's documented default**  
*debt · ⚠ unverified · slice: cs-surfaces*

The `useCharacterWrite` hook's default stale message is `"Couldn't sync — refresh to see the latest."` (hooks/use-character.tsx line 267). `virtues.tsx` overrides this with `"Someone else updated this character — refresh to see the latest."` in both `handleAddSpark` (line 80) and `handleRankUp` (line 99). `talents.tsx` line 60 does the same. The README for lib/actions/ documents `"Someone else updated this character — refresh to see the latest."` as the canonical form, but the hook ships a different default. Any new write that omits the stale override silently shows the shorter, less informative message.

**Suggested fix:** Align the hook's default stale message with the documented canonical form (`"Someone else updated this character — refresh to see the latest."`) so omitting `messages.stale` gives the richer copy. Then delete the three explicit overrides in virtues.tsx and talents.tsx.
