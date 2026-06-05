# E2E patterns

Conventions that aren't strictly Playwright's — they're things I (Claude)
got wrong in UNN-180 and want to not repeat.

## Snapshot, not polling, for "did X **not** happen" assertions

Playwright's `await expect(locator).toHaveCount(0)` and other web-first
assertions **poll** with a 5-second default timeout. That's the right
default for "wait until X exists" — but it's wrong for "X must not appear
at all." A transient regression (a stale toast, a flash of error UI) can
appear, auto-dismiss inside the poll window, and the assertion will still
pass.

Concrete example from UNN-180: a stale-toast regression briefly flashed a
Sonner toast at ~t=1.4s. Sonner's default duration is 4s, so the toast
dismissed at ~t=5.4s. The polling `toHaveCount(0)` saw the toast at first,
kept retrying, and eventually passed when the toast disappeared — masking
the bug entirely.

**Use a snapshot helper for negative assertions:**

```ts
async function expectNoToast(page: Page): Promise<void> {
  const count = await page.locator("[data-sonner-toast]").count()
  expect(count).toBe(0)
}
```

A single read at a deterministic moment. Pair with `await
page.waitForTimeout(...)` long enough for the regression to surface but
short enough that the would-be-toast hasn't dismissed.

The same logic applies to any "no error indicator," "no spinner," "no
modal" assertion — anything where the desirable state is "absent."

## A test that claims to catch a regression must be verified by reintroducing the regression

Writing a test against a fixed bug is cheap; writing one that *actually
catches the bug* takes one more step: reintroduce the bug locally and
confirm the test fails.

Skipping this step has bitten the UNN-180 suite twice already:

- The debounce + blur double-fire test depended on real network latency
  to keep the in-flight window open. On fast localhost the action
  sometimes completed before blur fired, so the bug couldn't manifest
  even when present in the code. Fixed by `page.route`-delaying the
  POST so the in-flight window is guaranteed.
- The toast-count assertions polled (see above), so a stale toast that
  flashed would dismiss before the assertion's poll expired.

Both issues looked fine in green CI. Both were caught by the
reintroduce-revert loop.

**Process:** before merging a test that claims to lock down a regression,
temporarily revert the relevant fix, run the test, confirm it fails for
the *right reason* (read the error message — "received 1 expected 0" beats
"timeout waiting for X"), restore the fix, then commit. For UNN-180 this
was one extra commit (`c128f3d`) but the alternative was shipping tests
that protected against nothing.

## Poll the DB for write-then-read sequences, don't trust `networkidle`

`page.waitForLoadState("networkidle")` returns when the network goes quiet —
but for a Next.js Server Action that calls `revalidatePath`, "quiet" can fire
*before* the revalidation cycle finishes committing the new RSC payload. If
the spec then chains a second click that depends on the first write being
visible, the second action can dispatch against stale optimistic state and
silently overwrite the first.

UNN-226 hit this exactly: click Charged → networkidle → click Concentrating
→ networkidle → DB read showed `{charged: true, concentrating: false}`. The
production code was correct (and verified by hand in the browser). The race
was entirely in the spec.

**Use `expect.poll` against the DB helper between dependent writes:**

```ts
await page.getByRole("button", { name: "Charged" }).click()
await expect
  .poll(async () => (await getCombatStateTargetState()).battleConditions?.charged)
  .toBe(true)

await page.getByRole("button", { name: "Concentrating" }).click()
await expect
  .poll(
    async () => (await getCombatStateTargetState()).battleConditions?.concentrating
  )
  .toBe(true)
```

`networkidle` is fine for "wait until UI settles before snapshotting" — what
it can't promise is "the prior server write is fully persisted and the next
optimistic baseline has caught up." For dependent writes, only the DB knows.

## Write-spec discipline

`playwright.config.ts` sets `fullyParallel: true`, so different spec files
run in parallel workers. Two specs that mutate the same row will race.

**Default: mint ephemeral rows with the factory, don't grow the seed**
(UNN-343). `fixtures/factory.ts` exposes `createTestCharacter`,
`createTestCampaign`, `placeCharacter`, and `createLiveEncounter` — each
stamps a **unique-per-run id** (so `fullyParallel` workers can't contend by
construction) and registers it in a `CleanupTracker`; a single
`cleanup(tracker)` in `afterAll` tears the world down FK-safe (and on
failure). A per-spec fixture file (`fixtures/<thing>-target.ts`) wraps the
factory: it exports a `createXTarget(tracker)` that mints exactly the
character its spec needs (the `makeSeedCharacter` overrides inline) and
returns helpers bound to the new id (`reset` / `setX` / `getX`). The spec
creates the target in `beforeAll` (or `beforeEach` for destructive specs),
resets between tests, and `cleanup`s in `afterAll`. See
`combat-state-target.ts` + `combat-state.spec.ts` for the canonical shape.

**The seed is product/showcase data only.** Keep the demo roster, the auth
fixture (Iris Vey), and the combat showcase (`encounter-target.ts`:
campaigns A/B + their encounters, driven by `encounter-shell` / `join`)
seeded — they read as real demo data and read-only specs pin their
names/URLs. Don't add a new permanent row per write spec; reach for the
factory instead.

**Write-then-read still needs `expect.poll`** (see the section above): the
factory removes contention, not the `networkidle`-vs-revalidation race, so
assert persisted state by polling the DB helper, not a single read.
