// The `combat` domain (UNN-505 / PR7): attack-roll + damage-bonus resolvers, the
// attack/range/side-effect vocab+schema the Item/Skill shapes embed, and the
// side-effect reference table. PR4 (UNN-502) seeded the resolved `pendingEffects`
// read-unit (`./resolved`) the resolvers consume. Affinity multipliers and
// side-effect *activation* are intentionally absent — both are DM-adjudicated.
export * from "./attack-roll"
export * from "./attack.schema"
export * from "./damage-bonus"
export * from "./formula"
export * from "./party"
export * from "./resolved"
export * from "./side-effects"
