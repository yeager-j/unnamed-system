import type { ConnectionFogState } from "@workspace/game-v2/spatial"

/**
 * The **decided-once** mapping from a connection's fog/secrecy/lock model to the
 * rim-notch's two composable visual channels (UNN-633, §D4). It lives in
 * `domain/map/view/` because it reads engine shapes ({@link ConnectionFogState});
 * the engine-free kit receives the finished {@link ThresholdState}.
 *
 * The two channels are orthogonal, so they compose without a combinatorial enum:
 * - **border** carries knowledge — `open` (solid jambs), `secret` (dashed, a
 *   deliberately-hidden passage — **DM surfaces only**), `unmapped` (dotted at
 *   reduced opacity, leads somewhere uncharted).
 * - **locked** adds the padlock glyph on top of any border (a locked secret door
 *   renders dashed *and* padlocked).
 *
 * `secret` is DM-only **by redaction**, not by a surface flag: the watch payload
 * never carries `hidden`, so a player-side connection resolves to `open` naturally.
 */

/** The notch's non-color knowledge channel. */
export type ThresholdBorder = "open" | "secret" | "unmapped"

/** The finished visual state the kit renders — border style + the composable padlock. */
export type ThresholdState = { border: ThresholdBorder; locked: boolean }

/**
 * Derive the notch state from a connection's fog + secrecy + lock. The template editor
 * has no fog, so it passes `fog: "revealed"`; the dungeon surfaces pass the live
 * {@link ConnectionFogState}. A connection players can see (`revealed`) is `open`;
 * one they can't is `secret` when authored hidden, else `unmapped`.
 */
export function thresholdStateOf(input: {
  fog: ConnectionFogState | "revealed"
  hidden: boolean
  locked: boolean
}): ThresholdState {
  const border: ThresholdBorder =
    input.fog === "revealed" ? "open" : input.hidden ? "secret" : "unmapped"
  return { border, locked: input.locked }
}
