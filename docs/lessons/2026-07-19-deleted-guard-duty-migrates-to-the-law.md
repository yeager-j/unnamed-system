# 2026-07-19 — Making a failure unrepresentable deleted the guard, not the duty

**Symptom:** a structural refinement made a runtime fail-closed check
impossible to hit, so the check (and its error arm) was deleted — and for a
moment nothing anywhere proved the failure it guarded was still impossible.
Deleting the guard felt like losing protection even though the type said
otherwise.

**Context:** UNN-655 (PR #396). `saveSession`'s locator-map miss arm (S1:
a durable participant silently serialized inline = home loss) became
unrepresentable in `serializeSessionShell` — each `ParticipantShell` carries
its own home, so there is no out-of-band map to fall out of sync with.

**Position:** the repair — the round-trip law's negative control is aimed at
exactly the corruption the deleted guard caught, not an arbitrary breakage:

```ts
// session-shell.laws.test.ts — brokenSerialize rewrites durable refs inline
locator: { storage: "inline", entity: { id: participant.locator.entityId, components: {} } }
// the law MUST go red on this, with a durable participant in the counterexample
```

**Principle:** when a refinement makes a failure unrepresentable, the old
guard's duty migrates to whatever proves the representation stays honest —
choose that mechanism's negative control to be the deleted guard's failure
mode, so the protection is demonstrably conserved rather than assumed.
(Parse-don't-validate, Alexis King; kin to
[[2026-07-18-full-round-trip-hides-broken-inverse]] — the control defines
what the law actually protects; → Code Style #8's ladder, moved a rung from
runtime assertion to law.)

**Action:** shipped in UNN-655 PR #396; `"locator-missing"` retired from
`CombatReplicaRejection` in PR #397 with the migration noted in its doc.
