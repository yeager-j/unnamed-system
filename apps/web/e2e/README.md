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

## Write-spec discipline

`playwright.config.ts` sets `fullyParallel: true`, so different spec files
run in parallel workers. Two specs that mutate the same character row
will race.

Per CLAUDE.md: give each write spec a dedicated seed character (or
serialize the writes inside one file). `write-pattern.spec.ts` uses
`/c/write-target` (Mira Solberg) — added to the seed alongside the
existing Iris Vey so read-only specs that pin Iris Vey's name don't
flake.
