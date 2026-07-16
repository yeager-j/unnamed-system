# Design-smell critic — 10-run eval

**Status:** Eval complete (10 runs, 2026-06-26). Conclusions below are settled;
building the diagnostic table is engineering, not research.

**Question:** can an always-on independent critic (a Claude Code `PostToolUse` /
`Stop` hook running a headless agent) reliably catch *architectural* design smells
— not lint — in the turn's diff, cheaply enough to run every checkpoint?

**Test fixture:** the pre-factory `write-router.example.ts` (`git show 2f35202:…`),
which contains a real Code Style #9 violation: an `isInline` decision is resolved
correctly at the boundary (no stored flag) but then re-fans into two same-shape
arms that run an identical step sequence (log → applyOp → guard → merge → bump →
return) and differ only in *which store* they act on. The file advertises the smell
as a virtue with a `// SAME pure op, different store` comment — which primes praise.
The fix is to resolve the store into an accessor (`{ entity, bumpVersion,
toWriteResult }`) so the body is branch-free.

This finding is deliberately **borderline**: it is the class of catch that separates
a critic worth running from one that just re-reports `tsc`.

## Results

| # | Model | Setup | Result |
|---|-------|-------|--------|
| 1 | Sonnet | Full CLAUDE.md prose #1–9, generic ask, no reasoning | **Miss** — lint only (`as any`, non-null `!`, comment density). Brushed "a missing abstraction wearing a comment" but aimed at the duplicated *comment*, not the *branch*. |
| 2 | Sonnet | + reasoning ("think out loud") | **Miss (inverted)** — saw the branch, applied #9 by name, and explicitly **cleared** it: "a healthy branch… the two arms do genuinely different things." Contradicted itself under the comments finding ("share code… should be extracted") but didn't promote it. |
| 3 | Opus | Same as test 2 | **Catch** — headline finding; ran #9's discriminator unprompted; saw through the self-justifying comment. Also found a corroborating tell: the client's `localEntityFor` already resolves `isInline` once while the server path doesn't — the asymmetry *is* the smell. |
| 4 | Sonnet | + the operational #9 check (hand-fed, single relevant diagnostic) | **Catch — it flipped.** The exact branch cleared in test 2 became Finding #1. Reasoning numbered both arms step-by-step, concluded "same sequence… textbook violation," reconstructed the fix. Correctly downgraded a lookalike ternary to a watch-item (no false-positive blowup). |
| 5 | Opus | No reasoning solicited | **Catch** — quality ≈ test 3. Completes the 2×2. |
| 6 | Sonnet | + full 6-item operational checklist (#9 buried as item 4, five real peers) | **Catch — retrieval-under-load holds.** Self-selected item 4, reconstructed the fix, and self-rejected the non-applicable checks. |
| 7 | Opus | Terse + default-silent + top-3 one-liners + no reasoning (naive hook shape) | **Miss** — 2 terse findings, stopped. Removing articulation room dropped the catch. |
| 8 | Opus | Think-then-terse (thinking allowed in `## Scratchpad`, reply = terse `## Flags`) | **Catch — Flag #1.** Identical to test 7 except thinking was allowed; catch went absent → headline. |
| 9 | GPT-5.5 | High thinking + prose #1–9 + **"grade it"** framing | **Inverted** — praised `isInline` as "the strongest part of the design." |
| 10 | GPT-5.5 | High thinking + prose #1–9 + **fault-finding** framing | **Catch — Finding #1.** Same model, same prose, same file as test 9. The delta was framing alone. |

## What the runs establish

**Framing is the biggest lever, and it is free.** Tests 9 and 10 are identical but
for the framing: a critic told to *grade* rationalizes and praises; a critic told to
*find what's wrong* finds it. "Frame the critic to refute, not assess" goes at the
top of the hook spec.

**The catch is articulation-room-driven, gated by model.** Test 5 initially looked
like "model-driven" (Opus catches with or without a reasoning preamble), but test 7
corrected it: run 5's "no reasoning" still had room *inside* its verbose finding
prose. Strip that too and the catch drops. Test 8 isolates the lever — thinking room,
not output verbosity. Terse output layers on for free once thinking is allowed.

**The operational diagnostic is the cheap-model equalizer.** With fault-finding held
constant: GPT-5.5 catches from prose #9 alone (test 10); Sonnet does not (test 2
cleared it even so) and needs the operational discriminator (test 4), which holds
even when buried in a table of six (test 6). So the skill table earns its keep
*specifically* when running the budget model.

**A prose principle in a long style guide is not an operational check.** Test 1's
model never turned #9 into a *search*. This is the core evidence for the diagnostic
format — record the **trigger + the question that fires the smell** ("when you see X,
ask Y"), not the verdict ("X is bad"). A trigger ports to unseen code; a verdict does not.

**#9 has two clauses, and clause 2 is where the catch lives.** (1) Decide once at the
boundary, no stored flag. (2) Resolve into a shape so the body is branch-free. The
fixture *satisfies* (1) — a real virtue, which is why grading framings praise it — and
*violates* (2). Test 9's model checked clause 1, saw a virtue, and stopped. Make both
clauses explicit in the diagnostic.

**Cost.** All Opus runs cluster ~48–58k tokens and are **input-dominated** (each
re-reads the full CLAUDE.md + file), so output-length tuning barely moves the bill —
terse cut only 55k vs 58k. **Caching the rubric is the real cost lever.** Terse output
did cut latency ~5× (11s vs 56s). Note that thinking tokens *are* output tokens, so
"reason fully" is not free — it is the main output cost; terse reply's payoff is
protecting the *downstream* agent's context window, not the critic's own bill.

## Validated production shape

Cache the skill table + rubric → agent **reasons fully** against it → surface **only**
a terse top-3 `## Flags` block, default-silent. Tune for **precision, not recall**
(the opposite of `tech-debt-surveyor`). Review the turn's diff at a **checkpoint, not
per-edit**. Flags are **advisory only, no edits** — they surface back to the primary
agent to re-examine and then fix or record why it's fine.

The case for it is **builder ≠ critic**: a reviewer with no stake in the solution
catches the builder's make-it-work bias.

Sonnet + operational table is the cheap candidate and held under load (test 6);
think-then-terse preserves the catch (test 8). The only un-run cell is the combined
cheapest config (Sonnet + operational table + think-then-terse) — both halves are
validated separately; running it is a formality.

## Caveats

This class of finding is **borderline and non-deterministic across models**. "Sonnet
*can* catch" (tests 4, 6) is not "Sonnet reliably catches." A frontier model landed
confidently on the opposite side (test 9) on a file that advertises its smell as a
virtue. If reliability on high-value findings matters more than cost, multi-vote
beats a single pass.

## Open threads

- Verify the hook's flag-surfacing JSON contract (via `claude-code-guide`) before wiring.
- Build the diagnostic table first — target ~10–15 entries earned from real sessions —
  then consolidate into an invokable skill, then wire the hook. Not before.
- Two real CD19 questions surfaced by test 10 that nobody else got, both still open:
  - `durableClass` couples the component writer to version/persistence policy
    (`mechanicsWriter.durableClass = "vitals"`) — intentional-but-misnamed, or a bug?
  - Capability no-ops returned as `err()` conflate expected no-ops with real errors →
    consider a typed `{ kind: applied | noop | error }`.

## Provenance

Distilled from `feedback_name_the_pattern` (auto-memory), which now carries only the
durable working-style lesson and points here. The pipeline that produced Code Style #9
is described there: the user's instinct fires the alarm, the model retrieves the name.
