# 2026-07-22 — Partial generics erased a property the object provided

**Symptom:** a type helper correctly checked every callback, but callers still saw a finalizer present in the object literal as possibly `undefined`.

**Context:** UNN-686's mutation-command factory had to keep projection and evidence explicit while preserving each command object's exact surface.

**Position:** `define<Projection, Evidence, Command = MutationCommand>(command)` defaulted `Command` instead of inferring it; `forContext<Projection, Evidence>()(command)` lets the second call infer the literal.

**Principle:** stage explicit type decisions before exact literal inference; a default generic parameter is not partial type-argument inference.

**Action:** rejected the runtime factory and used adopter-local type aliases with `satisfies`; shared context is decided once while exact `finalizeAccepted` presence survives.
