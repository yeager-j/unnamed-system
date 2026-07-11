/**
 * The canvas's active authoring tool (UNN-461) — DM-local ephemeral UI state, never
 * persisted. `select` is the neutral default (scroll to pan, drag to box-select —
 * no dedicated tool button); `addZone` drops a Zone where you click; `connect`
 * draws a connection between two Zones. The Zone/Connect toolbar buttons toggle
 * back to `select`.
 */
export type ToolMode = "select" | "addZone" | "connect"
