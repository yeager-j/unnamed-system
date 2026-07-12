# 2026-07-11 — The hydration mismatch that pointed at the wrong component

**Symptom:** React reports a hydration id mismatch on one Base UI trigger
(`+ id="base-ui-_R_1mgpb…" − id="base-ui-_R_6q39…"`), but that component is
innocent — the *server* id shifts whenever content elsewhere on the page
changes, while the client id stays constant. Every Base UI id after some
point in the tree is desynced, and tooltip triggers silently lose their ids
after the client re-render.

**Context:** UNN-574's planner shell. Hours of bisecting (portal slot, ref
callbacks, nested sidebars) before isolating two triggers: SSR'ing a
**closed** Base UI `Dialog`/`AlertDialog` (renders nothing, still consumes an
id slot server-side — one per slot-pill rename dialog, so the count shifted
the downstream ids), and SSR'ing a Base UI `Tooltip` at all (eager server id,
no client id).

**Position:** `<Dialog open={open}>…` rendered unconditionally, and
`<SidebarMenuButton tooltip={…}>` in an SSR'd tree. Fix:
`{open ? <Dialog open …> : null}` (mount-on-open), and a
`useSyncExternalStore(empty, () => true, () => false)` hydration gate before
attaching `tooltip`.

**Principle:** diagnose a useId mismatch by *which side varies*: hold the
page constant and vary sibling content — if the server id moves and the
client id doesn't, the culprit is an earlier sibling consuming ids
asymmetrically, not the component named in the error. Closed overlays are
render-nothing but not hook-nothing; don't SSR what the server renders
nothing for (kin to "emptiness is not absence" — presence in the tree is
itself state).

**Action:** UNN-574 (planner runner mounts all five dialogs on open; rail
tooltips gate on hydration, both documented inline). Check other SSR'd
surfaces (builder shell tooltips) if the warning ever resurfaces there.
