# 2026-07-11 — A catch around a Server Action ate the redirect

**Symptom:** a `try/catch` wrapping an awaited Server Action turns *every* throw
into a "couldn't save" toast — and one of those throws was Next's own
`forbidden()`/`redirect()`, so the navigation silently never happened and the
user got an un-actionable toast instead of the 403. At the catch, a framework
navigation signal is indistinguishable from a network drop.

**Context:** UNN-379 (catch Server Action rejections + add route boundaries).
Next implements `redirect`/`notFound`/`forbidden`/`unauthorized` by *throwing* a
sentinel that the framework re-catches to navigate — so a `catch` that toasts
every throw both cancels the navigation and shows an un-actionable toast.

**Corollary the review surfaced — the rethrow only *acts* in a *transition*
context.** The signal has to reach a React transition / error boundary to
navigate, so `unstable_rethrow` belongs in the ~24 click-write paths (each in
`startTransition`). A *detached* promise chain can't surface it: I first routed
`useDebouncedAutoSave`'s background-save catch through `guardWrite` too, but that
hook's queue-continuity net (`queueRef.current = queued.catch(() => {})`)
immediately re-consumes the rethrown rejection, and there's no transition to act
on it anyway — so the rethrow was inert. The background save now **deliberately**
swallows to a toast (a hard-navigate to a 403 mid-typing would also lose the
draft); the reverted catch documents why.

**Amendment (2026-07-19, UNN-646 review) — "inert" was too strong, and it hid a
second use.** The corollary above conflated *acting on* a signal with
*identifying* one. A throwaway probe (a client component calling `forbidden()` /
`unauthorized()` / `redirect()` / a plain throw, detached and in a transition)
measured this:

| from a Server Action | client promise | `digest` | `unstable_rethrow` detects |
| --- | --- | --- | --- |
| `forbidden()` | **rejects** | `NEXT_HTTP_ERROR_FALLBACK;403` | **yes** |
| `unauthorized()` | **rejects** | `NEXT_HTTP_ERROR_FALLBACK;401` | **yes** |
| `redirect()` | **navigates** (even detached) | — | — |
| plain `throw` | rejects | numeric hash | no |

Three corrections. **(a)** A client-invoked action's `forbidden()` does not
render a boundary — it *rejects the caller*, so the swallow is real wherever a
catch exists, transition or not. **(b)** `unstable_rethrow` works as a
**classifier** in a detached promise: it identified both auth interrupts and
ignored the ordinary error with no transition anywhere. Detached callers can't
navigate, but they can still tell "terminal authorization failure" from
"transport blip" — which is what decides whether to retry. **(c)** The signals
are not one family: `redirect()` navigates below the promise layer, while the
auth interrupts surface as rejections. Grouping them cost a wrong inference.

The wound this reopened: a replica bootstrap's detached catch classified a
thrown auth interrupt as `retryable`, so a guaranteed 403 earned five backed-off
retries before giving up.

**Position:** the fix is one line, first in the catch — but only where the call
runs inside a React transition:

```ts
} catch (error) {
  unstable_rethrow(error) // re-throws framework signals; no-ops on real errors
  onReject(error)         // only genuine transport failures reach here
}
```

Homed once in `lib/sync/guard-write-transition.ts` (`guardWrite`), used by the
click-write transitions.

**Principle:** "how do we treat a thrown Server Action rejection" is a
distinction decided once, in one helper — including the `unstable_rethrow`
subtlety *and* its scope (transition vs. detached queue) (→ Code Style #9,
Meyer's Single Choice Principle; sibling of [[2026-07-08-rule-with-two-homes]]).
A hand-rolled catch that forgets it reintroduces the swallow. **Every catch
around an action owes an answer, and there are two questions, not one:** can I
act on this signal (transition-only), and what *kind* of failure is it
(everywhere). A detached caller is excused the first, never the second — and
answering "transport" by default is how a terminal failure earns a retry loop.

**Action:** `guardWrite` is now the sanctioned catch-around-an-action; a lint
rule banning bare `try/catch` over a `*Action()` call would make it enforceable
(unfiled — offered to user). The detached-classifier half is UNN-660.
