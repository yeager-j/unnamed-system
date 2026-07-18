# 2026-07-18 — Idempotent delivery masqueraded as replayable intent

**Symptom:** adding mutation IDs made every retry path look deletable, even
though some commands were meant to fail once the state they were based on had
changed.

**Context:** UNN-638's Zero-shaped mock deduplicated a redelivered
`EntityWrite`, but `enqueueOnce` still marked lifecycle commands that must not
be re-evaluated silently against a newer base.

**Position:** `already applied?` and `still valid on this base?` are independent
questions; a dedup key answers only the first.

**Principle:** retry safety has two axes: delivery idempotency and semantic
replayability. Model and name them separately (→ Code Style #9, decide a
distinction once).

**Action:** UNN-639 should put mutation identity in the transport envelope and
retain explicit preconditions for non-replayable commands before deleting
`enqueueOnce`.
