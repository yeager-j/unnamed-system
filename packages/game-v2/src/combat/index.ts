// Scaffolded by UNN-499 (D33: one folder per PR). The `combat` domain —
// attack/damage/affinity resolvers, side effects — is populated by its own PR
// (UNN-505 / PR7). PR4 (UNN-502) seeds the resolved `pendingEffects` read-unit
// here — the combat-effects bag `resolve` surfaces for those resolvers to consume.
export * from "./resolved"
