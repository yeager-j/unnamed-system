import { SidebarHeader } from "@workspace/ui/components/sidebar"

import { BUILDER_STEPS, indexOfStep } from "@/domain/character/builder-steps"

const ANIMUS_STEP = BUILDER_STEPS[indexOfStep("animus")!]!

/**
 * The builder's Animus rail header: the Movement-3 chapter header (Roman
 * numeral, "Animus", framing line) relocated from `BuilderShell`'s top into the
 * sidebar so the main pane is free for the document. This is the builder's
 * `header` slot for the shared {@link WriterSidebar}; the sheet's `/animus`
 * route supplies its own.
 */
export function BuilderAnimusSidebarHeader() {
  return (
    <SidebarHeader className="gap-3 px-4 pt-6 pb-4">
      <span
        aria-hidden
        className="font-mono text-xs text-sidebar-foreground/60 uppercase"
      >
        {ANIMUS_STEP.romanNumeral}
      </span>
      <h1 className="font-display text-3xl font-semibold text-sidebar-foreground">
        {ANIMUS_STEP.label}
      </h1>
      {ANIMUS_STEP.framingLine ? (
        <p className="font-heading text-sm text-sidebar-foreground/70 italic">
          {ANIMUS_STEP.framingLine}
        </p>
      ) : null}
    </SidebarHeader>
  )
}
