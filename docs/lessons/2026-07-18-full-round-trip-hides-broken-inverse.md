# 2026-07-18 — The full round-trip that any broken inverse also passes

**Symptom:** a round-trip law (apply everything, undo everything, expect the
original) went green — and so did its negative control, because undoing *all*
of a batch replays each recorded inverse exactly once no matter which record
each undo claims to target. The law couldn't tell replay-the-named-record
from pop-a-stack.

**Context:** UNN-590's draw-ledger law (`spatial/__laws__/ledger.laws.test.ts`).
The whole point of per-mint effect records is the PRD's any-unrevealed-leaf,
**non-LIFO** retract — and the first law quantified over exactly the input
class (full unwinds) on which correct and broken implementations coincide.
Caught before commit only because the negative control demanded red.

**Position:** the weak quantification, and its repair:

```ts
revertOrder: fc.shuffledSubarray(indices, { minLength: indices.length })  // full — too weak
revertOrder: fc.shuffledSubarray(mints.map((_, i) => i))                  // partial — expected =
// base + the un-reverted mints replayed; the stack-pop control now goes red
```

**Principle:** an inverse-replay law must quantify over **partial** undo
subsets, because total undo is order- and name-insensitive by construction —
the counterexamples live only where some operations remain applied. Kin to
the negative-control doctrine (game-v2 CLAUDE.md: "a green property proves
nothing until it can go red") — the control is what exposed that the input
class, not the assertion, was wrong (→ Code Style #7/#8).

**Action:** law rewritten over partial reverts with expected = base + the
un-reverted remainder; the stack-pop revert pinned as the negative control
(UNN-590, PR #380).
