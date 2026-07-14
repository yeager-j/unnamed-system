import type { Completion } from "@codemirror/autocomplete"
import type { Icon } from "@phosphor-icons/react"

export interface CompletionPresentation {
  icon: Icon
  /** Tint the icon with the primary text color (e.g. world-web NPC rows). */
  emphasized?: boolean
}

const presentations = new WeakMap<Completion, CompletionPresentation>()

/**
 * Associates app-owned visuals with a CodeMirror-owned completion row. CM6's
 * `Completion` carries no icon-component slot, and the controlled shadcn menu
 * renders rows it did not create — this registry is the seam between the two.
 * A completion source registers each row it builds; the menu reads the
 * presentation back by object identity.
 */
export function registerCompletionPresentation(
  completion: Completion,
  presentation: CompletionPresentation
): void {
  presentations.set(completion, presentation)
}

/** The registered visuals for a completion row, or null for unregistered rows (rendered without an icon). */
export function completionPresentationOf(
  completion: Completion
): CompletionPresentation | null {
  return presentations.get(completion) ?? null
}
