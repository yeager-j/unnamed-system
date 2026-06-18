/**
 * The canvas's active authoring tool (UNN-461) — DM-local ephemeral UI state, never
 * persisted. Disambiguates the canvas's overloaded drag/click: `select` drags nodes
 * and pans on empty space, `pan` drags the background from anywhere (nodes locked),
 * `addZone` drops a Zone where you click, `connect` draws a connection between two
 * Zones.
 */
export type ToolMode = "select" | "pan" | "addZone" | "connect"
