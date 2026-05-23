"use client"

import { useCharacter } from "@/hooks/use-character"
import {
  luminaCapFor,
  type PathOfDawnState,
} from "@/lib/game/mechanics/path-of-dawn"

/**
 * Healer — Path of Dawn rendering. Dawn-mode indicator on top, then the list
 * of Illuminated enemies with their Lumina counters. The Lumina cap (per
 * enemy = Luck) is shown alongside each row so the player can see how much
 * room remains. When no enemies are tracked, the body collapses to a hint
 * sentence.
 *
 * Reads the hydrated character from {@link useCharacter} rather than via
 * prop drilling — the registry hands every widget the same `state` argument
 * and lets each one decide whether it needs more context.
 *
 * The inline enemy list is short-term — see the caption — and will migrate
 * into the future initiative tracker.
 */
export function PathOfDawnWidget({ state }: { state: PathOfDawnState }) {
  const character = useCharacter()
  const cap = luminaCapFor(character.attributes.luck)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span
          aria-label={state.dawnMode ? "Dawn Mode active" : "Dawn Mode off"}
          className={
            state.dawnMode
              ? "rounded-md bg-amber-500/15 px-2 py-0.5 text-sm font-medium text-amber-700 dark:text-amber-300"
              : "rounded-md bg-muted px-2 py-0.5 text-sm font-medium text-muted-foreground"
          }
        >
          {state.dawnMode ? "☀ Dawn Mode" : "🌙 Inactive"}
        </span>
        <span className="text-xs text-muted-foreground">
          Lumina cap per enemy: <span className="font-mono">{cap}</span>
        </span>
      </div>

      {state.enemies.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {state.enemies.map((enemy) => (
            <li
              key={enemy.id}
              className="flex items-baseline justify-between rounded-md border border-border px-3 py-1.5 text-sm"
            >
              <span>{enemy.name}</span>
              <span className="font-mono text-muted-foreground">
                {enemy.lumina} Lumina
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No Illuminated enemies. A Light-damage Skill applies Lumina to every
          enemy it hits and enters Dawn Mode.
        </p>
      )}

      <p className="text-xs text-muted-foreground italic">
        Enemy tracking will move into the initiative tracker once it lands.
      </p>
    </div>
  )
}
