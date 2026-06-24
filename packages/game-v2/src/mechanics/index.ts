// The `mechanics` domain (PR4 — UNN-502): the engine-owned registry, the durable
// `Mechanics` component + persisted state union, the 9 MVP mechanic modules (each
// owning its own state schema + behavior), and the Bard zone-enchantment behavior.
// See D17/D36 and docs/engine-v2. The cross-domain `resolveEntity` pipeline lives
// at the package root; the resolved `pendingEffects` read-unit lives in `combat/`.
export * from "./active-mechanic"
export * from "./definition"
export * from "./mechanics.schema"
export * from "./registry"
export * from "./reset"
export * from "./zone-enchantment"
export * from "./zone-enchantment.schema"

export * from "./warrior/perfection"
export * from "./knight/valor"
export * from "./berserker/frenzy"
export * from "./mage/stains"
export * from "./healer/path-of-dawn"
export * from "./warlock/path-of-dusk"
export * from "./thief/thiefs-insight"
export * from "./thief/elemental-larceny"
export * from "./bard/enchantment"
