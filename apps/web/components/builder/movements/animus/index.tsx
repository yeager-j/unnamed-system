import { WriterPane } from "./writer-pane"

/**
 * Movement 3 — Animus (UNN-211). Renders the writer view's main pane.
 *
 * The sidebar half lives in
 * {@link import("../builder-provider-shell.tsx").BuilderProviderShell} so
 * the rail persists across intra-builder navigation (the layout doesn't
 * unmount on step change). This component owns the pane only; the pane reads
 * the draft from `useBuilderDraft()` (UNN-252).
 */
export function AnimusStep() {
  return <WriterPane />
}
