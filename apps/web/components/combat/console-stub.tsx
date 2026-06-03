import type { EncounterRow } from "@/lib/db/schema/encounter"

/**
 * Placeholder for the live DM combat console (`status: "live"`). The real
 * tracker body — turn order, the combatant panel, Zones/engagement, prompts —
 * is Phase 5 (UNN-332+); UNN-335 only proves the route forks to it once the
 * `startCombat` transition flips the status. Kept deliberately thin.
 */
export function CombatConsoleStub({ encounter }: { encounter: EncounterRow }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
      <header>
        <h1 className="font-heading text-lg font-medium">{encounter.name}</h1>
        <p className="text-sm text-muted-foreground">
          Combat live — round {encounter.session.round}
        </p>
      </header>
      <div
        className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
        data-testid="combat-console-stub"
      >
        Combat console — built in Phase 5.
      </div>
    </main>
  )
}
