/**
 * Currency bounds (PRD §7.7). A single gold-piece pool, clamped to
 * `[0, MAX_CURRENCY]`. Lives in the pure game layer so the Server Action's
 * validation, the persistence clamp, and the client's optimistic clamp all
 * share one source of truth.
 */
export const MAX_CURRENCY = 99_999_999
