# 2026-07-11 — A catch around a Server Action ate the redirect

**Symptom:** a `try/catch` wrapping an awaited Server Action turns *every* throw
into a "couldn't save" toast — and one of those throws was Next's own
`forbidden()`/`redirect()`, so the navigation silently never happened and the
user got an un-actionable toast instead of the 403. At the catch, a framework
navigation signal is indistinguishable from a network drop.

**Context:** UNN-379 (catch Server Action rejections + add route boundaries).
Next implements `redirect`/`notFound`/`forbidden`/`unauthorized` by *throwing* a
sentinel that the framework re-catches to navigate. The latent instance was
`useDebouncedAutoSave` (`apps/web/domain/entity/use-debounced-auto-save.ts`):
its hand-rolled catch toasted on all throws, so a `forbidden()` during a
debounced owner save (session expired mid-edit) became "Couldn't save. Try
again." — low severity (owner-only fields, rare) but a real correctness gap,
and the same shape would cancel a `redirect()` outright.

**Position:** the fix is one line, first in the catch:

```ts
} catch (error) {
  unstable_rethrow(error) // re-throws framework signals; no-ops on real errors
  onReject(error)         // only genuine transport failures reach here
}
```

Homed once in `lib/sync/guard-write-transition.ts` (`guardWrite`), then ~24
click-write transitions + the debounced catch routed through it.

**Principle:** "how do we treat a thrown Server Action rejection" is a
distinction decided once, in one helper — including the `unstable_rethrow`
subtlety (→ Code Style #9, Meyer's Single Choice Principle; sibling of
[[2026-07-08-rule-with-two-homes]]). A hand-rolled catch that forgets it
reintroduces the swallow.

**Action:** `guardWrite` is now the sanctioned catch-around-an-action; a lint
rule banning bare `try/catch` over a `*Action()` call would make it enforceable
(unfiled — offered to user).
