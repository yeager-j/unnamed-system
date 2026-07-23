# 2026-07-23 — A tombstone set keyed by an id the system can resurrect

**Symptom:** client bookkeeping deliberately left an id in a "done, will
never render again" set, trusting that the entity's disappearance from canon
made cleanup unnecessary — and an inverse operation later restored the *same
id* byte-identical, so the resurrected entity inherited the stale flag and
rendered permanently inert. Worked in every forward test; only the
undo-then-redo path exposed it.

**Context:** UNN-642's expand gesture (`use-dungeon-console.ts`). The
per-stub pending set kept the spinner alive across the accept → refetch gap
by never unmarking on accept — sound while "consumed stub" meant "gone
forever," falsified by the same ticket's retract, whose whole contract (D10)
is restoring the consumed stub id byte-identical. Caught by the e2e spec's
retract-then-force-pick step (click timed out on an `aria-disabled` ghost).

**Position:**

```ts
// on accept: leave stubId in pendingStubIds — "the ghost unmounts anyway"
// retract later restores generation.stubs[stubId] byte-identical → inert ghost
```

Fix: derive lifetime from the authority, not from an assumed one-way
transition — a render-phase prune drops every pending id absent from the
canon's open-stub set, so the flag dies exactly when the canon says the
round trip resolved, and a restored id re-enters clean.

**Principle:** a per-id client flag's lifetime must be homed on the
*authoritative state it describes*, not on a presumed-irreversible identity
transition — when the system offers inverses whose soundness is byte-identical
restoration, "this id never comes back" is false by design (→ Code Style #10,
home state on the object whose lifetime matches it; kin to
[[2026-07-20-shared-pending-is-not-operation-completion]] — both are pending
facts homed on the wrong lifetime).

**Action:** fixed in UNN-642 (render-phase prune against
`generation.stubs`); the e2e spec's retract → re-expand step is the standing
regression net.
