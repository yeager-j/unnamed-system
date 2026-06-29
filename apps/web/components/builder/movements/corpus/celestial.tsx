/**
 * Celestial line motif — the brand's "mystical theater" register, drawn from
 * the tarot-deck visual language. A four-point sparkle used sparingly as a
 * gilt flourish on brand surfaces (section headers, the chosen card), never on
 * the dense working UI. Rendered in `currentColor` so callers set the gold.
 */
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 0c.55 6.3 5.7 11.45 12 12-6.3.55-11.45 5.7-12 12-.55-6.3-5.7-11.45-12-12C6.3 11.45 11.45 6.3 12 0Z" />
    </svg>
  )
}
