# 2026-07-20 — The abstraction landed and the call sites grew

**Symptom:** an extraction ships, the package gains a clean generic layer — and
the app gets *bigger*. The "call site" is a pile of supplied callbacks; each
binding re-validates facts it constructed moments earlier; a one-line protocol
change still fans out across every tier. The abstraction relocated complexity
instead of absorbing it, and more genericity keeps making it worse.

**Context:** The Replica derived-view spike. App-side coordination grew
+390 counted lines (~+270 like-for-like) while the package gained a 518-line
`view.ts`. Inventory showed each root family paying ~400–1,000 lines of
distribution ceremony across three tiers around 150–650 lines of real domain
semantics. Verdict: no-go.

**Position:** nine type parameters in, everything forwarded verbatim back out —
and the app re-deciding, per family, what the seam erased:

```ts
CreateManagedReplicaViewRootOptions<State, Invocation, ApplyError, Loaded,
  Root, Control, Remote, Cursor, UnavailableReason>   // package
if (loaded.kind !== "encounter") return err("wrong-root-family")  // every app setup()
```

**Principle:** **good abstractions are opinionated — an abstraction's opinions
are what it hides, its parameters are what it refuses.** A module with no
opinions hides no decisions and is a passthrough by definition (Parnas,
information hiding; Tesler's conservation of complexity moves each refusal onto
the callers; Ousterhout's "different layer, same abstraction" is the smell in
situ). Two species escape shallowness: **opinionated modules** — decide
everything that doesn't vary, delegate only proven variation (Meyer's Single
Choice → Code Style #9; Feathers' two-adapters rule locates which is which) —
and **lawful algebras**, generic but deep in a different currency: laws a
caller can reason with, enforced by contract suites, not prose (Replica's write
protocol survived genericity because of its named-law suites). **Generic
without laws is the dongle quadrant** — it can only relocate complexity.
Corollaries: configuration is a call site (only libraries shrink callers;
frameworks invert the LOC promise), and contraction comes from deleting
requirements, not relocating responsibilities.

**Action:** Replica was not adopted. It needs a ground-up redesign to be a truly deep module.
