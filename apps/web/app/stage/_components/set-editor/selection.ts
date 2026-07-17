import type { LintFinding } from "@/domain/template-set/authoring"

/**
 * The Set editor's selection — which detail view the inset shows. Templates and
 * tables are slices of one autosaved blob, so selection is **not** a route
 * segment (a segment navigation would remount the editor's single client tree
 * and race pending debounced saves); it rides the `?item=` search param, the
 * same mechanism as the NPC page's `?doc=` pane selection. `settings` is the
 * landing view — the set-level knobs are the only view an empty set can show.
 */
export type SetEditorSelection =
  | { kind: "settings" }
  | { kind: "template"; key: string }
  | { kind: "table"; key: string }

/** Serializes a selection into the `?item=` param value (`settings` omits it). */
export function selectionToParam(selection: SetEditorSelection): string | null {
  if (selection.kind === "settings") return null
  return `${selection.kind}:${selection.key}`
}

/** Parses `?item=` back into a selection, falling back to `settings` for an
 *  absent or malformed value (a stale deep link must not crash the editor). */
export function selectionFromParam(param: string | null): SetEditorSelection {
  if (!param) return { kind: "settings" }
  const [kind, key] = param.split(":", 2)
  if ((kind === "template" || kind === "table") && key) return { kind, key }
  return { kind: "settings" }
}

/** The selection a lint finding deep-links to (`set`-targeted findings select
 *  the settings view — that's where the connector designation lives). */
export function selectionFromFinding(
  target: LintFinding["target"]
): SetEditorSelection {
  if ((target.kind === "template" || target.kind === "table") && target.key)
    return { kind: target.kind, key: target.key }
  return { kind: "settings" }
}
