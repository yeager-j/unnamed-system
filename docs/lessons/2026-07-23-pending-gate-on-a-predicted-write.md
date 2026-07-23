# 2026-07-23 — A pending gate on a predicted write re-adds the round trip

**Symptom:** a control dispatched an optimistic write, the new value rendered
in the same frame — and the button still went dead until the server answered.
The gate read `disabled={pending}` or `disabled={pending || domainRule}`,
right next to state that had already updated.

**Context:** the Headcanon thinning pass (feature/headcanon, post-UNN-676).
~15 sheet/builder/watch surfaces gated on `useEntityWrite`'s per-consumer
inflight counter. `adjust-pool-control.tsx` carried the contradiction in one
file: its doc promised "back-to-back clicks sum (UNN-226 is structural now)"
while its `pending` gate prevented back-to-back clicks. `inventory-table.tsx`
already followed the rule, citing "the S2a lesson" — which was never written
down, so the wound recurred everywhere else.

**Position:**

```tsx
const { dispatch, pending } = useEntityWrite()
// value updates optimistically on click, yet:
<Switch checked={on} disabled={pending} onCheckedChange={...} />
```

**Principle:** the prediction *is* the feedback. Rapid clicks are valid
intent (they fold over the projection; the predictor refuses an invalid
second; the root queue preserves order; recovery toasts own degradation), so
a pending gate only reintroduces the wait the optimistic protocol exists to
delete. The exception is decided by projection, not caution: a command with
**no client projection** (`entity.finalize` — predictor is identity, success
is a navigation) keeps a busy state as its only honest representation.

**Action:** removed `pending` from `useEntityWrite`/`useIdentityWrite` and
all ~15 gates; `useFinalizeEntity` keeps a receipt-derived `pending`;
`AdjustPoolForm`'s `disabled` prop deleted with its last payer.
