# 2026-07-13 — A nested React root has its own clock

**Symptom:** a CodeMirror plugin's ordinary `destroy()` raised “Attempted to synchronously unmount a root while React was already rendering” only in the Next.js development page.

**Context:** UNN-620 mounted a shadcn completion menu through its own React root; Strict Mode replay destroyed CodeMirror during the parent root's commit, before the nested root had finished its first commit.

**Position:** `destroy() { queueMicrotask(() => { root.unmount(); container.remove() }) }`

**Principle:** Respect scheduler boundaries: an imperative owner may own a nested React root's lifetime, but teardown must yield when the outer React lifecycle can invoke it. This is the temporal form of Code Style #10, “Home state on the object whose lifetime matches it.”

**Action:** deferred nested-root disposal by one microtask and added a lifecycle regression test; the Next.js issue overlay now stays clear.
